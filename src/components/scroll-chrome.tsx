import { createContext, useContext, useEffect, useMemo } from 'react';
import { Platform, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import {
  cancelAnimation, useAnimatedScrollHandler, useSharedValue, withDelay, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scrollChromeSnap, scrollChromeStep } from '@/lib/scroll-chrome';

type ScrollChrome = {
  progress: SharedValue<number>;
  viewportHeight: SharedValue<number>;
  distance: number;
  paused: SharedValue<boolean>;
};
export const ScrollChromeContext = createContext<ScrollChrome | null>(null);

export function useScrollChromeController(distance: number) {
  const progress = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const paused = useSharedValue(false);
  return useMemo(() => ({ progress, viewportHeight, distance, paused }), [progress, viewportHeight, distance, paused]);
}

/** Each vertical scroller owns its drag/momentum state; horizontal chips do not participate. */
export function useChromeScroll() {
  const chrome = useContext(ScrollChromeContext);
  if (!chrome) throw new Error('Main scrollers require ScrollChromeContext');
  const { progress, viewportHeight, distance, paused } = chrome;
  const offset = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  const dragging = useSharedValue(false);
  const momentum = useSharedValue(false);
  const idle = useSharedValue(0);
  const snapping = useSharedValue(false);
  const lastViewport = useSharedValue(0);
  const web = Platform.OS === 'web';

  useEffect(() => {
    progress.value = 0;
    return () => { cancelAnimation(idle); cancelAnimation(progress); };
  }, [idle, progress]);

  const settle = () => {
    'worklet';
    if (paused.value) return;
    cancelAnimation(idle);
    snapping.value = true;
    progress.value = withTiming(scrollChromeSnap(progress.value), { duration: 180 }, () => {
      snapping.value = false;
    });
  };
  const settleSoon = () => {
    'worklet';
    cancelAnimation(idle);
    idle.value = 0;
    // Web has no drag/momentum callbacks; wait until wheel/touch scrolling is idle.
    idle.value = withDelay(160, withTiming(1, { duration: 0 }, finished => {
      if (finished) settle();
    }));
  };
  const beginDrag = () => {
    'worklet';
    dragging.value = true;
    cancelAnimation(idle);
    cancelAnimation(progress);
    snapping.value = false;
  };
  const endDrag = () => {
    'worklet';
    dragging.value = false;
    settleSoon();
  };
  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: beginDrag,
    onScroll: event => {
      if (paused.value) return;
      const height = event.contentSize.height;
      const viewport = event.layoutMeasurement.height;
      const resized = Math.abs(viewport - lastViewport.value) > 1;
      lastViewport.value = viewport;
      const next = scrollChromeStep(progress.value, offset.value, event.contentOffset.y,
        height, viewport, viewportHeight.value, distance);
      offset.value = next.offset;
      // Layout corrections during a snap are not a new upward gesture.
      if (snapping.value && resized) return;
      if (snapping.value) { cancelAnimation(progress); snapping.value = false; }
      progress.value = next.progress;
      if (!dragging.value && !momentum.value) settleSoon();
    },
    onEndDrag: endDrag,
    onMomentumBegin: () => { momentum.value = true; cancelAnimation(idle); },
    onMomentumEnd: () => { momentum.value = false; settle(); },
  });
  return {
    onScroll,
    scrollEventThrottle: 16,
    // Mobile browsers must not snap while a finger is still held on the list.
    onTouchStart: web ? beginDrag : undefined,
    onTouchEnd: web ? endDrag : undefined,
    onTouchCancel: web ? endDrag : undefined,
    // Prevent browser anchoring from treating responsive reflow as user scrolling.
    style: web ? { overflowAnchor: 'none' } as ViewStyle : undefined,
    onContentSizeChange: (_width: number, height: number) => {
      contentHeight.value = height;
      if (!paused.value && height <= viewportHeight.value + 1) {
        cancelAnimation(idle);
        progress.value = withTiming(0, { duration: 180 });
      }
    },
    onLayout: (_event: LayoutChangeEvent) => {
      if (!paused.value && contentHeight.value > 0 && contentHeight.value <= viewportHeight.value + 1) {
        cancelAnimation(idle);
        progress.value = 0;
      }
    },
  };
}
