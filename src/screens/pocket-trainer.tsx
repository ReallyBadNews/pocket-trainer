import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { ScrollChromeContext, useScrollChromeController } from '@/components/scroll-chrome';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import { TabSlot, useTabTrigger } from 'expo-router/ui';
import { C, Icon, Txt, Button, tick } from '@/components/pokedex-ui';
import { TrainerAvatar } from '@/components/trainer-avatar';
import { useCollection } from '@/lib/collection-context';
import { CardModal, DiscoveryModal, ProfilesModal, SpeciesModal, WishlistModal } from './collection-modals';
import { undoAdditions, type Card, type CardBrief, type Entry } from '@/lib/model';
import type { AddedCards } from '@/lib/use-add-cards';
import type { SidekickId } from '@/lib/sidekicks';
import { QuizModal } from './quiz-screen';
import { useAppUpdates } from '@/lib/use-app-updates';
import { showOnlyNeedsPrinting } from '@/lib/browse-state';
import { PokedexNavContext, TABS, type PokedexNav, type TabName } from '@/lib/pokedex-nav';

const PINNED_CHROME_HEIGHT = 23 + 4 + 26; // Hinge, screen border, and Pokédex strip.

const BOTTOM_FRAME_HEIGHT = 20;

/**
 * The Pokédex housing around expo-router's tabs. Each tab's stack renders in the green screen through `TabSlot`;
 * the sheet host stays here, outside every route, so a card or Pokémon can open over any page.
 */
export function PokedexShell() {
  const { trainer, ready, loadError, retryLoad, updateTrainer } = useCollection();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const { switchTab, getTrigger } = useTabTrigger({ name: 'dex' });
  const tab: TabName = TABS.find((item) => getTrigger(item.name)?.isFocused)?.name ?? 'dex';
  const [modalBusy, setModalBusy] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profilePage, setProfilePage] = useState<'settings' | 'about'>('settings');
  const [selection, setSelection] = useState<{ brief: CardBrief; draft?: Card; entry?: Entry } | null>(null);
  const [speciesId, setSpeciesId] = useState<number | null>(null);

  const [discovery, setDiscovery] = useState<{
    card: Card;
    newIds: number[];
    quantity: number;
    granted: number;
    sidekicks: SidekickId[];
    source: 'card' | 'page';
  } | null>(null);

  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [undo, setUndo] = useState<AddedCards | null>(null);
  const [captureRequest, setCaptureRequest] = useState(0);
  const [quizOpen, setQuizOpen] = useState(false);
  const [scanQuery, setScanQuery] = useState('');
  const [scanSession, setScanSession] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(84);
  const [navHeight, setNavHeight] = useState(83);
  const chrome = useScrollChromeController(headerHeight, navHeight + BOTTOM_FRAME_HEIGHT);
  const { progress } = chrome;
  const modalOpen = !!(profileOpen || selection || speciesId !== null || discovery || quizOpen || wishlistOpen);
  useLayoutEffect(() => {
    cancelAnimation(progress);
    progress.set(0);
  }, [tab, pathname, trainer.id, progress]);
  useLayoutEffect(() => {
    chrome.paused.set(modalOpen);

    if (modalOpen) cancelAnimation(progress);
  }, [modalOpen, chrome.paused, progress]);
  // Another trainer starts from the first page of the current tab, with a fresh scan rather than the last trainer's photo.
  const shownTrainer = useRef(trainer.id);
  useEffect(() => {
    if (shownTrainer.current === trainer.id) return;
    shownTrainer.current = trainer.id;
    setScanQuery('');
    setScanSession((session) => session + 1);

    if (router.canDismiss()) router.dismissAll();
  }, [trainer.id]);
  const topStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -headerHeight * progress.get() }] }));

  /** Another tab opens on its first page; the current tab pops back to it. */
  function goToTab(name: TabName) {
    if (name === tab) {
      if (router.canDismiss()) router.dismissAll();
    } else switchTab(name, { resetOnFocus: true });
  }

  function startScan(query = '') {
    setScanQuery(query);
    setScanSession((session) => session + 1);
  }

  function celebrate(added: AddedCards, source: 'card' | 'page') {
    setSelection(null);
    setUndo(added);

    // A saved card clears the old photo, matches and search. Page scans reset themselves and stay on the page reader.
    if (source === 'card') startScan();
    setDiscovery({
      card: added.cards[0],
      newIds: added.newIds,
      quantity: added.quantity,
      granted: added.granted,
      sidekicks: added.sidekicks,
      source,
    });
  }

  // The undo offer appears once the celebration closes and fades after a few seconds.
  const showUndo = !!undo && !modalOpen && undo.trainerId === trainer.id;
  // New app updates wait until nothing is open: no card, game, scan or undo offer.
  const appUpdates = useAppUpdates(!modalOpen && tab !== 'scan' && !showUndo);
  useEffect(() => {
    if (!showUndo) return;
    const timer = setTimeout(() => setUndo(null), 8000);

    return () => clearTimeout(timer);
  }, [showUndo]);

  function undoAdd() {
    if (!undo) return;
    const { additions, trainerId } = undo;
    setUndo(null);
    tick();
    updateTrainer((t) => undoAdditions(t, additions), trainerId).catch(() => {});
  }

  const openScan = (query = '') => {
    startScan(query);
    setSpeciesId(null);
    goToTab('scan');
  };

  const nav: PokedexNav = {
    tab,
    goToTab,
    openScan,
    openEntry: (entry) => setSelection({ brief: entry.card, entry }),
    openCard: (brief, draft) => setSelection({ brief, draft }),
    openSpecies: setSpeciesId,
    openWishlist: () => setWishlistOpen(true),
    openQuiz: () => setQuizOpen(true),
    confirmPrintings: () => {
      showOnlyNeedsPrinting(trainer.id);
      goToTab('binder');
    },
    scan: { query: scanQuery, session: scanSession, captureRequest },
    onScanAdded: celebrate,
  };

  return (
    <View style={s.outside}>
      <View
        style={[
          s.device,
          width >= 700 && s.tablet,
          { paddingTop: insets.top + (width >= 700 ? 10 : 0), paddingLeft: insets.left, paddingRight: insets.right },
        ]}
      >
        <View
          style={s.viewport}
          onLayout={(event) => {
            chrome.viewportHeight.set(Math.max(0, event.nativeEvent.layout.height - PINNED_CHROME_HEIGHT));
          }}
        >
          <Animated.View style={[s.topChrome, topStyle]}>
            <View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
              <View style={s.header}>
                <DeviceLights
                  updateReady={appUpdates.ready}
                  onPress={() => {
                    if (ready) {
                      tick();
                      setProfilePage('about');
                      setProfileOpen(true);
                    }
                  }}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Settings, trainer profiles, builder, and backups"
                  onPress={() => {
                    if (ready) {
                      tick();
                      setProfilePage('settings');
                      setProfileOpen(true);
                    }
                  }}
                  style={({ pressed }) => [s.trainer, pressed && { opacity: 0.7 }]}
                >
                  <TrainerAvatar appearance={trainer.appearance} size={35} />
                  <View>
                    <Txt maxFontSizeMultiplier={1.2} style={{ color: '#FFD2D4', fontSize: 12, lineHeight: 15 }}>
                      Settings
                    </Txt>
                    <Txt
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.2}
                      style={{ color: 'white', fontWeight: '700', fontSize: 15, lineHeight: 20, maxWidth: 130 }}
                    >
                      {trainer.name}
                    </Txt>
                  </View>
                  <View style={{ transform: [{ rotate: '180deg' }] }}>
                    <Icon name="back" color="#FFD2D4" size={16} />
                  </View>
                </Pressable>
              </View>
            </View>
            <View style={s.hinge}>
              <View style={s.hingeLine} />
              <View style={s.hingeNotch} />
            </View>
            <View style={s.screenTop}>
              <View style={s.screenLip}>
                <View style={s.speaker}>
                  {[1, 2, 3, 4].map((n) => (
                    <View key={n} style={s.speakerLine} />
                  ))}
                </View>
                <Txt maxFontSizeMultiplier={1} style={s.brand}>
                  Pokédex
                </Txt>
                <View style={s.power} />
              </View>
            </View>
          </Animated.View>
          <View style={s.feed}>
            {/* Tabs render their routes only once the collection has opened; the navigator itself is always mounted. */}
            {!ready ? (
              <View style={s.loading}>
                {loadError ? (
                  <>
                    <Txt style={{ textAlign: 'center' }}>{loadError}</Txt>
                    <Button title="Retry opening collection" onPress={retryLoad} />
                  </>
                ) : (
                  <>
                    <ActivityIndicator color={C.ink} />
                    <Txt>Opening your Pokédex…</Txt>
                  </>
                )}
              </View>
            ) : (
              <ScrollChromeContext.Provider value={chrome}>
                <PokedexNavContext.Provider value={nav}>
                  <TabSlot style={{ flex: 1 }} />
                </PokedexNavContext.Provider>
              </ScrollChromeContext.Provider>
            )}
          </View>
          <Modal
            visible={modalOpen}
            transparent
            animationType="fade"
            onRequestClose={() => {
              if (!modalBusy) {
                setProfileOpen(false);
                setSelection(null);
                setSpeciesId(null);
                setDiscovery(null);
                setQuizOpen(false);
                setWishlistOpen(false);
              }
            }}
          >
            {/* The wishlist stays mounted under a card it opened, so closing that card returns to the same spot. */}
            {wishlistOpen && (
              <View style={selection || discovery ? s.hidden : s.fill}>
                <WishlistModal
                  onClose={() => setWishlistOpen(false)}
                  onCard={(brief) => setSelection({ brief })}
                  onFind={() => {
                    setWishlistOpen(false);
                    openScan();
                  }}
                />
              </View>
            )}
            {profileOpen && (
              <ProfilesModal
                startPage={profilePage}
                update={appUpdates}
                onBusyChange={setModalBusy}
                onClose={() => setProfileOpen(false)}
              />
            )}
            {selection && (
              <CardModal
                onBusyChange={setModalBusy}
                key={`${trainer.id}:${selection.brief.language}:${selection.brief.id}`}
                {...selection}
                onClose={() => setSelection(null)}
                onAdded={(added) => celebrate(added, 'card')}
              />
            )}
            {/* Keyed by id so tapping an evolution stage opens that entry scrolled to the top. */}
            {speciesId !== null && (
              <SpeciesModal
                key={speciesId}
                id={speciesId}
                onClose={() => setSpeciesId(null)}
                onFindCards={openScan}
                onSpecies={setSpeciesId}
                onEntry={(entry) => {
                  setSpeciesId(null);
                  setSelection({ brief: entry.card, entry });
                }}
              />
            )}
            {discovery && (
              <DiscoveryModal
                {...discovery}
                nextLabel={discovery.source === 'page' ? 'Next page' : 'Scan'}
                onNext={() => {
                  setDiscovery(null);
                  setWishlistOpen(false);
                  goToTab('scan');
                  setCaptureRequest((n) => n + 1);
                }}
                onClose={() => setDiscovery(null)}
              />
            )}
            {quizOpen && <QuizModal onClose={() => setQuizOpen(false)} />}
          </Modal>
          {showUndo && (
            <View pointerEvents="box-none" style={[s.toastSlot, { bottom: navHeight + BOTTOM_FRAME_HEIGHT + 10 }]}>
              <View accessibilityLiveRegion="polite" style={s.toast}>
                <Icon name="check" size={18} color="#BFE3B4" />
                <Txt variant="label" style={{ flex: 1, minWidth: 0, paddingVertical: 8, color: 'white' }}>
                  {undo.quantity === 1 ? `Added ${undo.cards[0].name}` : `Added ${undo.quantity} cards`}
                </Txt>
                <Pressable accessibilityRole="button" accessibilityLabel="Undo adding" onPress={undoAdd} style={s.undo}>
                  <Txt variant="label" style={{ color: C.gold }}>
                    Undo
                  </Txt>
                </Pressable>
              </View>
            </View>
          )}
          <View style={s.bottomChrome}>
            <View style={s.bottomFrame}>
              <View style={s.screenBottom} />
            </View>
            <View
              onLayout={(event) => setNavHeight(event.nativeEvent.layout.height)}
              style={[s.nav, { paddingBottom: Math.max(12, insets.bottom) }]}
            >
              {TABS.map((item) => (
                <NavButton
                  key={item.name}
                  item={item}
                  onFocus={() => {
                    progress.set(0);
                  }}
                  onSwitch={() => {
                    if (item.name === 'scan') startScan();
                  }}
                />
              ))}
            </View>
          </View>
        </View>
        {appUpdates.step !== 'none' && (
          <View accessibilityViewIsModal accessibilityLiveRegion="polite" style={s.updating}>
            <Image
              source={require('../../assets/crafted/pokeball.png')}
              style={{ width: 104, height: 104 }}
              contentFit="contain"
            />
            <Txt variant="subtitle" style={{ color: 'white', textAlign: 'center' }}>
              Getting the newest Pokédex…
            </Txt>
            <ActivityIndicator color="white" />
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * The lens and indicator lights, rendered in Blender (scripts/blender-header-lens.py). When a newer update is waiting
 * they become a button to Settings › About, where it can be installed: the lens lights up blue with a scanner sweep
 * circling inside it, the green light comes on, and "Update" appears in the space under the lights, so nothing shifts.
 */
function DeviceLights({ updateReady, onPress }: { updateReady: boolean; onPress: () => void }) {
  const reduced = useReducedMotion();
  const sweeping = updateReady && !reduced;
  const turn = useSharedValue(0);
  useEffect(() => {
    if (!sweeping) return;

    turn.set(0);
    turn.set(withRepeat(withTiming(1, { duration: 2000, easing: Easing.linear }), -1, false));

    return () => cancelAnimation(turn);
  }, [sweeping, turn]);
  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get() * 360}deg` }] }));

  // Every layer stays mounted, so lighting up only changes opacity and never waits on an image decode.
  const lights = (
    <View style={s.lights}>
      <Image
        source={require('../../assets/crafted/header-lens/lens-lit-glow.webp')}
        style={[s.lensArt, !updateReady && s.unlit]}
      />
      <Image
        source={require('../../assets/crafted/header-lens/lens-off.webp')}
        style={[s.lensArt, updateReady && s.unlit]}
      />
      <Image
        source={require('../../assets/crafted/header-lens/lens-lit.webp')}
        style={[s.lensArt, !updateReady && s.unlit]}
      />
      <Animated.View style={[s.sweep, !sweeping && s.unlit, sweepStyle]}>
        <Image source={require('../../assets/crafted/header-lens/lens-sweep.webp')} style={s.sweepArt} />
      </Animated.View>
      {updateReady && (
        <View style={s.updateTag}>
          <Icon name="download" size={12} color="white" />
          <Txt maxFontSizeMultiplier={1.2} style={s.updateText}>
            Update
          </Txt>
        </View>
      )}
    </View>
  );

  if (!updateReady) return lights;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="New Pokédex update ready"
      accessibilityHint="Opens About, where you can update now"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => pressed && { opacity: 0.7 }}
    >
      {lights}
    </Pressable>
  );
}

/**
 * Tapping the current tab again pops its stack back to the first page (expo-router's stack handles `tabPress`).
 * No long-press handler: Pressable would then skip `onPress`, and with it the haptic and the fresh scan.
 */
function NavButton({
  item,
  onFocus,
  onSwitch,
}: {
  item: (typeof TABS)[number];
  onFocus: () => void;
  onSwitch: () => void;
}) {
  const { triggerProps } = useTabTrigger({ name: item.name });
  const selected = triggerProps.isFocused;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={item.label}
      onFocus={onFocus}
      onPress={(event) => {
        if (!selected) {
          tick();
          onSwitch();
        }

        triggerProps.onPress?.(event);
      }}
      style={s.navItem}
    >
      <View style={[s.navIcon, selected && s.navSelected]}>
        <Icon name={item.icon} size={23} color={selected ? 'white' : '#F9B7BC'} />
      </View>
      <Txt
        numberOfLines={1}
        maxFontSizeMultiplier={1.15}
        style={{
          color: selected ? 'white' : '#F9B7BC',
          fontSize: 12,
          fontWeight: selected ? '700' : '600',
          lineHeight: 18,
        }}
      >
        {item.label}
      </Txt>
    </Pressable>
  );
}

const s = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0, overflow: 'hidden' },
  // The list viewport stays fixed. The decorative header collapses; tabs remain available.
  topChrome: { zIndex: 1, position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: C.red },
  bottomChrome: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.red },
  feed: {
    position: 'absolute',
    top: PINNED_CHROME_HEIGHT,
    bottom: 0,
    left: 12,
    right: 12,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderColor: '#A72937',
    backgroundColor: C.screen,
    overflow: 'hidden',
  },
  screenTop: {
    marginHorizontal: 12,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderColor: '#A72937',
    overflow: 'hidden',
  },
  bottomFrame: { height: BOTTOM_FRAME_HEIGHT, marginHorizontal: 12, backgroundColor: C.red, pointerEvents: 'none' },
  screenBottom: {
    flex: 1,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderColor: '#A72937',
    backgroundColor: C.screen,
  },
  outside: { flex: 1, backgroundColor: '#762530', alignItems: 'center' },
  device: { flex: 1, backgroundColor: C.red, width: '100%', maxWidth: 1100 },
  tablet: {
    marginVertical: 16,
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F8797F',
    maxHeight: '96%',
  },
  header: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // The header's 93 × 44 pt footprint: the 44 pt lens, a 10 pt gap, then the three lights. The art carries a 16 pt
  // margin on every side for its shadow and glow, which spills past the footprint without moving anything.
  lights: { width: 93, height: 44 },
  lensArt: { position: 'absolute', left: -16, top: -16, width: 125, height: 76 },
  sweep: { position: 'absolute', left: -16, top: -16, width: 76, height: 76 },
  sweepArt: { width: 76, height: 76 },
  unlit: { opacity: 0 },
  updateTag: { position: 'absolute', left: 54, top: 20, flexDirection: 'row', alignItems: 'center', gap: 3 },
  updateText: { color: 'white', fontSize: 12, lineHeight: 15, fontWeight: '700' },
  trainer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, minHeight: 44 },
  hinge: { height: 15, flexDirection: 'row', marginBottom: 8 },
  hingeLine: {
    flex: 1,
    height: 4,
    backgroundColor: C.redDark,
    alignSelf: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: '#EB5E69',
  },
  hingeNotch: { width: 100, height: 15, backgroundColor: C.redDark, borderTopLeftRadius: 20 },
  screenLip: {
    height: 26,
    flexShrink: 0,
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 18,
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD6BE',
    backgroundColor: '#DDE5D4',
  },
  brand: { fontWeight: '900', fontSize: 11, lineHeight: 17, color: '#6B7B64', letterSpacing: 2 },
  speaker: { flexDirection: 'row', gap: 3 },
  speakerLine: { width: 3, height: 9, borderRadius: 2, backgroundColor: '#A5B299' },
  power: { height: 6, width: 6, borderRadius: 5, backgroundColor: '#6DAB63' },
  nav: { flexShrink: 0, flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 63, gap: 1 },
  navIcon: { width: 48, height: 35, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  navSelected: { backgroundColor: '#A42535' },
  toastSlot: { position: 'absolute', left: 24, right: 24, alignItems: 'center', zIndex: 2 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    maxWidth: 460,
    paddingLeft: 14,
    borderRadius: 14,
    backgroundColor: C.ink,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  undo: { minHeight: 48, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 25, gap: 15 },
  fill: { flex: 1 },
  hidden: { display: 'none' },
  updating: {
    ...StyleSheet.absoluteFill,
    zIndex: 3,
    backgroundColor: C.red,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    padding: 32,
  },
});
