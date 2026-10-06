import { requireOptionalNativeModule } from 'expo';
import type { ExpoWebGLRenderingContext, GLView as GLViewType } from 'expo-gl';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  type GestureUpdateEvent,
  type PanGestureHandlerEventPayload,
  type PinchGestureHandlerEventPayload,
} from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEventHandler } from '@/hooks/use-event-handler';
import type { Badge } from '@/lib/badges';
import {
  clampBadgePose,
  DEFAULT_BADGE_POSE,
  flippedBadgePose,
  isBadgeBackVisible,
  type BadgePose,
} from '@/lib/badge-geometry';
import { createBadgeRenderer, type BadgeRenderer } from '@/lib/badge-renderer';
import { BadgeArtwork } from './badge-artwork';
import { C, IconButton, ToolbarAction, Txt } from './pokedex-ui';

// SAFETY: expo-gl exports GLView; it is required only once the native module is known to exist.
const NativeGLView =
  Platform.OS === 'web' || requireOptionalNativeModule('ExpoGL')
    ? (require('expo-gl').GLView as typeof GLViewType)
    : null;

export function BadgeInspection({ badge, onClose }: { badge: Badge; onClose: () => void }) {
  const reduced = useReducedMotion();

  return (
    <Modal visible animationType={reduced ? 'none' : 'fade'} onRequestClose={onClose}>
      <BadgeInspector badge={badge} onClose={onClose} />
    </Modal>
  );
}

function BadgeInspector({ badge, onClose }: { badge: Badge; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [failed, setFailed] = useState(!NativeGLView);
  const [ready, setReady] = useState(false);
  const [back, setBack] = useState(false);
  const runtime = useRef<BadgeRenderer | null>(null);
  const pose = useRef<BadgePose>({ ...DEFAULT_BADGE_POSE });
  const dragStart = useRef<BadgePose>({ ...DEFAULT_BADGE_POSE });
  const pinchStart = useRef(1);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        pose.current = clampBadgePose(runtime.current?.getPose() ?? pose.current);
        setBack(isBadgeBackVisible(pose.current));
        runtime.current?.dispose();
        runtime.current = null;
      }

      setActive(state === 'active');
    });

    return () => {
      mounted.current = false;
      subscription.remove();
      runtime.current?.dispose();
      runtime.current = null;
    };
  }, []);

  function setPose(next: BadgePose, animated = false) {
    pose.current = clampBadgePose(next);
    runtime.current?.setPose(pose.current, animated && !reduced);
  }

  function announcePose() {
    setBack(isBadgeBackVisible(pose.current));
  }

  function beginGesture() {
    // Interrupt toolbar transitions at the orientation currently on screen.
    pose.current = clampBadgePose(runtime.current?.getPose() ?? pose.current);
    runtime.current?.setPose(pose.current);
    announcePose();

    return pose.current;
  }

  function flip() {
    setPose(flippedBadgePose(runtime.current?.getPose() ?? pose.current), true);
    announcePose();
  }

  function reset() {
    setPose({ ...DEFAULT_BADGE_POSE }, true);
    setBack(false);
  }

  function createContext(gl: ExpoWebGLRenderingContext) {
    if (!mounted.current) return;
    pose.current = clampBadgePose(runtime.current?.getPose() ?? pose.current);
    announcePose();
    runtime.current?.dispose();
    setReady(false);
    runtime.current = createBadgeRenderer(gl, {
      emblem: badge.emblem,
      pose: pose.current,
      onReady: () => {
        if (mounted.current) setReady(true);
      },
      onError: () => {
        if (mounted.current) setFailed(true);
      },
    });
  }

  const startDrag = useEventHandler(() => {
    dragStart.current = beginGesture();
  });

  const drag = useEventHandler((event: GestureUpdateEvent<PanGestureHandlerEventPayload>) =>
    setPose({
      ...pose.current,
      yaw: dragStart.current.yaw + event.translationX * 0.012,
      pitch: dragStart.current.pitch + event.translationY * 0.007,
    }),
  );

  const endGesture = useEventHandler(announcePose);

  const startPinch = useEventHandler(() => {
    pinchStart.current = beginGesture().zoom;
  });

  const pinchTo = useEventHandler((event: GestureUpdateEvent<PinchGestureHandlerEventPayload>) =>
    setPose({ ...pose.current, zoom: pinchStart.current * event.scale }),
  );

  const pan = Gesture.Pan()
    .maxPointers(1)
    .minDistance(1)
    .runOnJS(true)
    .onStart(startDrag)
    .onUpdate(drag)
    .onFinalize(endGesture);

  const pinch = Gesture.Pinch().runOnJS(true).onStart(startPinch).onUpdate(pinchTo).onFinalize(endGesture);

  return (
    <GestureHandlerRootView
      accessibilityViewIsModal
      style={[
        s.root,
        {
          paddingTop: insets.top,
          paddingBottom: Math.max(12, insets.bottom),
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <View style={s.header}>
        <View style={s.identity}>
          <Txt accessibilityRole="header" variant="subtitle" style={s.light}>
            {badge.name}
          </Txt>
          <Txt variant="caption" style={s.muted}>
            Earned badge
          </Txt>
        </View>
        <IconButton icon="close" round dark label="Close badge viewer" onPress={onClose} />
      </View>
      {!failed && NativeGLView ? (
        <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
          <View
            collapsable={false}
            style={s.viewport}
            onLayout={() => runtime.current?.redraw()}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`${badge.name} badge, ${back ? 'back with pin clasp' : 'enamel front'}`}
            accessibilityHint="Swipe up or down to turn the badge. Actions also tilt, flip and reset it."
            accessibilityActions={[
              { name: 'increment', label: 'Turn right' },
              { name: 'decrement', label: 'Turn left' },
              { name: 'tiltUp', label: 'Tilt up' },
              { name: 'tiltDown', label: 'Tilt down' },
              { name: 'flip', label: 'Flip badge' },
              { name: 'reset', label: 'Reset badge' },
            ]}
            onAccessibilityAction={({ nativeEvent: { actionName } }) => {
              if (actionName === 'flip') flip();
              else if (actionName === 'reset') reset();
              else {
                setPose({
                  ...pose.current,
                  yaw: pose.current.yaw + (actionName === 'increment' ? 0.3 : actionName === 'decrement' ? -0.3 : 0),
                  pitch: pose.current.pitch + (actionName === 'tiltUp' ? -0.2 : actionName === 'tiltDown' ? 0.2 : 0),
                });
                announcePose();
              }
            }}
          >
            {active && (
              <BadgeCanvasBoundary onError={() => setFailed(true)}>
                <NativeGLView
                  style={StyleSheet.absoluteFill}
                  msaaSamples={4}
                  onContextCreate={createContext}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
              </BadgeCanvasBoundary>
            )}
            {!ready && active && (
              <View pointerEvents="none" style={s.loading}>
                <ActivityIndicator color={C.paper} />
              </View>
            )}
          </View>
        </GestureDetector>
      ) : (
        <View
          style={s.fallback}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${badge.name} badge artwork`}
        >
          <BadgeArtwork emblem={badge.emblem} size={290} />
        </View>
      )}
      <View style={s.footer}>
        <ScrollView style={s.description} contentContainerStyle={s.descriptionContent}>
          <Txt variant="caption" style={[s.muted, s.center]}>
            {badge.description}
          </Txt>
        </ScrollView>
        <Txt variant="caption" style={[s.muted, s.center]}>
          {failed ? '3D preview is unavailable. Badge artwork is shown.' : 'Drag to turn · Pinch to zoom'}
        </Txt>
        {!failed && (
          <View style={s.controls}>
            <ToolbarAction title="Flip" color={C.paper} onPress={flip} />
            <ToolbarAction title="Reset" color={C.paper} onPress={reset} />
          </View>
        )}
      </View>
    </GestureHandlerRootView>
  );
}

class BadgeCanvasBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ink },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingHorizontal: 20, paddingVertical: 16 },
  identity: { flex: 1, minWidth: 0, gap: 3 },
  light: { color: C.paper },
  muted: { color: '#B9C6B8' },
  center: { textAlign: 'center' },
  viewport: { flex: 1, minHeight: 100 },
  fallback: { flex: 1, minHeight: 100, alignItems: 'center', justifyContent: 'center' },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: 20, paddingBottom: 8, gap: 12 },
  description: { maxHeight: 112 },
  descriptionContent: { paddingHorizontal: 12 },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
});
