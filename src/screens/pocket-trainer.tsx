import Animated, { cancelAnimation, useAnimatedStyle } from 'react-native-reanimated';
import { ScrollChromeContext, useScrollChromeController } from '@/components/scroll-chrome';
import { useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, Icon, Txt, ui, type IconName, Button } from '@/components/pokedex-ui';
import { useCollection } from '@/lib/collection-context';
import { DexScreen, BinderScreen, BadgesScreen } from './collection-screens';
import { ScanScreen } from './scan-screen';
import { CardModal, DiscoveryModal, ProfilesModal, SpeciesModal } from './collection-modals';
import type { Card, CardBrief, Entry } from '@/lib/model';

const PINNED_CHROME_HEIGHT = 23 + 26; // Hinge (including its gap) and Pokédex strip.

type Tab = 'dex' | 'binder' | 'scan' | 'badge';
export default function PocketTrainer() {
  const { trainer, ready, loadError, retryLoad } = useCollection();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>('dex');
  const [modalBusy, setModalBusy] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selection, setSelection] = useState<{ brief: CardBrief; entry?: Entry } | null>(null);
  const [speciesId, setSpeciesId] = useState<number | null>(null);
  const [discovery, setDiscovery] = useState<{ card: Card; newIds: number[]; quantity: number } | null>(null);
  const [scanQuery, setScanQuery] = useState('');
  const [printingTrainer, setPrintingTrainer] = useState<string | null>(null);
  const [headerHeight, setHeaderHeight] = useState(84);
  const [navHeight, setNavHeight] = useState(83);
  const chrome = useScrollChromeController(headerHeight);
  const { progress } = chrome;
  const modalOpen = !!(profileOpen || selection || speciesId !== null || discovery);
  useLayoutEffect(() => { cancelAnimation(progress); progress.value = 0; }, [tab, trainer.id, progress]);
  useLayoutEffect(() => {
    chrome.paused.value = modalOpen;
    if (modalOpen) cancelAnimation(progress);
  }, [modalOpen, chrome.paused, progress]);
  const topStyle = useAnimatedStyle(() => ({ height: headerHeight * (1 - progress.value) }));
  const headerStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -headerHeight * progress.value }] }));
  const screenStyle = useAnimatedStyle(() => ({
    borderRadius: 20 * (1 - progress.value),
  }));
  const frameStyle = useAnimatedStyle(() => ({
    borderRadius: 20 * (1 - progress.value),
    borderWidth: 4 * (1 - progress.value),
  }));
  const bottomStyle = useAnimatedStyle(() => ({ height: navHeight * (1 - progress.value) }));
  const openScan = (query = '') => { setScanQuery(query); setSpeciesId(null); setTab('scan'); };
  return <View style={s.outside}><View style={[s.device, width >= 700 && s.tablet, { paddingTop: insets.top + (width >= 700 ? 10 : 0), paddingLeft: insets.left, paddingRight: insets.right }]}>
    <View style={s.viewport} onLayout={event => { chrome.viewportHeight.value = Math.max(0, event.nativeEvent.layout.height - PINNED_CHROME_HEIGHT); }}>
    <Animated.View style={[s.clip, topStyle]}>
    <Animated.View onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)} style={headerStyle}>
    <View style={s.header}><View style={ui.row}><View style={s.lensRim}><View style={s.lens}><View style={s.glint} /></View></View><View style={{ flexDirection: 'row', gap: 6, alignSelf: 'flex-start', paddingTop: 5 }}>{['#F66C70', '#F2CD62', '#82C580'].map(color => <View key={color} style={[s.indicator, { backgroundColor: color }]} />)}</View></View><Pressable accessibilityRole="button" accessibilityLabel="Trainer profiles and backups" onPress={() => ready && setProfileOpen(true)} style={s.trainer}><View style={s.avatar}><Icon name="user" color="white" size={17} /></View><View><Txt style={{ color: '#FFD2D4', fontSize: 10, lineHeight: 14 }}>Pocket Trainer</Txt><Txt style={{ color: 'white', fontWeight: '800', fontSize: 14 }}>{trainer.name}</Txt></View><Icon name="back" color="#FFD2D4" size={15} /></Pressable></View>
    </Animated.View></Animated.View>
    <View style={s.hinge}><View style={s.hingeLine} /><View style={s.hingeNotch} /></View>
    <Animated.View style={[s.screen, screenStyle]}><View style={s.screenLip}><View style={s.speaker}>{[1,2,3,4].map(n => <View key={n} style={s.speakerLine} />)}</View><Txt style={s.brand}>Pokédex</Txt><View style={s.power} /></View>
      {!ready ? <View style={s.loading}>{loadError ? <><Txt style={{ textAlign: 'center' }}>{loadError}</Txt><Button title="Retry opening collection" onPress={retryLoad} /></> : <><ActivityIndicator color={C.ink} /><Txt>Opening your Pokédex…</Txt></>}</View> : <ScrollChromeContext.Provider value={chrome}><View key={trainer.id} style={{ flex: 1 }}>
        {tab === 'dex' && <DexScreen onScan={() => openScan()} onSpecies={setSpeciesId} onNeedsPrinting={() => { setPrintingTrainer(trainer.id); setTab('binder'); }} />}
        {tab === 'binder' && <BinderScreen onlyNeedsPrinting={printingTrainer === trainer.id} onNeedsPrintingChange={value => setPrintingTrainer(value ? trainer.id : null)} onScan={() => openScan()} onEntry={entry => setSelection({ brief: entry.card, entry })} />}
        {tab === 'scan' && <ScanScreen initialQuery={scanQuery} onCard={brief => setSelection({ brief })} />}
        {tab === 'badge' && <BadgesScreen />}
      </View></ScrollChromeContext.Provider>}
      <Animated.View pointerEvents="none" style={[s.screenFrame, frameStyle]} />
    </Animated.View>
    <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => { if (!modalBusy) { setProfileOpen(false); setSelection(null); setSpeciesId(null); setDiscovery(null); } }}>
    {profileOpen && <ProfilesModal onBusyChange={setModalBusy} onClose={() => setProfileOpen(false)} />}
    {selection && <CardModal onBusyChange={setModalBusy} key={`${trainer.id}:${selection.brief.language}:${selection.brief.id}`} {...selection} onClose={() => setSelection(null)} onAdded={(card, newIds, quantity) => { setSelection(null); setDiscovery({ card, newIds, quantity }); }} />}
    {speciesId !== null && <SpeciesModal id={speciesId} onClose={() => setSpeciesId(null)} onFindCards={openScan} onEntry={entry => { setSpeciesId(null); setSelection({ brief: entry.card, entry }); }} />}
    {discovery && <DiscoveryModal {...discovery} onClose={() => setDiscovery(null)} />}
    </Modal>
    <Animated.View style={[s.clip, bottomStyle]}><View onLayout={event => setNavHeight(event.nativeEvent.layout.height)} style={[s.nav, { paddingBottom: Math.max(12, insets.bottom) }]}>{([{ id: 'dex', label: 'Pokédex', icon: 'dex' }, { id: 'binder', label: 'Binder', icon: 'binder' }, { id: 'scan', label: 'Scan card', icon: 'scan' }, { id: 'badge', label: 'Badges', icon: 'badge' }] as { id: Tab; label: string; icon: IconName }[]).map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} accessibilityLabel={item.label} onFocus={() => { progress.value = 0; }} onPress={() => { setTab(item.id); if (item.id === 'scan') setScanQuery(''); }} style={[s.navItem, item.id === 'scan' && s.scanNav]}><View style={[s.navIcon, tab === item.id && s.navSelected, item.id === 'scan' && s.scanIcon]}><Icon name={item.icon} size={23} color={item.id === 'scan' ? C.redDark : tab === item.id ? 'white' : '#F9B7BC'} /></View><Txt style={{ color: tab === item.id ? 'white' : '#F9B7BC', fontSize: 11, fontWeight: '800', lineHeight: 18 }}>{item.label}</Txt></Pressable>)}</View></Animated.View>
    </View>
  </View></View>;
}
const s = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0, overflow: 'hidden' },
  clip: { overflow: 'hidden', flexShrink: 0 },
  outside: { flex: 1, backgroundColor: '#762530', alignItems: 'center' },
  device: { flex: 1, backgroundColor: C.red, width: '100%', maxWidth: 1100 },
  tablet: { marginVertical: 16, borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: '#F8797F', maxHeight: '96%' },
  header: { paddingHorizontal: 22, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lensRim: { width: 54, height: 54, borderRadius: 30, padding: 5, backgroundColor: '#E8EADB', borderBottomWidth: 3, borderBottomColor: '#9FADA7' },
  lens: { flex: 1, borderRadius: 25, backgroundColor: C.blue, borderWidth: 3, borderColor: '#2C91B1', overflow: 'hidden' },
  glint: { position: 'absolute', width: 17, height: 11, borderRadius: 10, top: 4, left: 5, backgroundColor: '#C2F6FE' },
  indicator: { width: 9, height: 9, borderRadius: 8, borderWidth: 1, borderColor: '#80252A' },
  trainer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, minHeight: 44 },
  avatar: { backgroundColor: '#A42535', borderRadius: 18, width: 33, height: 33, alignItems: 'center', justifyContent: 'center' },
  hinge: { height: 15, flexDirection: 'row', marginBottom: 8 }, hingeLine: { flex: 1, height: 4, backgroundColor: C.redDark, alignSelf: 'flex-end', borderBottomWidth: 1, borderBottomColor: '#EB5E69' }, hingeNotch: { width: 100, height: 15, backgroundColor: C.redDark, borderTopLeftRadius: 20 },
  screen: { flex: 1, backgroundColor: C.screen, borderRadius: 20, overflow: 'hidden' },
  screenFrame: { position: 'absolute', inset: 0, borderColor: '#A72937' },
  screenLip: { height: 26, flexShrink: 0, alignItems: 'center', flexDirection: 'row', paddingHorizontal: 18, justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#CBD6BE', backgroundColor: '#DDE5D4' },
  brand: { fontWeight: '900', fontSize: 11, lineHeight: 17, color: '#6B7B64', letterSpacing: 2 },
  speaker: { flexDirection: 'row', gap: 3 }, speakerLine: { width: 3, height: 9, borderRadius: 2, backgroundColor: '#A5B299' }, power: { height: 6, width: 6, borderRadius: 5, backgroundColor: '#6DAB63' },
  nav: { flexShrink: 0, flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8 }, navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 63, gap: 1 },
  navIcon: { width: 48, height: 35, alignItems: 'center', justifyContent: 'center', borderRadius: 13 }, navSelected: { backgroundColor: '#A42535' }, scanNav: { marginTop: -2 }, scanIcon: { height: 40, width: 55, backgroundColor: '#F2E9D8', borderBottomWidth: 3, borderBottomColor: '#C8BDA9', borderRadius: 14 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 25, gap: 15 },
});
