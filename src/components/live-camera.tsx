import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, C, Icon, Txt } from '@/components/pokedex-ui';
import { scanCandidates, type ScanCandidate } from '@/lib/catalog';
import { detectCardLanguage, type ScanLanguage } from '@/lib/language-detect';
import { acceptLiveFrame, CARD_WIDTH_MM, closeFocusZoom, guideRegion, liveHint, LIVE_FRAME_GAP_MS, LIVE_HINTS, POCKET_WIDTH_MM, type CameraOptics, type LiveHint } from '@/lib/live-capture';
import type { Language } from '@/lib/model';
import { PAGE_LAYOUTS, type PageLayout } from '@/lib/page-scan';
import { backCameraOptics, canRecognize, recognizeCard } from '@/lib/scanner';
import type { Crop, ScanResult } from '@/lib/scan-types';

/** `page` is set for binder page photos; `region` is the part of the photo inside the page guide. */
export type LivePhoto = { uri: string; width: number; height: number; region?: Crop; page?: PageLayout };
export type LiveMatch = { scan: ScanResult; matches: ScanCandidate[]; language: Language };

const discard = (uri: string) => { try { new File(uri).delete(); } catch { /* Cache files are cleaned up by the system too. */ } };

/**
 * An in-app viewfinder. For one card it keeps reading frames and takes the photo by itself once a
 * card is clearly recognized; the shutter button always works too. Binder pages use the shutter only.
 * `mode` and `layout` are where it starts; people can switch between one card and a page inside it.
 */
export function LiveCamera({ mode: initialMode, layout: initialLayout, language, onCapture, onFallback, onClose }: {
  mode: 'card' | 'page'; layout?: PageLayout; language: ScanLanguage;
  onCapture: (photo: LivePhoto, match?: LiveMatch) => void; onFallback: () => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState(initialMode);
  const [layout, setLayout] = useState(initialLayout ?? PAGE_LAYOUTS[0]);
  const [ready, setReady] = useState(false);
  const [optics, setOptics] = useState<CameraOptics | null>(null);
  const [torch, setTorch] = useState(false);
  const [hint, setHint] = useState<LiveHint>('looking');
  const [found, setFound] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [failed, setFailed] = useState<string | null>(Device.isDevice ? null : 'The live camera needs a real iPhone or iPad.');
  const busy = useRef(false);
  const viewSize = useRef({ width: 0, height: 0 });
  const guide = useRef({ x: 0, y: 0, width: 0, height: 0 });
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
      const page = mode === 'page' ? layout : undefined;
      const region = page && guide.current.width ? guideRegion(guide.current, viewSize.current, photo) : undefined;
      onCapture({ uri: photo.uri, width: photo.width, height: photo.height, region, page });
    } catch (e) {
      if (alive.current) { setShooting(false); setFailed(e instanceof Error ? e.message : 'The photo could not be taken.'); }
    }
  }

  const denied = permission && !permission.granted && !permission.canAskAgain;
  const status = found ? 'Got it!' : shooting ? 'Taking the photo…' : mode === 'page' ? 'Fill the frame with one binder page' : LIVE_HINTS[hint];
  // The preview is shown at the photo's own 3:4 shape, like the Camera app, so the guide covers what is saved.
  const boxWidth = Math.min(width, (height - insets.top - insets.bottom - 260) * 3 / 4);
  // How much of the preview's width the card or page guide covers, inside the 12pt padding.
  const fill = (boxWidth - 24) / boxWidth * (mode === 'page' ? 1 : CARD_GUIDE_WIDTH);
  const zoom = optics ? closeFocusZoom(optics, mode === 'page' ? layout.columns * POCKET_WIDTH_MM : CARD_WIDTH_MM, fill) : 0;
  const usable = !!permission?.granted && !failed;
  const switchMode = (next: 'card' | 'page') => { if (next !== mode) { setMode(next); setHint('looking'); } };
  return <View style={[s.root, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 16 }]}>
    <View onLayout={e => { viewSize.current = e.nativeEvent.layout; }} style={[s.box, { width: boxWidth, height: boxWidth * 4 / 3 }]}>
      {/* expo-camera's default focus is continuous; autofocus="on" would focus once and then lock. */}
      {usable && <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" zoom={zoom} animateShutter={false} enableTorch={torch} onCameraReady={() => { setOptics(backCameraOptics()); setReady(true); }} onMountError={e => setFailed(e.message)} />}
      <View pointerEvents="none" style={s.guideArea}>
        {mode === 'page'
          ? <View onLayout={e => { guide.current = e.nativeEvent.layout; }} style={s.page}>{Array.from({ length: layout.columns * layout.rows }, (_, i) => <View key={i} style={[s.pocket, { width: `${100 / layout.columns}%`, height: `${100 / layout.rows}%` }]} />)}</View>
          : <View style={[s.card, found && { borderColor: '#8BE37B' }]}>{[s.tl, s.tr, s.bl, s.br].map((corner, i) => <View key={i} style={[s.corner, corner, found && { borderColor: '#8BE37B' }]} />)}</View>}
      </View>
    </View>
    <View style={[s.top, { paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close camera" onPress={onClose} style={s.round}><Icon name="close" color="white" /></Pressable>
      {usable && <View accessibilityRole="tablist" style={s.modes}>{([['card', 'One card'], ['page', 'Binder page']] as const).map(([id, label]) => <Pressable key={id} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: mode === id }} disabled={shooting || found} onPress={() => switchMode(id)} style={[s.mode, mode === id && s.modeSelected]}><Txt style={{ color: mode === id ? C.ink : 'white', fontWeight: '800', fontSize: 13 }}>{label}</Txt></Pressable>)}</View>}
      {usable ? <Pressable accessibilityRole="button" accessibilityLabel={torch ? 'Turn off the light' : 'Turn on the light'} accessibilityState={{ selected: torch }} onPress={() => setTorch(on => !on)} style={[s.round, torch && { backgroundColor: C.gold }]}><Icon name="bolt" color={torch ? C.ink : 'white'} /></Pressable> : <View style={{ width: 48 }} />}
    </View>
    {(failed || denied) ? <View style={s.message}>
      <Txt style={{ color: 'white', fontWeight: '800', textAlign: 'center' }}>{denied ? 'Camera access is off.' : failed}</Txt>
      <Txt style={{ color: '#D6E3CB', fontSize: 13, textAlign: 'center' }}>{denied ? 'Turn it on in Settings, or choose a photo instead.' : 'You can still use the regular camera or choose a photo.'}</Txt>
      <Button title="Use the regular camera" icon="camera" onPress={onFallback} />
    </View> : <View style={s.bottom}>
      <View accessibilityLiveRegion="polite" style={[s.status, found && { backgroundColor: '#3E8E4E' }]}>{!found && mode === 'card' && ready && <ActivityIndicator size="small" color="white" />}<Txt style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>{status}</Txt></View>
      <Pressable accessibilityRole="button" accessibilityLabel={mode === 'page' ? 'Take a photo of the page' : 'Take the photo now'} disabled={!ready || shooting || found} onPress={shoot} style={({ pressed }) => [s.shutter, pressed && { transform: [{ scale: .94 }] }, (!ready || shooting) && { opacity: .5 }]}><View style={s.shutterInner} /></Pressable>
      {mode === 'card'
        ? <Txt style={{ color: '#D6E3CB', fontSize: 12, textAlign: 'center' }}>It takes the picture by itself when it can read the card.</Txt>
        : <View accessibilityRole="radiogroup" accessibilityLabel="Pockets on each page" style={s.layouts}>{PAGE_LAYOUTS.map(option => <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={option.label} aria-checked={layout.id === option.id} disabled={shooting} onPress={() => setLayout(option)} style={[s.layout, layout.id === option.id && s.modeSelected]}><Txt style={{ color: layout.id === option.id ? C.ink : 'white', fontWeight: '700', fontSize: 12 }}>{option.label}</Txt></Pressable>)}</View>}
    </View>}
  </View>;
}

const CARD_GUIDE_WIDTH = .72;
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#101815', alignItems: 'center' },
  box: { overflow: 'hidden', backgroundColor: '#1C2621', borderRadius: 18 },
  guideArea: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', padding: 12 },
  card: { width: `${CARD_GUIDE_WIDTH * 100}%`, aspectRatio: .716, borderRadius: 14, borderWidth: 2, borderColor: '#FFFFFF66' },
  corner: { position: 'absolute', width: 34, height: 34, borderColor: 'white' },
  tl: { top: -3, left: -3, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 14 },
  tr: { top: -3, right: -3, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 14 },
  bl: { bottom: -3, left: -3, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 14 },
  br: { bottom: -3, right: -3, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 14 },
  page: { width: '100%', height: '100%', flexDirection: 'row', flexWrap: 'wrap', borderWidth: 3, borderColor: 'white', borderRadius: 10, overflow: 'hidden' },
  pocket: { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: '#FFFFFFAA' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18 },
  round: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF22', alignItems: 'center', justifyContent: 'center' },
  modes: { flexDirection: 'row', alignSelf: 'center', padding: 3, gap: 2, borderRadius: 22, backgroundColor: '#FFFFFF22' },
  mode: { minHeight: 42, paddingHorizontal: 13, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  modeSelected: { backgroundColor: 'white' },
  layouts: { flexDirection: 'row', gap: 6 },
  layout: { minHeight: 32, paddingHorizontal: 11, borderRadius: 16, justifyContent: 'center', backgroundColor: '#FFFFFF1F' },
  bottom: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 20 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: '#FFFFFF1F' },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 5, borderColor: 'white', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.red },
  message: { flex: 1, justifyContent: 'center', gap: 10, paddingHorizontal: 24 },
});
