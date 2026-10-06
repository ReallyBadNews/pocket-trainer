import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, C, Icon, IconButton, pressFx, S, Segmented, Txt, tick } from '@/components/pokedex-ui';
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
/** One card or a binder page, the same on the scan screen and in the camera. Short labels fit between the camera's 44pt buttons at large text. */
export const SCAN_MODES = [{ id: 'card', label: 'Card', icon: 'scan' }, { id: 'page', label: 'Page', icon: 'binder' }] as const;

const discard = (uri: string) => { try { new File(uri).delete(); } catch { /* Cache files are cleaned up by the system too. */ } };

/**
 * An in-app viewfinder. For one card it keeps reading frames and takes the photo by itself once a
 * card is clearly recognized; the shutter button always works too. Binder pages use the shutter only.
 * `mode` and `layout` are where it starts; people can switch between one card and a page inside it.
 */
export function LiveCamera({ mode: initialMode, layout: initialLayout, language, onCapture, onFallback, onLibrary, onClose }: {
  mode: 'card' | 'page'; layout?: PageLayout; language: ScanLanguage;
  /** `onFallback` opens the system camera and `onLibrary` the photo library, for when this camera cannot run. */
  onCapture: (photo: LivePhoto, match?: LiveMatch) => void; onFallback: () => void; onLibrary?: () => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [toolbarHeight, setToolbarHeight] = useState(0);
  const [controlsHeight, setControlsHeight] = useState(0);
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
      console.warn('Live camera photo failed', e);
      if (alive.current) { setShooting(false); setFailed("Oops! The photo didn't work."); }
    }
  }

  const denied = permission && !permission.granted && !permission.canAskAgain;
  const status = found ? 'Got it!' : shooting ? 'Taking the photo…' : mode === 'page' ? 'Fill the frame with one binder page' : LIVE_HINTS[hint];
  // The preview is shown at the photo's own 3:4 shape, like the Camera app, so the guide covers what is saved.
  const topSpace = toolbarHeight ? toolbarHeight + S.md : insets.top + 76;
  const bottomSpace = Math.max(234, controlsHeight + S.lg * 2);
  const boxWidth = Math.max(1, Math.min(width, (height - topSpace - insets.bottom - bottomSpace) * 3 / 4));
  // How much of the preview's width the card or page guide covers, inside the 12pt padding.
  const fill = (boxWidth - 24) / boxWidth * (mode === 'page' ? 1 : CARD_GUIDE_WIDTH);
  const zoom = optics ? closeFocusZoom(optics, mode === 'page' ? layout.columns * POCKET_WIDTH_MM : CARD_WIDTH_MM, fill) : 0;
  const usable = !!permission?.granted && !failed;
  const switchMode = (next: 'card' | 'page') => { if (next !== mode && !shooting && !found) { setMode(next); setHint('looking'); } };
  return <View style={[s.root, { paddingTop: topSpace, paddingBottom: insets.bottom + S.lg }]}>
    {!(failed || denied) && <View onLayout={e => { viewSize.current = e.nativeEvent.layout; }} style={[s.box, { width: boxWidth, height: boxWidth * 4 / 3 }]}>
      {/* expo-camera's default focus is continuous; autofocus="on" would focus once and then lock. */}
      {usable && <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" zoom={zoom} animateShutter={false} enableTorch={torch} onCameraReady={() => { setOptics(backCameraOptics()); setReady(true); }} onMountError={e => { console.warn('Live camera failed to start', e.message); setFailed("Oops! The camera didn't start."); }} />}
      <View pointerEvents="none" style={s.guideArea}>
        {mode === 'page'
          ? <View onLayout={e => { guide.current = e.nativeEvent.layout; }} style={s.page}>{Array.from({ length: layout.columns * layout.rows }, (_, i) => <View key={i} style={[s.pocket, { width: `${100 / layout.columns}%`, height: `${100 / layout.rows}%` }]} />)}</View>
          : <View style={[s.card, found && { borderColor: '#8BE37B' }]}>{[s.tl, s.tr, s.bl, s.br].map((corner, i) => <View key={i} style={[s.corner, corner, found && { borderColor: '#8BE37B' }]} />)}</View>}
      </View>
    </View>}
    <View onLayout={event => setToolbarHeight(event.nativeEvent.layout.height)} style={[s.top, { paddingTop: insets.top + S.sm }]}>
      <IconButton round dark icon="close" label="Close camera" onPress={onClose} />
      {usable ? <Segmented dark label="What are you scanning?" options={SCAN_MODES} value={mode} onChange={switchMode} style={{ flex: 1 }} /> : <View style={{ flex: 1 }} />}
      {usable ? <Pressable accessibilityRole="button" accessibilityLabel={torch ? 'Turn off the light' : 'Turn on the light'} accessibilityState={{ selected: torch }} hitSlop={4} onPress={() => { tick(); setTorch(on => !on); }} style={state => [s.round, torch && { backgroundColor: C.gold }, pressFx(state)]}><Icon name="bolt" size={22} color={torch ? C.ink : 'white'} /></Pressable> : <View style={{ width: 44 }} />}
    </View>
    {(failed || denied) ? <View style={s.message}>
      <Txt variant="subtitle" style={{ color: 'white', textAlign: 'center' }}>{denied ? 'Camera access is off.' : failed}</Txt>
      <Txt style={{ color: '#D6E3CB', textAlign: 'center' }}>{denied ? `Turn it on in Settings${onLibrary ? ', or pick a photo instead.' : '.'}` : `Try the regular camera${onLibrary ? ', or pick a photo instead.' : '.'}`}</Txt>
      <Button title="Use the regular camera" icon="camera" onPress={onFallback} />
      {onLibrary && <Button title="Pick from Photos" icon="photo" secondary onPress={onLibrary} />}
    </View> : <View style={s.bottom}><View onLayout={event => setControlsHeight(event.nativeEvent.layout.height)} style={s.controls}>
      <View accessibilityLiveRegion="polite" style={[s.status, found && { backgroundColor: '#3E8E4E' }]}>{!found && mode === 'card' && ready && <ActivityIndicator size="small" color="white" />}<Txt variant="label" style={{ color: 'white', flexShrink: 1, minWidth: 0, textAlign: 'center' }}>{status}</Txt></View>
      <Pressable accessibilityRole="button" accessibilityLabel={mode === 'page' ? 'Take a photo of the page' : 'Take the photo now'} disabled={!ready || shooting || found} onPress={shoot} style={({ pressed }) => [s.shutter, pressed && { transform: [{ scale: .94 }] }, (!ready || shooting) && { opacity: .5 }]}><View style={s.shutterInner} /></Pressable>
      {mode === 'card'
        ? <Txt variant="label" style={{ color: '#D6E3CB', textAlign: 'center' }}>Hold still, it snaps by itself!</Txt>
        : <Segmented dark label="Page layout" options={PAGE_LAYOUTS} value={layout.id} onChange={id => { if (!shooting) setLayout(PAGE_LAYOUTS.find(option => option.id === id)!); }} style={{ alignSelf: 'stretch' }} />}
    </View></View>}
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
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: S.lg },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF2E', alignItems: 'center', justifyContent: 'center' },
  bottom: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: S.xl },
  controls: { alignItems: 'center', gap: S.md },
  status: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingHorizontal: S.lg, paddingVertical: S.sm, borderRadius: 20, backgroundColor: '#FFFFFF1F' },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 5, borderColor: 'white', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.red },
  message: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', gap: S.md, paddingHorizontal: S.xxl },
});
