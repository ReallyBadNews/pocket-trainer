import * as Updates from 'expo-updates';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isNewSession, SESSION_WINDOW, updateStep, type UpdateStep } from './app-updates';
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

/**
 * Applies a newly published update when the app opens or comes back after a while, instead of on the second cold
 * start. On launch, expo-updates' own startup check does the downloading; on return, this checks the server itself.
 */
export function useAppUpdates(idle: boolean): UpdateStep {
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
      Updates.checkForUpdateAsync()
        .then((result) => (result.isAvailable || result.isRollBackToEmbedded ? Updates.fetchUpdateAsync() : undefined))
        .catch(() => {
          /* Offline or the server is busy; the next session tries again. */
        });
    });

    return () => subscription.remove();
  }, []);

  const pending = isUpdatePending ? idOf(downloadedUpdate) : undefined;

  const step = updateStep(
    { running: currentlyRunning.updateId, available: idOf(availableUpdate), downloading: isDownloading, pending },
    { idle, sessionOpen, restartedFor },
  );

  useEffect(() => {
    if (step !== 'restart' || !pending) return;
    // Recorded first, so a restart into a broken update can't repeat.
    writeUpdateRestart(pending)
      .then(() => Updates.reloadAsync({ reloadScreenOptions: RELOAD_SCREEN }))
      .catch(() => setRestartedFor(pending));
  }, [step, pending]);

  return step;
}
