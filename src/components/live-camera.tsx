import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, C, Icon, Txt } from '@/components/pokedex-ui';
import { scanCandidates, type ScanCandidate } from '@/lib/catalog';
import { detectCardLanguage, type ScanLanguage } from '@/lib/language-detect';
import { acceptLiveFrame, liveHint, LIVE_FRAME_GAP_MS, LIVE_HINTS, type LiveHint } from '@/lib/live-capture';
import type { Language } from '@/lib/model';
import type { PageLayout } from '@/lib/page-scan';
import { canRecognize, recognizeCard } from '@/lib/scanner';
import type { ScanResult } from '@/lib/scan-types';

export type LivePhoto = { uri: string; width: number; height: number };
export type LiveMatch = { scan: ScanResult; matches: ScanCandidate[]; language: Language };

const discard = (uri: string) => { try { new File(uri).delete(); } catch { /* Cache files are cleaned up by the system too. */ } };

/**
 * An in-app viewfinder. For one card it keeps reading frames and takes the photo by itself once a
 * card is clearly recognized; the shutter button always works too. Binder pages use the shutter only.
 */
export function LiveCamera({ mode, layout, language, onCapture, onFallback, onClose }: {
  mode: 'card' | 'page'; layout?: PageLayout; language: ScanLanguage;
  onCapture: (photo: LivePhoto, match?: LiveMatch) => void; onFallback: () => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [hint, setHint] = useState<LiveHint>('looking');
  const [found, setFound] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [failed, setFailed] = useState<string | null>(Device.isDevice ? null : 'The live camera needs a real iPhone or iPad.');
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // Simulators have no camera, so only real devices are asked for access.
  useEffect(() => { if (Device.isDevice && permission && !permission.granted && permission.canAskAgain) void requestPermission(); }, [permission?.granted]);

  const auto = mode === 'card' && canRecognize && ready && !failed && !found && !shooting;
  useEffect(() => {
    if (!auto) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    async function readFrame() {
      if (stopped || busy.current || !camera.current) return;
      busy.current = true;
      let uri: string | undefined;
      try {
        const frame = await camera.current.takePictureAsync({ quality: .8, shutterSound: false });
        uri = frame.uri;
        if (stopped) return;
        const scan = await recognizeCard(frame.uri, language);
        const cardLanguage = language === 'auto' ? detectCardLanguage(scan) : language;
        const matches = scanCandidates(scan, cardLanguage, 12, 'all');
        if (stopped || !alive.current) return;
        if (acceptLiveFrame(matches)) {
          stopped = true; uri = undefined; setFound(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          onCapture({ uri: frame.uri, width: frame.width, height: frame.height }, { scan, matches, language: cardLanguage });
          return;
        }
        setHint(liveHint(scan, matches));
      } catch { /* A dropped frame is retried; the shutter button still works. */ }
      finally {
        busy.current = false;
        if (uri) discard(uri);
        if (!stopped) timer = setTimeout(readFrame, LIVE_FRAME_GAP_MS);
      }
    }
    timer = setTimeout(readFrame, 600);
    return () => { stopped = true; clearTimeout(timer); };
  }, [auto, language]);

  async function shoot() {
    if (!camera.current || shooting) return;
    setShooting(true);
    try {
      // Let an in-flight automatic frame finish so the two captures do not overlap.
      for (let i = 0; busy.current && i < 40; i++) await new Promise(resolve => setTimeout(resolve, 50));
      const photo = await camera.current.takePictureAsync({ quality: 1 });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      onCapture({ uri: photo.uri, width: photo.width, height: photo.height });
    } catch (e) {
      if (alive.current) { setShooting(false); setFailed(e instanceof Error ? e.message : 'The photo could not be taken.'); }
    }
  }

  const denied = permission && !permission.granted && !permission.canAskAgain;
  const status = found ? 'Got it!' : shooting ? 'Taking the photo…' : mode === 'page' ? 'Fill the frame with one binder page' : LIVE_HINTS[hint];
  return <View style={s.root}>
    {permission?.granted && !failed && <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" autofocus="on" animateShutter={false} enableTorch={torch} onCameraReady={() => setReady(true)} onMountError={e => setFailed(e.message)} />}
    <View pointerEvents="none" style={[s.guideArea, { paddingTop: insets.top + 70, paddingBottom: insets.bottom + 170 }]}>
      {mode === 'page' && layout
        ? <View style={[s.page, { aspectRatio: layout.columns / layout.rows * .8 }]}>{Array.from({ length: layout.columns * layout.rows }, (_, i) => <View key={i} style={[s.pocket, { width: `${100 / layout.columns}%`, height: `${100 / layout.rows}%` }]} />)}</View>
        : <View style={[s.card, found && { borderColor: '#8BE37B' }]}>{[s.tl, s.tr, s.bl, s.br].map((corner, i) => <View key={i} style={[s.corner, corner, found && { borderColor: '#8BE37B' }]} />)}</View>}
    </View>
    <View style={[s.top, { paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close camera" onPress={onClose} style={s.round}><Icon name="close" color="white" /></Pressable>
      {permission?.granted && !failed && <Pressable accessibilityRole="button" accessibilityLabel={torch ? 'Turn off the light' : 'Turn on the light'} accessibilityState={{ selected: torch }} onPress={() => setTorch(on => !on)} style={[s.round, torch && { backgroundColor: C.gold }]}><Icon name="bolt" color={torch ? C.ink : 'white'} /></Pressable>}
    </View>
    {(failed || denied) ? <View style={[s.message, { bottom: insets.bottom + 30 }]}>
      <Txt style={{ color: 'white', fontWeight: '800', textAlign: 'center' }}>{denied ? 'Camera access is off.' : failed}</Txt>
      <Txt style={{ color: '#D6E3CB', fontSize: 13, textAlign: 'center' }}>{denied ? 'Turn it on in Settings, or choose a photo instead.' : 'You can still use the regular camera or choose a photo.'}</Txt>
      <Button title="Use the regular camera" icon="camera" onPress={onFallback} />
    </View> : <View style={[s.bottom, { paddingBottom: insets.bottom + 20 }]}>
      <View accessibilityLiveRegion="polite" style={[s.status, found && { backgroundColor: '#3E8E4E' }]}>{!found && mode === 'card' && ready && <ActivityIndicator size="small" color="white" />}<Txt style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>{status}</Txt></View>
      <Pressable accessibilityRole="button" accessibilityLabel={mode === 'page' ? 'Take a photo of the page' : 'Take the photo now'} disabled={!ready || shooting || found} onPress={shoot} style={({ pressed }) => [s.shutter, pressed && { transform: [{ scale: .94 }] }, (!ready || shooting) && { opacity: .5 }]}><View style={s.shutterInner} /></Pressable>
      {mode === 'card' && <Txt style={{ color: '#D6E3CB', fontSize: 12 }}>It takes the picture by itself when it can read the card.</Txt>}
    </View>}
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#101815' },
  guideArea: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 },
  card: { width: '78%', maxWidth: 360, aspectRatio: .716, borderRadius: 14, borderWidth: 2, borderColor: '#FFFFFF66' },
  corner: { position: 'absolute', width: 34, height: 34, borderColor: 'white' },
  tl: { top: -3, left: -3, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 14 },
  tr: { top: -3, right: -3, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 14 },
  bl: { bottom: -3, left: -3, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 14 },
  br: { bottom: -3, right: -3, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 14 },
  page: { width: '92%', maxWidth: 520, flexDirection: 'row', flexWrap: 'wrap', borderWidth: 3, borderColor: 'white', borderRadius: 10, overflow: 'hidden' },
  pocket: { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: '#FFFFFFAA' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18 },
  round: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 14, paddingHorizontal: 20 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: '#000000A0' },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 5, borderColor: 'white', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.red },
  message: { position: 'absolute', left: 20, right: 20, gap: 10, padding: 18, borderRadius: 18, backgroundColor: '#000000B0' },
});
