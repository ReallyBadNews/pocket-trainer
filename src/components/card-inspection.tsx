import { requireOptionalNativeModule } from 'expo';
import type { ExpoWebGLRenderingContext, GLView as GLViewType } from 'expo-gl';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cardImage } from '@/lib/catalog';
import {
  cardBack,
  cardSurface,
  clampCardPose,
  DEFAULT_CARD_POSE,
  flippedCardPose,
  inspectionImageSources,
  isCardBackVisible,
  type CardPose,
} from '@/lib/card-inspection';
import { createCardRenderer, type CardRenderer } from '@/lib/card-renderer';
import { FINISH_LABELS, type Card, type Finish } from '@/lib/model';
import { boundPhotoOffset, fitPhoto } from '@/lib/photo-geometry';
import { C, CardArt, IconButton, pressFx, Segmented, ToolbarAction, Txt, tick } from './pokedex-ui';

// Older development clients can still inspect the flat artwork while awaiting a native rebuild.
const NativeGLView =
  Platform.OS === 'web' || requireOptionalNativeModule('ExpoGL')
    ? (require('expo-gl').GLView as typeof GLViewType)
    : null;

const BACKS = {
  international: require('../../assets/crafted/card-backs/international.jpg'),
  'japanese-modern': require('../../assets/crafted/card-backs/japanese-modern.jpg'),
};

const VIEWS = [
  { id: 'model', label: '3D' },
  { id: 'photo', label: 'Photo' },
] as const;

export function CardInspection({
  card,
  finish,
  children,
  disabled = false,
}: {
  card: Card;
  finish: Finish;
  children: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Inspect ${card.name} card`}
        accessibilityHint="Opens the full card. Drag to turn it or pinch to zoom."
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => {
          tick();
          setOpen(true);
        }}
        style={(state) => [{ alignItems: 'center' }, pressFx(state)]}
      >
        {children}
        <Txt variant="caption" muted style={s.openHint}>
          Tap to inspect
        </Txt>
      </Pressable>
      <Modal visible={open} animationType={reduced ? 'none' : 'fade'} onRequestClose={() => setOpen(false)}>
        {open && <CardInspector card={card} finish={finish} onClose={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function CardInspector({ card, finish, onClose }: { card: Card; finish: Finish; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<'model' | 'photo'>(NativeGLView ? 'model' : 'photo');
  const [failed, setFailed] = useState(false);
  const [flatReset, setFlatReset] = useState(0);
  const [ready, setReady] = useState(false);
  const [hasBack, setHasBack] = useState(false);
  const [backVisible, setBackVisible] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const runtime = useRef<CardRenderer | null>(null);
  const pose = useRef<CardPose>({ ...DEFAULT_CARD_POSE });
  const dragStart = useRef<CardPose>({ ...DEFAULT_CARD_POSE });
  const pinchStart = useRef(1);
  const back = cardBack(card);
  const surface = cardSurface(card, finish);
  const backSource = BACKS[back];

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        pose.current = runtime.current?.getPose() ?? pose.current;
        runtime.current?.dispose();
        runtime.current = null;
      }

      setActive(state === 'active');
    });

    return () => {
      subscription.remove();
      runtime.current?.dispose();
      runtime.current = null;
    };
  }, []);
  useEffect(() => {
    if (mode === 'photo') {
      pose.current = runtime.current?.getPose() ?? pose.current;
      runtime.current?.dispose();
      runtime.current = null;
    }
  }, [mode, active]);

  function setPose(next: CardPose, animated = false) {
    pose.current = clampCardPose(next);
    runtime.current?.setPose(pose.current, animated && !reduced);
  }

  function announcePose() {
    setBackVisible(isCardBackVisible(pose.current));
  }

  function flip() {
    setPose(flippedCardPose(runtime.current?.getPose() ?? pose.current), true);
    announcePose();
  }

  function reset() {
    setPose({ ...DEFAULT_CARD_POSE }, true);
    setBackVisible(false);
    setFlatReset((n) => n + 1);
  }

  function createContext(gl: ExpoWebGLRenderingContext) {
    runtime.current?.dispose();
    setReady(false);
    setBackVisible(isCardBackVisible(pose.current));
    runtime.current = createCardRenderer(gl, {
      frontSources: inspectionImageSources(card, cardImage(card, true)),
      backSource,
      surface,
      pose: pose.current,
      onReady: (available) => {
        setHasBack(available);
        setReady(true);
      },
      onError: () => {
        setFailed(true);
        setMode('photo');
      },
    });
  }

  const pan = Gesture.Pan()
    .maxPointers(1)
    .minDistance(1)
    .runOnJS(true)
    .onStart(() => {
      dragStart.current = runtime.current?.getPose() ?? pose.current;
    })
    .onUpdate((e) =>
      setPose({
        ...dragStart.current,
        yaw: dragStart.current.yaw + e.translationX * 0.012,
        pitch: dragStart.current.pitch + e.translationY * 0.007,
      }),
    )
    .onFinalize(announcePose);

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => {
      pinchStart.current = runtime.current?.getPose().zoom ?? pose.current.zoom;
    })
    .onUpdate((e) => setPose({ ...pose.current, zoom: pinchStart.current * e.scale }));

  const title =
    mode === 'photo'
      ? `${FINISH_LABELS[finish]} · Flat photo`
      : backVisible
        ? !hasBack
          ? 'Back artwork unavailable'
          : 'Standard back preview'
        : `${FINISH_LABELS[finish]}${surface !== 'paper' ? ' · Finish preview' : ''}`;

  return (
    <GestureHandlerRootView
      accessibilityViewIsModal
      style={[
        s.root,
        {
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, 12),
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <View style={s.header}>
        <View style={s.identity}>
          <Txt accessibilityRole="header" variant="subtitle" style={s.title}>
            {card.name}
          </Txt>
          <Txt accessibilityLiveRegion="polite" variant="caption" style={s.muted}>
            {title}
          </Txt>
        </View>
        <IconButton round dark icon="close" label="Close card viewer" onPress={onClose} />
      </View>
      {/* Both views stay visible with the current one selected, like the camera's mode switch. */}
      {NativeGLView && !failed && (
        <Segmented dark label="Card view" options={VIEWS} value={mode} onChange={setMode} style={s.views} />
      )}
      {mode === 'model' && NativeGLView ? (
        <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
          <View
            collapsable={false}
            style={s.viewport}
            onLayout={() => runtime.current?.setPose(pose.current)}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`${card.name} card, ${backVisible ? 'back' : 'front'}`}
            accessibilityHint="Swipe up or down to turn the card. Additional actions flip, tilt and reset it."
            accessibilityActions={[
              { name: 'increment', label: 'Turn right' },
              { name: 'decrement', label: 'Turn left' },
              { name: 'tiltUp', label: 'Tilt up' },
              { name: 'tiltDown', label: 'Tilt down' },
              { name: 'flip', label: 'Flip card' },
              { name: 'reset', label: 'Reset card' },
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
              <CardCanvasBoundary
                onError={() => {
                  setFailed(true);
                  setMode('photo');
                }}
              >
                <NativeGLView
                  style={StyleSheet.absoluteFill}
                  msaaSamples={4}
                  onContextCreate={createContext}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
              </CardCanvasBoundary>
            )}
            {!ready && active && (
              <View pointerEvents="none" style={s.loading}>
                <ActivityIndicator color={C.paper} />
                <Txt variant="caption" style={s.muted}>
                  Opening the card…
                </Txt>
              </View>
            )}
          </View>
        </GestureDetector>
      ) : (
        <FlatCardPhoto key={flatReset} card={card} />
      )}
      <View style={s.footer}>
        <Txt variant="caption" style={[s.muted, s.center]}>
          {mode === 'model' ? 'Drag to turn · Pinch to zoom' : 'Drag to move · Pinch to zoom'}
        </Txt>
        <View style={s.controls}>
          {mode === 'model' && <ToolbarAction title="Flip" color={C.paper} onPress={flip} />}
          <ToolbarAction title="Reset" color={C.paper} onPress={reset} />
        </View>
        {mode === 'model' && surface !== 'paper' && (
          <Txt variant="caption" style={[s.note, s.center]}>
            Illustrative foil. Patterns vary by printing.
          </Txt>
        )}
      </View>
    </GestureHandlerRootView>
  );
}

/** Context creation can fail before Expo calls onContextCreate (e.g. WebGL disabled). */
class CardCanvasBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
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

/** A readable photograph stays available beside the model, with no synthetic finish. */
function FlatCardPhoto({ card }: { card: Card }) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const scale = useSharedValue(1),
    startScale = useSharedValue(1);

  const x = useSharedValue(0),
    y = useSharedValue(0);

  const anchorX = useSharedValue(0),
    anchorY = useSharedValue(0),
    pinching = useSharedValue(false);

  const { width, height } = size,
    fitted = fitPhoto(width, height, 63 / 88);

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      pinching.value = true;
      startScale.value = scale.value;
      anchorX.value = (e.focalX - width / 2 - x.value) / scale.value;
      anchorY.value = (e.focalY - height / 2 - y.value) / scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(5, startScale.value * e.scale));
      x.value = boundPhotoOffset(e.focalX - width / 2 - anchorX.value * scale.value, fitted.width, width, scale.value);
      y.value = boundPhotoOffset(
        e.focalY - height / 2 - anchorY.value * scale.value,
        fitted.height,
        height,
        scale.value,
      );
    })
    .onFinalize(() => {
      pinching.value = false;
    });

  const pan = Gesture.Pan()
    .maxPointers(1)
    .onChange((e) => {
      if (pinching.value) return;
      x.value = boundPhotoOffset(x.value + e.changeX, fitted.width, width, scale.value);
      y.value = boundPhotoOffset(y.value + e.changeY, fitted.height, height, scale.value);
    });

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan)}>
      <View
        collapsable={false}
        style={s.viewport}
        onLayout={(e) => {
          setSize(e.nativeEvent.layout);
          scale.value = 1;
          x.value = 0;
          y.value = 0;
        }}
      >
        {width > 0 && height > 0 && (
          <Animated.View style={[{ width, height, justifyContent: 'center', alignItems: 'center' }, animated]}>
            <CardArt card={card} high style={{ width: fitted.width, height: fitted.height }} />
          </Animated.View>
        )}
      </View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  openHint: { marginTop: 6, fontWeight: '600' },
  root: { flex: 1, backgroundColor: C.ink },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16 },
  identity: { flex: 1, minWidth: 0, gap: 4 },
  title: { color: C.paper },
  muted: { color: '#BED0C0' },
  note: { color: '#94AA98', paddingHorizontal: 20 },
  viewport: { flex: 1, minHeight: 0, overflow: 'hidden', marginHorizontal: 12 },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  views: { marginHorizontal: 20, marginBottom: 12 },
  footer: { paddingTop: 12, gap: 4 },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
  center: { textAlign: 'center' },
});
