/**
 * When a newly published update replaces the running app. Restarts happen only at the start of a session (a cold
 * launch, or coming back after a while) and never with a card, game or scan open, so an update can't pull the app
 * out from under a child mid-task. Anything that misses that moment applies at the next session start instead.
 */
export const SESSION_WINDOW = 10_000;
/** A quick trip to another app (the camera roll, a message) isn't a new session. */
export const AWAY_FOR_NEW_SESSION = 60_000;

export type UpdateStatus = { running?: string; available?: string; downloading: boolean; pending?: string };
export type UpdateStep = 'none' | 'downloading' | 'restart';

/**
 * `restartedFor` is the update we last restarted into. If that update failed to launch, expo-updates rolls back to
 * the previous one and still reports it as downloaded, so restarting for it again would loop.
 */
export function updateStep(status: UpdateStatus, { idle, sessionOpen, restartedFor }: { idle: boolean; sessionOpen: boolean; restartedFor?: string | null }): UpdateStep {
  if (!idle || !sessionOpen || restartedFor === undefined) return 'none';
  const fresh = (id?: string) => !!id && id !== status.running && id !== restartedFor;
  if (fresh(status.pending)) return 'restart';
  if (status.downloading && fresh(status.available)) return 'downloading';
  return 'none';
}

export const isNewSession = (backgroundedAt: number | undefined, now: number) => backgroundedAt !== undefined && now - backgroundedAt >= AWAY_FOR_NEW_SESSION;
