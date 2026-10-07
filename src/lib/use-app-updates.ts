import * as Updates from 'expo-updates';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  CHECK_DURING_SESSION,
  isNewSession,
  SESSION_WINDOW,
  updateOffer,
  updateStep,
  type UpdateStep,
} from './app-updates';
import { readUpdateRestart, writeUpdateRestart } from './storage';

// Matches the launch splash, so a restart looks like opening the app.
const RELOAD_SCREEN = {
  backgroundColor: '#C93240',
  fade: true,
  spinner: { enabled: true, color: '#FFFFFF', size: 'large' as const },
};

// Rollbacks carry no update id; their publish time identifies them instead.
const idOf = (info?: Updates.UseUpdatesReturnType['availableUpdate']) =>
  info && (info.updateId ?? `rollback-${info.createdAt.getTime()}`);

// Development clients report expo-updates as enabled, but its check and reload calls only work in release builds.
const enabled = Updates.isEnabled && !__DEV__;

const checkAndDownload = () =>
  Updates.checkForUpdateAsync()
    .then((result) => (result.isAvailable || result.isRollBackToEmbedded ? Updates.fetchUpdateAsync() : undefined))
    .catch(() => {
      /* Offline or the server is busy; the next check tries again. */
    });

export type AppUpdates = {
  step: UpdateStep;
  /** A newer update is out, but the session already started, so it waits unless someone installs it from Settings. */
  ready: boolean;
  /** Downloads the update if needed, then restarts into it. */
  install: () => Promise<void>;
};

/**
 * Applies a newly published update when the app opens or comes back after a while, instead of on the second cold
 * start. On launch, expo-updates' own startup check does the downloading; on return, this checks the server itself.
 * During a session it keeps checking now and then; anything found waits for the next session, or for someone to
 * install it from Settings.
 */
export function useAppUpdates(idle: boolean): AppUpdates {
  const {
    currentlyRunning,
    availableUpdate,
    downloadedUpdate,
    isDownloading,
    isUpdatePending,
    isStartupProcedureRunning,
  } = Updates.useUpdates();

  const [session, setSession] = useState(0);
  const [sessionOpen, setSessionOpen] = useState(true);
  // `undefined` until the saved value loads; restarts wait for it.
  const [restartedFor, setRestartedFor] = useState<string | null>();
  const starting = useRef(isStartupProcedureRunning);
  useEffect(() => {
    starting.current = isStartupProcedureRunning;
  }, [isStartupProcedureRunning]);

  useEffect(() => {
    if (enabled) readUpdateRestart().then(setRestartedFor, () => setRestartedFor(null));
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setSessionOpen(false), SESSION_WINDOW);

    return () => clearTimeout(timer);
  }, [session]);
  useEffect(() => {
    if (!enabled) return;
    let backgroundedAt: number | undefined;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt = Date.now();

        return;
      }

      if (state !== 'active') return;
      const fresh = isNewSession(backgroundedAt, Date.now());
      backgroundedAt = undefined;

      if (!fresh || starting.current) return;
      setSessionOpen(true);
      setSession((n) => n + 1);
      checkAndDownload();
    });

    // Updates found during a session wait in the background, so Settings can offer them.
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && !starting.current) checkAndDownload();
    }, CHECK_DURING_SESSION);

    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, []);

  const pending = isUpdatePending ? idOf(downloadedUpdate) : undefined;

  const status = {
    running: currentlyRunning.updateId,
    available: idOf(availableUpdate),
    downloading: isDownloading,
    pending,
  };

  const step = updateStep(status, { idle, sessionOpen, restartedFor });
  const offer = enabled ? updateOffer(status, restartedFor) : undefined;

  useEffect(() => {
    if (step !== 'restart' || !pending) return;
    // Recorded first, so a restart into a broken update can't repeat.
    writeUpdateRestart(pending)
      .then(() => Updates.reloadAsync({ reloadScreenOptions: RELOAD_SCREEN }))
      .catch(() => setRestartedFor(pending));
  }, [step, pending]);

  async function install() {
    if (!offer) return;

    if (offer !== pending) {
      const result = await Updates.fetchUpdateAsync();

      if (!result.isNew && !result.isRollBackToEmbedded) return;
    }

    await writeUpdateRestart(offer);
    await Updates.reloadAsync({ reloadScreenOptions: RELOAD_SCREEN });
  }

  return { step, ready: !!offer, install };
}
