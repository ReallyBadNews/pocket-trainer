import Animated, { cancelAnimation, useAnimatedStyle } from 'react-native-reanimated';
import { ScrollChromeContext, useScrollChromeController } from '@/components/scroll-chrome';
import { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { C, Icon, Txt, ui, type IconName, Button, tick } from '@/components/pokedex-ui';
import { TrainerAvatar } from '@/components/trainer-avatar';
import { useCollection } from '@/lib/collection-context';
import { DexScreen, BinderScreen } from './collection-screens';
import { BadgesScreen } from './badges-screen';
import { ScanScreen } from './scan-screen';
import { CardModal, DiscoveryModal, ProfilesModal, SpeciesModal, WishlistModal } from './collection-modals';
import { undoAdditions, type Card, type CardBrief, type Entry } from '@/lib/model';
import type { AddedCards } from '@/lib/use-add-cards';
import { QuizModal } from './quiz-screen';
import { SetChecklistModal } from './set-checklist';
import type { SetProgress } from '@/lib/set-progress';
import type { BinderView } from '@/components/binder-pages';
import { useAppUpdates } from '@/lib/use-app-updates';

const PINNED_CHROME_HEIGHT = 23 + 4 + 26; // Hinge, screen border, and Pokédex strip.
const BOTTOM_FRAME_HEIGHT = 20;

type Tab = 'dex' | 'binder' | 'scan' | 'badge';
export default function PocketTrainer() {
  const { trainer, ready, loadError, retryLoad, updateTrainer } = useCollection();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>('dex');
  const [modalBusy, setModalBusy] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selection, setSelection] = useState<{ brief: CardBrief; draft?: Card; entry?: Entry } | null>(null);
  const [speciesId, setSpeciesId] = useState<number | null>(null);
  const [discovery, setDiscovery] = useState<{ card: Card; newIds: number[]; quantity: number; granted: number; source: 'card' | 'page' } | null>(null);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [undo, setUndo] = useState<AddedCards | null>(null);
  const [captureRequest, setCaptureRequest] = useState(0);
  const [quizOpen, setQuizOpen] = useState(false);
  const [scanQuery, setScanQuery] = useState('');
  const [scanSession, setScanSession] = useState(0);
  const [printingTrainer, setPrintingTrainer] = useState<string | null>(null);
  const [binderView, setBinderView] = useState<BinderView>('grid');
  const [checklist, setChecklist] = useState<SetProgress | null>(null);
  const [headerHeight, setHeaderHeight] = useState(84);
  const [navHeight, setNavHeight] = useState(83);
  const chrome = useScrollChromeController(headerHeight, navHeight + BOTTOM_FRAME_HEIGHT);
  const { progress } = chrome;
  const modalOpen = !!(profileOpen || selection || speciesId !== null || discovery || quizOpen || checklist || wishlistOpen);
  useLayoutEffect(() => { cancelAnimation(progress); progress.value = 0; }, [tab, trainer.id, progress]);
  useLayoutEffect(() => {
    chrome.paused.value = modalOpen;
    if (modalOpen) cancelAnimation(progress);
  }, [modalOpen, chrome.paused, progress]);
  const topStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -headerHeight * progress.value }] }));
  function celebrate(added: AddedCards, source: 'card' | 'page') {
    setSelection(null); setUndo(added);
    // A saved card clears the old photo, matches and search. Page scans reset themselves and stay on the page reader.
    if (source === 'card') { setScanQuery(''); setScanSession(session => session + 1); }
    setDiscovery({ card: added.cards[0], newIds: added.newIds, quantity: added.quantity, granted: added.granted, source });
  }
  // The undo offer appears once the celebration closes and fades after a few seconds.
  const showUndo = !!undo && !modalOpen && undo.trainerId === trainer.id;
  // New app updates wait until nothing is open: no card, game, scan or undo offer.
  const appUpdate = useAppUpdates(!modalOpen && tab !== 'scan' && !showUndo);
  useEffect(() => {
    if (!showUndo) return;
    const timer = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(timer);
  }, [showUndo]);
  function undoAdd() {
    if (!undo) return;
    const { additions, trainerId } = undo;
    setUndo(null); tick();
    updateTrainer(t => undoAdditions(t, additions), trainerId).catch(() => {});
  }
  const openScan = (query = '') => { setScanQuery(query); setSpeciesId(null); setTab('scan'); };
  return <View style={s.outside}><View style={[s.device, width >= 700 && s.tablet, { paddingTop: insets.top + (width >= 700 ? 10 : 0), paddingLeft: insets.left, paddingRight: insets.right }]}>
    <View style={s.viewport} onLayout={event => { chrome.viewportHeight.value = Math.max(0, event.nativeEvent.layout.height - PINNED_CHROME_HEIGHT); }}>
    <Animated.View style={[s.topChrome, topStyle]}>
    <View onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}>
    <View style={s.header}><View style={ui.row}><View style={s.lensRim}><View style={s.lens}><View style={s.glint} /></View></View><View style={{ flexDirection: 'row', gap: 6, alignSelf: 'flex-start', paddingTop: 5 }}>{['#F66C70', '#F2CD62', '#82C580'].map(color => <View key={color} style={[s.indicator, { backgroundColor: color }]} />)}</View></View><Pressable accessibilityRole="button" accessibilityLabel="Settings, trainer profiles, builder, and backups" onPress={() => { if (ready) { tick(); setProfileOpen(true); } }} style={({ pressed }) => [s.trainer, pressed && { opacity: .7 }]}><TrainerAvatar appearance={trainer.appearance} size={35} /><View><Txt maxFontSizeMultiplier={1.2} style={{ color: '#FFD2D4', fontSize: 12, lineHeight: 15 }}>Settings</Txt><Txt numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ color: 'white', fontWeight: '700', fontSize: 15, lineHeight: 20, maxWidth: 130 }}>{trainer.name}</Txt></View><View style={{ transform: [{ rotate: '180deg' }] }}><Icon name="back" color="#FFD2D4" size={16} /></View></Pressable></View>
    </View>
    <View style={s.hinge}><View style={s.hingeLine} /><View style={s.hingeNotch} /></View>
    <View style={s.screenTop}><View style={s.screenLip}><View style={s.speaker}>{[1,2,3,4].map(n => <View key={n} style={s.speakerLine} />)}</View><Txt maxFontSizeMultiplier={1} style={s.brand}>Pokédex</Txt><View style={s.power} /></View></View>
    </Animated.View>
    <View style={s.feed}>
      {!ready ? <View style={s.loading}>{loadError ? <><Txt style={{ textAlign: 'center' }}>{loadError}</Txt><Button title="Retry opening collection" onPress={retryLoad} /></> : <><ActivityIndicator color={C.ink} /><Txt>Opening your Pokédex…</Txt></>}</View> : <ScrollChromeContext.Provider value={chrome}><View key={trainer.id} style={{ flex: 1 }}>
        {tab === 'dex' && <DexScreen onScan={() => openScan()} onSpecies={setSpeciesId} onEntry={entry => setSelection({ brief: entry.card, entry })} onNeedsPrinting={() => { setPrintingTrainer(trainer.id); setTab('binder'); }} onQuiz={() => setQuizOpen(true)} />}
        {tab === 'scan' && <ScanScreen sessionId={scanSession} initialQuery={scanQuery} onCard={(brief, draft) => setSelection({ brief, draft })} captureRequest={captureRequest} onAdded={celebrate} />}
        {tab === 'binder' && <BinderScreen onlyNeedsPrinting={printingTrainer === trainer.id} onNeedsPrintingChange={value => setPrintingTrainer(value ? trainer.id : null)} onScan={() => openScan()} onEntry={entry => setSelection({ brief: entry.card, entry })} onSet={setChecklist} view={binderView} onViewChange={setBinderView} onWishlist={() => setWishlistOpen(true)} />}
        {tab === 'badge' && <BadgesScreen onSpecies={setSpeciesId} />}
      </View></ScrollChromeContext.Provider>}
    </View>
    <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => { if (!modalBusy) { setProfileOpen(false); setSelection(null); setSpeciesId(null); setDiscovery(null); setQuizOpen(false); setChecklist(null); setWishlistOpen(false); } }}>
    {/* The checklist and wishlist stay mounted under a card they opened, so closing that card returns to the same spot. */}
    {checklist && <View style={selection || discovery ? s.hidden : s.fill}><SetChecklistModal set={checklist} onClose={() => setChecklist(null)} onEntry={entry => setSelection({ brief: entry.card, entry })} onCard={brief => setSelection({ brief })} /></View>}
    {wishlistOpen && <View style={selection || discovery ? s.hidden : s.fill}><WishlistModal onClose={() => setWishlistOpen(false)} onCard={brief => setSelection({ brief })} onFind={() => { setWishlistOpen(false); openScan(); }} /></View>}
    {profileOpen && <ProfilesModal onBusyChange={setModalBusy} onClose={() => setProfileOpen(false)} />}
    {selection && <CardModal onBusyChange={setModalBusy} key={`${trainer.id}:${selection.brief.language}:${selection.brief.id}`} {...selection} onClose={() => setSelection(null)} onAdded={added => celebrate(added, 'card')} />}
    {/* Keyed by id so tapping an evolution stage opens that entry scrolled to the top. */}
    {speciesId !== null && <SpeciesModal key={speciesId} id={speciesId} onClose={() => setSpeciesId(null)} onFindCards={openScan} onSpecies={setSpeciesId} onEntry={entry => { setSpeciesId(null); setSelection({ brief: entry.card, entry }); }} />}
    {discovery && <DiscoveryModal {...discovery} nextLabel={discovery.source === 'page' ? 'Scan the next page' : 'Scan another card'} onNext={() => { setDiscovery(null); setWishlistOpen(false); setChecklist(null); setTab('scan'); setCaptureRequest(n => n + 1); }} onClose={() => setDiscovery(null)} />}
    {quizOpen && <QuizModal onClose={() => setQuizOpen(false)} />}
    </Modal>
    {showUndo && <View pointerEvents="box-none" style={[s.toastSlot, { bottom: navHeight + BOTTOM_FRAME_HEIGHT + 10 }]}><View accessibilityLiveRegion="polite" style={s.toast}><Icon name="check" size={18} color="#BFE3B4" /><Txt variant="label" style={{ flex: 1, minWidth: 0, paddingVertical: 8, color: 'white' }}>{undo.quantity === 1 ? `Added ${undo.cards[0].name}` : `Added ${undo.quantity} cards`}</Txt><Pressable accessibilityRole="button" accessibilityLabel="Undo adding" onPress={undoAdd} style={s.undo}><Txt variant="label" style={{ color: C.gold }}>Undo</Txt></Pressable></View></View>}
    <View style={s.bottomChrome}><View style={s.bottomFrame}><View style={s.screenBottom} /></View><View onLayout={event => setNavHeight(event.nativeEvent.layout.height)} style={[s.nav, { paddingBottom: Math.max(12, insets.bottom) }]}>{([{ id: 'dex', label: 'Pokédex', icon: 'dex' }, { id: 'binder', label: 'Binder', icon: 'binder' }, { id: 'scan', label: 'Scan', icon: 'scan' }, { id: 'badge', label: 'Badges', icon: 'badge' }] as { id: Tab; label: string; icon: IconName }[]).map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} accessibilityLabel={item.label} onFocus={() => { progress.value = 0; }} onPress={() => { if (tab !== item.id) tick(); setTab(item.id); if (item.id === 'scan') setScanQuery(''); }} style={s.navItem}><View style={[s.navIcon, tab === item.id && s.navSelected]}><Icon name={item.icon} size={23} color={tab === item.id ? 'white' : '#F9B7BC'} /></View><Txt numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ color: tab === item.id ? 'white' : '#F9B7BC', fontSize: 12, fontWeight: tab === item.id ? '700' : '600', lineHeight: 18 }}>{item.label}</Txt></Pressable>)}</View></View>
    </View>
    {appUpdate !== 'none' && <View accessibilityViewIsModal accessibilityLiveRegion="polite" style={s.updating}><Image source={require('../../assets/crafted/pokeball.png')} style={{ width: 104, height: 104 }} contentFit="contain" /><Txt variant="subtitle" style={{ color: 'white', textAlign: 'center' }}>Getting the newest Pokédex…</Txt><ActivityIndicator color="white" /></View>}
  </View></View>;
}
const s = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0, overflow: 'hidden' },
  // The list viewport stays fixed. The decorative header collapses; tabs remain available.
  topChrome: { zIndex: 1, position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: C.red },
  bottomChrome: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.red },
  feed: { position: 'absolute', top: PINNED_CHROME_HEIGHT, bottom: 0, left: 12, right: 12, borderLeftWidth: 4, borderRightWidth: 4, borderColor: '#A72937', backgroundColor: C.screen, overflow: 'hidden' },
  screenTop: { marginHorizontal: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 4, borderLeftWidth: 4, borderRightWidth: 4, borderColor: '#A72937', overflow: 'hidden' },
  bottomFrame: { height: BOTTOM_FRAME_HEIGHT, marginHorizontal: 12, backgroundColor: C.red, pointerEvents: 'none' },
  screenBottom: { flex: 1, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, borderBottomWidth: 4, borderLeftWidth: 4, borderRightWidth: 4, borderColor: '#A72937', backgroundColor: C.screen },
  outside: { flex: 1, backgroundColor: '#762530', alignItems: 'center' },
  device: { flex: 1, backgroundColor: C.red, width: '100%', maxWidth: 1100 },
  tablet: { marginVertical: 16, borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: '#F8797F', maxHeight: '96%' },
  header: { paddingHorizontal: 22, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lensRim: { width: 44, height: 44, borderRadius: 30, padding: 5, backgroundColor: '#E8EADB', borderBottomWidth: 3, borderBottomColor: '#9FADA7' },
  lens: { flex: 1, borderRadius: 25, backgroundColor: C.blue, borderWidth: 3, borderColor: '#2C91B1', overflow: 'hidden' },
  glint: { position: 'absolute', width: 17, height: 11, borderRadius: 10, top: 4, left: 5, backgroundColor: '#C2F6FE' },
  indicator: { width: 9, height: 9, borderRadius: 8, borderWidth: 1, borderColor: '#80252A' },
  trainer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, minHeight: 44 },
  hinge: { height: 15, flexDirection: 'row', marginBottom: 8 }, hingeLine: { flex: 1, height: 4, backgroundColor: C.redDark, alignSelf: 'flex-end', borderBottomWidth: 1, borderBottomColor: '#EB5E69' }, hingeNotch: { width: 100, height: 15, backgroundColor: C.redDark, borderTopLeftRadius: 20 },
  screenLip: { height: 26, flexShrink: 0, alignItems: 'center', flexDirection: 'row', paddingHorizontal: 18, justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#CBD6BE', backgroundColor: '#DDE5D4' },
  brand: { fontWeight: '900', fontSize: 11, lineHeight: 17, color: '#6B7B64', letterSpacing: 2 },
  speaker: { flexDirection: 'row', gap: 3 }, speakerLine: { width: 3, height: 9, borderRadius: 2, backgroundColor: '#A5B299' }, power: { height: 6, width: 6, borderRadius: 5, backgroundColor: '#6DAB63' },
  nav: { flexShrink: 0, flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8 }, navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 63, gap: 1 },
  navIcon: { width: 48, height: 35, alignItems: 'center', justifyContent: 'center', borderRadius: 13 }, navSelected: { backgroundColor: '#A42535' },
  toastSlot: { position: 'absolute', left: 24, right: 24, alignItems: 'center', zIndex: 2 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', maxWidth: 460, paddingLeft: 14, borderRadius: 14, backgroundColor: C.ink, shadowColor: '#000', shadowOpacity: .25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  undo: { minHeight: 48, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 25, gap: 15 },
  fill: { flex: 1 }, hidden: { display: 'none' },
  updating: { ...StyleSheet.absoluteFill, zIndex: 3, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 32 },
});
