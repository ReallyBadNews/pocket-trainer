import Animated, { FlipInYLeft, ZoomIn } from 'react-native-reanimated';
import { useChromeScroll } from '@/components/scroll-chrome';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { ActionRow, Button, C, CardArt, ErrorNotice, Icon, R, S, Segmented, Txt, tick } from '@/components/pokedex-ui';
import { fetchCard, type ScanCandidate } from '@/lib/catalog';
import { canRecognize, compareCardArtwork, recognizeCard, refineCard } from '@/lib/scanner';
import type { ScanLanguage } from '@/lib/language-detect';
import { identifyProgressively } from '@/lib/scan-pipeline';
import { pokemonIds } from '@/lib/card-kind';
import { useCollection } from '@/lib/collection-context';
import { defaultFinish, discoveredIds, withScanPhoto, type Card, type CardBrief } from '@/lib/model';
import { useAddCards, type AddedCards } from '@/lib/use-add-cards';
import { LiveCamera, type LiveMatch, type LivePhoto } from '@/components/live-camera';
import { PocketReview } from '@/components/pocket-review';
import { Sheet } from './collection-modals';
import type { Crop } from '@/lib/scan-types';
import {
  PAGE_LAYOUTS,
  pageSummary,
  pocketCrops,
  pocketIncluded,
  pocketNeedsCheck,
  pocketStatus,
  waitingPocket,
  type PageLayout,
  type Pocket,
} from '@/lib/page-scan';

type Photo = { uri: string; width: number; height: number; region?: Crop };

const detailKey = (card: CardBrief) => `${card.language}:${card.id}`;

// Picture comparison downloads reference art. On a full page it must not hold up the next pocket.
const COMPARE_LIMIT_MS = 3000;

function quickCompare(uri: string, candidates: ScanCandidate[]) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return Promise.race([
    compareCardArtwork(uri, candidates),
    new Promise<ScanCandidate[]>((resolve) => {
      timer = setTimeout(() => resolve(candidates), COMPARE_LIMIT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Read every pocket of one binder page, then add the confirmed cards together. */
export function PageScan({
  header,
  language,
  captureRequest,
  livePhoto,
  onCardPhoto,
  onAdded,
}: {
  header: ReactNode;
  language: ScanLanguage;
  captureRequest: number;
  /** A page photo already taken in the camera, read as soon as this opens. */
  livePhoto?: LivePhoto | null;
  /** The camera was switched to one card before its photo was taken. */
  onCardPhoto: (photo: LivePhoto, match?: LiveMatch) => void;
  onAdded: (added: AddedCards) => void;
}) {
  const scroll = useChromeScroll();
  const { trainer } = useCollection();
  const addCards = useAddCards();
  const [layout, setLayout] = useState<PageLayout>(PAGE_LAYOUTS[0]);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [pockets, setPockets] = useState<Pocket[]>([]);
  // The pocket being reviewed, still outlined on the page after the review closes.
  const [selected, setSelected] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [details, setDetails] = useState<Record<string, Card>>({});
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const [liveOpen, setLiveOpen] = useState(false);
  const generation = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
    };
  }, []);
  // "Next page" from the celebration opens the camera straight away.
  const handledCapture = useRef(captureRequest);
  const captureRequested = useEffectEvent(() => void takePhoto());
  useEffect(() => {
    if (captureRequest === handledCapture.current) return;
    handledCapture.current = captureRequest;
    captureRequested();
  }, [captureRequest]);

  // A page photographed from the live camera is read once, when the screen opens with it.
  const openedWithLivePhoto = useEffectEvent(() => {
    if (livePhoto) acceptLive(livePhoto);
  });

  useEffect(() => {
    openedWithLivePhoto();
  }, []);
  const discovered = useMemo(() => discoveredIds(trainer), [trainer]);
  const summary = pageSummary(pockets);

  function updatePocket(index: number, change: Partial<Pocket>) {
    setPockets((current) => current.map((pocket, i) => (i === index ? { ...pocket, ...change } : pocket)));
  }

  // Card details reveal new Pokémon before adding, and make the final add quick.
  function loadDetails(card: CardBrief) {
    const key = detailKey(card);
    const saved = trainer.entries.find((e) => detailKey(e.card) === key)?.card;

    if (saved) {
      setDetails((current) => ({ ...current, [key]: saved }));

      return;
    }

    fetchCard(card)
      .then((full) => alive.current && setDetails((current) => ({ ...current, [key]: full })))
      .catch(() => {});
  }

  async function readPage(next: Photo, pageLayout: PageLayout) {
    const id = ++generation.current;
    const crops = pocketCrops(pageLayout, next.region);
    setPockets(crops.map(waitingPocket));
    setSelected(null);
    setReviewing(false);
    setError(null);
    setNote(null);

    if (!canRecognize) {
      setNote('Page photo ready. Automatic reading works in the installed iPhone/iPad app.');

      return;
    }

    setBusy(true);
    const isCurrent = () => alive.current && generation.current === id;

    for (const [index, crop] of crops.entries()) {
      if (!isCurrent()) return;
      updatePocket(index, { status: 'reading' });
      let text = '';
      let matches: Pocket['matches'] = [];
      let photoUri: string | undefined;

      try {
        await identifyProgressively(
          { recognize: recognizeCard, refine: refineCard, compare: quickCompare },
          { uri: next.uri, language, crop, filter: 'all' },
          (scan, found) => {
            text = scan.text;
            matches = found;
            photoUri = scan.photoUri;
          },
          isCurrent,
        );
      } catch {
        /* An unreadable pocket should not stop the rest of the page. */
      }

      if (!isCurrent()) return;
      const status = pocketStatus(text, matches);
      const top = matches[0]?.card;
      const choice = top ? withScanPhoto(top, photoUri) : null;
      updatePocket(index, { status, matches, choice, photoUri });

      if (choice) loadDetails(choice);

      if (status === 'match') tick();
    }

    if (isCurrent()) setBusy(false);
  }

  async function takePhoto(library = false, system = false) {
    if (busy || adding) return;
    setError(null);

    if (!library && !system && Platform.OS !== 'web') {
      // iOS shows one sheet at a time, so the camera waits for the pocket review to slide away.
      if (reviewing) closeReview(() => setLiveOpen(true));
      else setLiveOpen(true);

      return;
    }

    setLiveOpen(false);

    try {
      if (!library) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();

        if (!permission.granted) {
          setNote('Camera access is off. Pick a photo of the page instead.');

          return;
        }
      }

      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };

      const result = library
        ? await ImagePicker.launchImageLibraryAsync(options)
        : await ImagePicker.launchCameraAsync(options);

      if (result.canceled || !alive.current) return;
      const asset = result.assets[0];
      const next = { uri: asset.uri, width: asset.width, height: asset.height };
      setPhoto(next);
      await readPage(next, layout);
    } catch (e) {
      console.warn('Page photo failed', e);

      if (alive.current) {
        setBusy(false);
        setError("Oops! That didn't work. Try again.");
      }
    }
  }

  // A photo picker can only open once the camera sheet has finished sliding away.
  const afterLive = useRef<(() => void) | null>(null);

  function leaveLive(next: () => void) {
    if (Platform.OS !== 'ios') {
      next();

      return;
    }

    afterLive.current = next;
    setLiveOpen(false);
  }

  function openPocket(index: number) {
    if (liveOpen) return;
    tick();
    setSelected(index);
    setReviewing(true);
  }

  const afterReview = useRef<(() => void) | null>(null);

  function closeReview(next?: () => void) {
    setReviewing(false);

    if (!next) return;

    if (Platform.OS === 'ios') afterReview.current = next;
    else next();
  }

  function acceptLive(next: LivePhoto, match?: LiveMatch) {
    setLiveOpen(false);

    if (!next.page) {
      onCardPhoto(next, match);

      return;
    }

    setLayout(next.page);
    setPhoto(next);
    void readPage(next, next.page);
  }

  function changeLayout(next: PageLayout) {
    if (busy || adding || next.id === layout.id) return;
    setLayout(next);

    if (photo) void readPage(photo, next);
  }

  function choose(index: number, card: CardBrief) {
    const pocket = pockets[index];
    const choice = withScanPhoto(card, pocket.photoUri);
    updatePocket(index, { choice, confirmed: true, skipped: false });
    loadDetails(choice);
  }

  async function addPage() {
    const chosen = pockets.filter(pocketIncluded).map((p) => p.choice!);

    if (!chosen.length || adding) return;
    setAdding(true);
    setError(null);

    try {
      const cards = await Promise.all(
        chosen.map(async (card) => {
          const full = details[detailKey(card)] ?? (await fetchCard(card));

          return {
            card: card.localImage ? { ...full, localImage: card.localImage } : full,
            finish: defaultFinish(full),
            quantity: 1,
          };
        }),
      );

      const added = await addCards(cards);

      if (!alive.current) return;
      generation.current++;
      setPhoto(null);
      setPockets([]);
      setSelected(null);
      setReviewing(false);
      setNote(`${cards.length} ${cards.length === 1 ? 'card' : 'cards'} added. Turn the page and scan the next one!`);
      onAdded(added);
    } catch (e) {
      console.warn('Adding page cards failed', e);

      if (alive.current) setError("Oops! That didn't work. Try again.");
    } finally {
      if (alive.current) setAdding(false);
    }
  }

  const gap = S.sm;
  const tileWidth = gridWidth ? Math.floor((gridWidth - 2 * S.sm - gap * (layout.columns - 1)) / layout.columns) : 0;
  const [rx, ry, rw, rh] = photo?.region ?? [0, 0, 1, 1];
  const pocketAspect = photo ? (photo.width * rw) / layout.columns / ((photo.height * rh) / layout.rows) : 0.716;

  // Tiles have a 3pt border, so the page slice fills the space inside it.
  const innerWidth = Math.max(0, tileWidth - 6),
    innerHeight = innerWidth / pocketAspect;

  // Show each pocket's slice of the page right away; the matched card flips in over it.
  const slice = (index: number, width: number, height: number) => {
    if (!photo) return null;

    const fullWidth = (width * layout.columns) / rw,
      fullHeight = (height * layout.rows) / rh;

    return (
      <Image
        source={photo.uri}
        contentFit="fill"
        style={{
          position: 'absolute',
          width: fullWidth,
          height: fullHeight,
          left: -rx * fullWidth - (index % layout.columns) * width,
          top: -ry * fullHeight - Math.floor(index / layout.columns) * height,
        }}
      />
    );
  };

  const active = selected !== null ? pockets[selected] : null;

  const helper = summary.toCheck
    ? `Tap the ? ${summary.toCheck === 1 ? 'card to check it' : 'cards to check them'}.`
    : summary.ready
      ? 'All set! Tap a card to change it.'
      : 'No cards found yet. Tap a card to change it.';

  return (
    <>
      <Modal
        visible={liveOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setLiveOpen(false)}
        onDismiss={() => {
          const next = afterLive.current;
          afterLive.current = null;
          next?.();
        }}
      >
        {liveOpen && (
          <LiveCamera
            mode="page"
            layout={layout}
            language={language}
            onCapture={acceptLive}
            onFallback={() => leaveLive(() => takePhoto(false, true))}
            onLibrary={() => leaveLive(() => takePhoto(true))}
            onClose={() => setLiveOpen(false)}
          />
        )}
      </Modal>
      <Modal
        visible={reviewing}
        transparent
        animationType="fade"
        onRequestClose={() => closeReview()}
        onDismiss={() => {
          const next = afterReview.current;
          afterReview.current = null;
          next?.();
        }}
      >
        {reviewing && active && selected !== null && (
          <Sheet title={`Pocket ${selected + 1} of ${pockets.length}`} onClose={() => closeReview()}>
            <PocketReview
              pockets={pockets}
              index={selected}
              onIndex={setSelected}
              slice={slice}
              aspect={pocketAspect}
              onChoose={(card) => choose(selected, card)}
              onSkip={(skipped) => updatePocket(selected, { skipped })}
              onClose={() => closeReview()}
            />
          </Sheet>
        )}
      </Modal>
      <Animated.ScrollView
        {...scroll}
        contentContainerStyle={[s.list, scroll.contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: S.lg }}>
          {header}
          {/* The same control as in the camera; changeLayout ignores taps while a page is being read or added. */}
          <Segmented
            label="Page layout"
            options={PAGE_LAYOUTS}
            value={layout.id}
            onChange={(id) => changeLayout(PAGE_LAYOUTS.find((option) => option.id === id)!)}
            style={(busy || adding) && s.locked}
          />
          {!photo ? (
            <>
              <View style={s.captureGuide}>
                <Icon name="binder" size={34} color={C.muted} />
                <Txt muted variant="caption" style={{ textAlign: 'center' }}>
                  Hold the phone flat above one binder page. Tilt it slightly if the sleeves shine.
                </Txt>
              </View>
              <Button title="Open camera" icon="camera" onPress={() => takePhoto()} disabled={busy || adding} />
              <ActionRow
                icon="photo"
                title="Pick from Photos"
                disabled={busy || adding}
                onPress={() => takePhoto(true)}
              />
            </>
          ) : (
            <View onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)} style={[s.grid, { gap }]}>
              {tileWidth > 0 &&
                pockets.map((pocket, index) => {
                  const card = pocket.choice ? details[detailKey(pocket.choice)] : undefined;
                  const included = pocketIncluded(pocket);
                  const isNew = !!card && included && pokemonIds(card).some((id) => !discovered.has(id));
                  const faded = pocket.skipped || pocket.status === 'empty';
                  const toCheck = pocketNeedsCheck(pocket);

                  const label =
                    pocket.status === 'reading' || pocket.status === 'waiting'
                      ? `Pocket ${index + 1}, reading`
                      : pocket.skipped
                        ? `Pocket ${index + 1}, skipped`
                        : pocket.choice
                          ? `Pocket ${index + 1}, ${pocket.choice.name}${included ? '' : ', needs checking'}`
                          : `Pocket ${index + 1}, ${pocket.status === 'empty' ? 'empty' : 'not recognized'}`;

                  return (
                    <Pressable
                      key={index}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      accessibilityHint="Opens this pocket to check it"
                      accessibilityState={{ selected: selected === index }}
                      disabled={pocket.status === 'waiting' || pocket.status === 'reading'}
                      onPress={() => openPocket(index)}
                      style={({ pressed }) => [
                        s.tile,
                        { width: tileWidth, height: innerHeight + 6 },
                        toCheck && s.tileCheck,
                        selected === index && s.tileSelected,
                        pressed && { transform: [{ scale: 0.96 }] },
                      ]}
                    >
                      {slice(index, innerWidth, innerHeight)}
                      {pocket.choice && !pocket.skipped && (
                        <Animated.View entering={FlipInYLeft.duration(420)} style={s.reveal}>
                          <CardArt card={pocket.choice} style={{ height: '100%', maxWidth: '100%' }} />
                        </Animated.View>
                      )}
                      {faded && <View style={s.fade} />}
                      {pocket.status === 'reading' && (
                        <View style={s.scanning}>
                          <ActivityIndicator color="white" />
                        </View>
                      )}
                      {pocket.status === 'waiting' && <View style={s.waiting} />}
                      {!pocket.skipped &&
                        pocket.status !== 'waiting' &&
                        pocket.status !== 'reading' &&
                        pocket.status !== 'empty' && (
                          <Animated.View
                            entering={ZoomIn.delay(250)}
                            style={[s.status, { backgroundColor: included ? '#3E8E4E' : C.gold }]}
                          >
                            {included ? (
                              <Icon name="check" size={16} color="white" />
                            ) : (
                              <Txt
                                maxFontSizeMultiplier={1}
                                style={{ fontWeight: '900', fontSize: 15, lineHeight: 19, color: C.ink }}
                              >
                                ?
                              </Txt>
                            )}
                          </Animated.View>
                        )}
                      {isNew && (
                        <Animated.View entering={ZoomIn.delay(420).springify()} style={s.newSlot}>
                          <View style={s.newTag}>
                            <Txt maxFontSizeMultiplier={1} style={s.newText}>
                              NEW!
                            </Txt>
                          </View>
                        </Animated.View>
                      )}
                    </Pressable>
                  );
                })}
            </View>
          )}
          {busy && (
            <View accessibilityLiveRegion="polite" style={s.tip}>
              <ActivityIndicator size="small" color={C.muted} />
              <Txt muted style={{ flex: 1, fontSize: 14 }}>
                Reading pocket {Math.min(pockets.length, pockets.length - summary.reading + 1)} of {pockets.length}…
              </Txt>
            </View>
          )}
          <ErrorNotice text={error} />
          {note && (
            <View style={s.note}>
              <Txt variant="caption">{note}</Txt>
            </View>
          )}
          {photo && !busy && pockets.length > 0 && (
            <>
              <Txt accessibilityLiveRegion="polite" variant="label" style={s.helper}>
                {helper}
              </Txt>
              <Button
                title={
                  summary.ready
                    ? `Add ${summary.ready} ${summary.ready === 1 ? 'card' : 'cards'}`
                    : 'No cards ready yet'
                }
                icon="plus"
                disabled={!summary.ready}
                busy={adding}
                onPress={addPage}
              />
            </>
          )}
          {photo && (
            <Button
              title="Scan another page"
              icon="camera"
              secondary
              onPress={() => takePhoto()}
              disabled={busy || adding}
            />
          )}
        </View>
      </Animated.ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  list: { padding: S.xl, paddingBottom: 40 },
  captureGuide: { alignItems: 'center', justifyContent: 'center', gap: S.sm, paddingVertical: S.md },
  locked: { opacity: 0.45, pointerEvents: 'none' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: S.sm,
    backgroundColor: '#2C4037',
    borderRadius: R.lg,
  },
  tile: {
    overflow: 'hidden',
    borderRadius: R.sm + 2,
    backgroundColor: '#1F2F27',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  tileCheck: { borderColor: C.gold },
  tileSelected: { borderColor: 'white' },
  reveal: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F2F27',
  },
  fade: { position: 'absolute', inset: 0, backgroundColor: '#1F2F27B0' },
  scanning: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#57C7E855',
    borderWidth: 2,
    borderColor: C.blue,
    borderRadius: 6,
  },
  waiting: { position: 'absolute', inset: 0, backgroundColor: '#1F2F2766' },
  status: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  newSlot: { position: 'absolute', left: 4, bottom: 4 },
  newTag: {
    backgroundColor: C.red,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'white',
    transform: [{ rotate: '-4deg' }],
  },
  newText: { fontWeight: '900', fontSize: 10, lineHeight: 13, color: 'white', letterSpacing: 0.4 },
  helper: { textAlign: 'center' },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  note: { padding: S.md, backgroundColor: '#DEE8D1', borderRadius: R.md, gap: S.xs },
});
