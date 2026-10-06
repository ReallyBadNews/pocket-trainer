import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A stable function that always calls the latest `handler`. Use it for gesture and responder callbacks: the React
 * Compiler can't tell that a function handed to `Gesture.Pan().onStart(...)` or `PanResponder.create(...)` only runs
 * on a later touch, so it treats any ref read inside as a read during render.
 */
export function useEventHandler<Args extends readonly unknown[], Result>(
  handler: (...args: Args) => Result,
): (...args: Args) => Result {
  const latest = useRef(handler);

  useLayoutEffect(() => {
    latest.current = handler;
  });

  return useCallback((...args: Args) => latest.current(...args), []);
}
