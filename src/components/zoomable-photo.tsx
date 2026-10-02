import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { boundPhotoOffset as bound, fitPhoto } from '@/lib/photo-geometry';
import { C, IconButton, pressFx, Txt } from './pokedex-ui';

/** `dark` lightens the "Tap to zoom" hint for photos shown on a dark panel. */
export function ZoomablePhoto({ label, children, aspectRatio, renderPhoto, dark = false }: {
  label: string; children: ReactNode; aspectRatio: number; renderPhoto: (width: number, height: number) => ReactNode; dark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Enlarge ${label}`} accessibilityHint="Opens a photo viewer with pinch to zoom" onPress={() => setOpen(true)} style={state => [{ alignItems: 'center' }, pressFx(state)]}>
      {children}
      <Txt variant="caption" style={{ fontWeight: '600', color: dark ? '#A0B296' : '#526B50', marginTop: 6 }}>Tap to zoom</Txt>
    </Pressable>
    <Modal visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
      {open && <PhotoViewer key={aspectRatio} aspectRatio={aspectRatio} label={label} onClose={() => setOpen(false)} renderPhoto={renderPhoto} />}
    </Modal>
  </>;
}

function PhotoViewer({ label, onClose, aspectRatio, renderPhoto }: {
  label: string; onClose: () => void; aspectRatio: number; renderPhoto: (width: number, height: number) => ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const anchorX = useSharedValue(0);
  const anchorY = useSharedValue(0);
  const pinching = useSharedValue(false);
  const width = size.width;
  const height = size.height;
  const fitted = fitPhoto(width, height, aspectRatio);
  const pinch = Gesture.Pinch().onStart(e => {
    pinching.value = true;
    startScale.value = scale.value;
    anchorX.value = (e.focalX - width / 2 - x.value) / scale.value;
    anchorY.value = (e.focalY - height / 2 - y.value) / scale.value;
  }).onUpdate(e => {
    scale.value = Math.max(1, Math.min(5, startScale.value * e.scale));
    x.value = bound(e.focalX - width / 2 - anchorX.value * scale.value, fitted.width, width, scale.value);
    y.value = bound(e.focalY - height / 2 - anchorY.value * scale.value, fitted.height, height, scale.value);
  }).onFinalize(() => { pinching.value = false; });
  const pan = Gesture.Pan().maxPointers(1).onChange(e => {
    if (pinching.value) return;
    x.value = bound(x.value + e.changeX, fitted.width, width, scale.value);
    y.value = bound(y.value + e.changeY, fitted.height, height, scale.value);
  });
  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));
  function reset() { scale.value = 1; x.value = 0; y.value = 0; }
  return <GestureHandlerRootView style={[styles.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }]}>
    <View style={styles.header}><Txt accessibilityRole="header" variant="subtitle" style={styles.title}>{label}</Txt><IconButton round dark icon="close" label="Close photo viewer" onPress={onClose} /></View>
    <View style={styles.screen}>
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan)}>
      <View collapsable={false} style={styles.viewport} onLayout={e => { setSize(e.nativeEvent.layout); reset(); }}>
        {width > 0 && height > 0 && <Animated.View style={[{ width, height, alignItems: 'center', justifyContent: 'center' }, animated]}>{renderPhoto(fitted.width || width, fitted.height || height)}</Animated.View>}
      </View>
    </GestureDetector>
    <Txt variant="caption" style={styles.hint}>Pinch to zoom</Txt>
    </View>
  </GestureHandlerRootView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.red },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 16, minHeight: 68 },
  title: { color: C.paper, flex: 1, minWidth: 0 },
  screen: { flex: 1, marginHorizontal: 12, borderRadius: 20, borderWidth: 4, borderColor: C.redDark, backgroundColor: C.screen, overflow: 'hidden', paddingTop: 12 },
  viewport: { flex: 1, overflow: 'hidden', marginHorizontal: 10 },
  hint: { color: C.muted, textAlign: 'center', paddingVertical: 12 },
});
