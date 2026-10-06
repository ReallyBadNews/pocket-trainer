import { createContext, useContext, useEffect, useMemo } from 'react';
import { Platform, type ViewStyle } from 'react-native';
import {
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scrollChromeSnap, scrollChromeStep } from '@/lib/scroll-chrome';

type ScrollChrome = {
  progress: SharedValue<number>;
  viewportHeight: SharedValue<number>;
  distance: number;
  bottomInset: number;
  paused: SharedValue<boolean>;
};

export const ScrollChromeContext = createContext<ScrollChrome | null>(null);

export function useScrollChromeController(distance: number, bottomInset: number) {
  const progress = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const paused = useSharedValue(false);

  return useMemo(
    () => ({ progress, viewportHeight, distance, bottomInset, paused }),
    [progress, viewportHeight, distance, bottomInset, paused],
  );
}

/** Each vertical scroller owns its drag/momentum state; horizontal chips do not participate. */
export function useChromeScroll() {
  const insets = useSafeAreaInsets();
  const chrome = useContext(ScrollChromeContext);

  if (!chrome) throw new Error('Main scrollers require ScrollChromeContext');
  const { progress, viewportHeight, distance, bottomInset, paused } = chrome;
  const offset = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  const dragging = useSharedValue(false);
  const momentum = useSharedValue(false);
  const idle = useSharedValue(0);
  const snapping = useSharedValue(false);
  const web = Platform.OS === 'web';

  useEffect(() => {
    progress.set(0);

    return () => {
      cancelAnimation(idle);
      cancelAnimation(progress);
    };
  }, [idle, progress]);

  // This depends on the full viewport, not the list height changing every frame.
  // Keep the short-page check on the UI thread instead of sending layout events to JS.
  useAnimatedReaction(
    () => !paused.get() && contentHeight.get() > 0 && contentHeight.get() <= viewportHeight.get() + 1,
    (short) => {
      if (short) {
        cancelAnimation(idle);
        progress.set(withTiming(0, { duration: 180 }));
      }
    },
  );

  const settle = () => {
    'worklet';

    if (paused.get()) return;
    cancelAnimation(idle);
    snapping.set(true);
    progress.set(
      withTiming(scrollChromeSnap(progress.get(), offset.get(), distance), { duration: 220 }, () => {
        snapping.set(false);
      }),
    );
  };

  const settleSoon = () => {
    'worklet';
    cancelAnimation(idle);

    if (progress.get() === 0 || progress.get() === 1) return;
    idle.set(0);
    // Web has no drag/momentum callbacks; wait until wheel/touch scrolling is idle.
    idle.set(
      withDelay(
        160,
        withTiming(1, { duration: 0 }, (finished) => {
          if (finished) settle();
        }),
      ),
    );
  };

  const beginDrag = () => {
    'worklet';
    dragging.set(true);
    cancelAnimation(idle);
    cancelAnimation(progress);
    snapping.set(false);
  };

  const endDrag = () => {
    'worklet';
    dragging.set(false);
    settleSoon();
  };

  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: beginDrag,
    onScroll: (event) => {
      if (paused.get()) return;
      const height = event.contentSize.height;
      const viewport = event.layoutMeasurement.height;

      const next = scrollChromeStep(
        progress.get(),
        offset.get(),
        event.contentOffset.y,
        height,
        viewport,
        viewportHeight.get(),
        distance,
      );

      offset.set(next.offset);

      if (snapping.get()) {
        cancelAnimation(progress);
        snapping.set(false);
      }

      progress.set(next.progress);

      if (!dragging.get() && !momentum.get()) settleSoon();
    },
    onEndDrag: endDrag,
    onMomentumBegin: () => {
      momentum.set(true);
      cancelAnimation(idle);
    },
    onMomentumEnd: () => {
      momentum.set(false);
      settle();
    },
  });

  return {
    onScroll,
    scrollEventThrottle: 16,
    // Mobile browsers must not snap while a finger is still held on the list.
    onTouchStart: web ? beginDrag : undefined,
    onTouchEnd: web ? endDrag : undefined,
    onTouchCancel: web ? endDrag : undefined,
    // Prevent browser anchoring from treating responsive reflow as user scrolling.
    style: web ? ({ overflowAnchor: 'none' } as ViewStyle) : undefined,
    // Reserve space for the overlays without resizing the list or reflowing its rows.
    contentContainerStyle: { paddingTop: 20 + distance, paddingBottom: Math.max(40, insets.bottom + 16) + bottomInset },
    contentInsetAdjustmentBehavior: 'never' as const,
    automaticallyAdjustContentInsets: false,
    onContentSizeChange: (_width: number, height: number) => {
      contentHeight.set(height);
    },
  };
}
