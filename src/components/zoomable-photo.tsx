import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { boundPhotoOffset as bound, fitPhoto } from '@/lib/photo-geometry';
import { Button, IconButton, Txt } from './pokedex-ui';

export function ZoomablePhoto({ label, children, aspectRatio, renderPhoto }: {
  label: string; children: ReactNode; aspectRatio: number; renderPhoto: (width: number, height: number) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Enlarge ${label}`} accessibilityHint="Opens a photo viewer with pinch to zoom" onPress={() => setOpen(true)} style={{ alignItems: 'center' }}>
      {children}
      <Txt style={{ fontSize: 12, color: '#526B50', marginTop: 6 }}>Tap to zoom</Txt>
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
  function zoom(factor: number) {
    scale.value = Math.max(1, Math.min(5, scale.value * factor));
    x.value = bound(x.value, fitted.width, width, scale.value);
    y.value = bound(y.value, fitted.height, height, scale.value);
  }
  function reset() { scale.value = 1; x.value = 0; y.value = 0; }
  return <GestureHandlerRootView style={[styles.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }]}>
    <View style={styles.header}><Txt numberOfLines={2} style={{ color: 'white', flex: 1 }}>{label}</Txt><IconButton icon="close" label="Close photo viewer" color="white" onPress={onClose} /></View>
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan)}>
      <View collapsable={false} style={styles.viewport} onLayout={e => { setSize(e.nativeEvent.layout); reset(); }}>
        {width > 0 && height > 0 && <Animated.View style={[{ width, height, alignItems: 'center', justifyContent: 'center' }, animated]}>{renderPhoto(fitted.width || width, fitted.height || height)}</Animated.View>}
      </View>
    </GestureDetector>
    <Txt style={styles.hint}>Pinch to zoom · Drag to explore</Txt>
    <View style={styles.controls}><Button title="Zoom out" secondary onPress={() => zoom(1 / 1.5)} /><Button title="Reset" secondary onPress={reset} /><Button title="Zoom in" secondary onPress={() => zoom(1.5)} /></View>
  </GestureHandlerRootView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#14201C' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12, minHeight: 56 },
  viewport: { flex: 1, overflow: 'hidden' },
  hint: { color: '#D6E3CB', textAlign: 'center', fontSize: 13, marginVertical: 12 },
  controls: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12 },
});
