import { Image } from 'expo-image';
import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { Button, C, Txt, ui } from './pokedex-ui';
import { fullCrop, resizeCrop, type Crop } from '@/lib/scan-types';

export function CardCrop({ photo, initial, onConfirm, onCancel, onDrag }: {
  photo: { uri: string; width: number; height: number }; initial: Crop;
  onConfirm: (crop: Crop) => void; onCancel: () => void; onDrag: (dragging: boolean) => void;
}) {
  const [crop, setCrop] = useState<Crop>(initial);
  const [available, setAvailable] = useState(260);
  const width = Math.min(available, 430 * photo.width / photo.height);
  const height = width * photo.height / photo.width;
  const latest = useRef({ crop, width, height, onDrag }); latest.current = { crop, width, height, onDrag };
  const start = useRef(crop);
  const responders = useMemo(() => [0, 1, 2, 3].map(corner => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { start.current = latest.current.crop; latest.current.onDrag(true); },
    onPanResponderMove: (_, gesture) => setCrop(resizeCrop(start.current, corner, gesture.dx / latest.current.width, gesture.dy / latest.current.height)),
    onPanResponderRelease: () => latest.current.onDrag(false),
    onPanResponderTerminate: () => latest.current.onDrag(false),
    onPanResponderTerminationRequest: () => false,
  })), []);
  const [x, y, w, h] = crop;
  return <View style={{ gap: 14 }}>
    <Txt style={ui.subtitle}>Which card are we reading?</Txt>
    <Txt muted style={{ fontSize: 13 }}>Drag the four dots around one whole card. Keep its name and bottom number inside.</Txt>
    <View style={s.stage} onLayout={event => setAvailable(Math.max(80, event.nativeEvent.layout.width - 44))}>
      <View style={{ width, height }}>
        <Image source={photo.uri} style={{ width, height }} contentFit="fill" accessibilityLabel="Original photo with adjustable card selection" />
        <View pointerEvents="none" style={[s.shade, { top: 0, left: 0, right: 0, height: y * height }]} />
        <View pointerEvents="none" style={[s.shade, { top: (y + h) * height, left: 0, right: 0, bottom: 0 }]} />
        <View pointerEvents="none" style={[s.shade, { top: y * height, left: 0, width: x * width, height: h * height }]} />
        <View pointerEvents="none" style={[s.shade, { top: y * height, left: (x + w) * width, right: 0, height: h * height }]} />
        <View pointerEvents="none" style={{ position: 'absolute', left: x * width, top: y * height, width: w * width, height: h * height, borderWidth: 2, borderColor: C.gold }} />
        {responders.map((responder, i) => <View key={i} {...responder.panHandlers} accessibilityLabel={`Crop ${i < 2 ? 'top' : 'bottom'} ${i % 2 ? 'right' : 'left'} corner`} style={[s.handle, { left: (x + (i % 2 ? w : 0)) * width - 22, top: (y + (i > 1 ? h : 0)) * height - 22 }]}><View style={s.dot} /></View>)}
      </View>
    </View>
    <Button title="Read this card" icon="scan" onPress={() => onConfirm(crop)} />
    <View style={ui.row}><Button title="Whole photo" secondary onPress={() => setCrop(fullCrop)} style={{ flex: 1 }} /><Button title="Cancel" secondary onPress={onCancel} style={{ flex: 1 }} /></View>
  </View>;
}
const s = StyleSheet.create({
  stage: { alignItems: 'center', backgroundColor: '#2C4037', padding: 22, borderRadius: 16 },
  shade: { position: 'absolute', backgroundColor: '#10271DB3' },
  handle: { position: 'absolute', width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  dot: { width: 19, height: 19, borderRadius: 10, backgroundColor: C.gold, borderWidth: 3, borderColor: C.paper },
});
