import Animated from 'react-native-reanimated';
import { useChromeScroll } from '@/components/scroll-chrome';
import { ZoomablePhoto } from '@/components/zoomable-photo';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActionRow,
  Button,
  ButtonRow,
  C,
  CardArt,
  CardCaption,
  Chip,
  ChoiceMenu,
  ErrorNotice,
  Icon,
  LinkButton,
  R,
  S,
  SearchBox,
  Segmented,
  Txt,
  ui,
} from '@/components/pokedex-ui';
import {
  fetchCard,
  needsScanRefinement,
  scanCandidates,
  searchCards,
  setForCard,
  ENERGY_SEARCHES,
  type ScanCandidate,
} from '@/lib/catalog';
import { canRecognize, recognizeCard, compareCardArtwork, refineCard } from '@/lib/scanner';
import { LANGUAGES, LANGUAGE_CODES, LANGUAGE_LABELS, PARTIAL_CATALOGS } from '@/lib/languages';
import { searchAnyLanguage, type ScanLanguage } from '@/lib/language-detect';
import { ManualCardForm } from '@/components/manual-card-form';
import { defaultFinish, type Card, type CardBrief, type Language } from '@/lib/model';
import { useCollection } from '@/lib/collection-context';
import { useAddCards, type AddedCards } from '@/lib/use-add-cards';
import { CardCrop } from '@/components/card-crop';
import { fullCrop, type Crop, type ScanResult } from '@/lib/scan-types';

import { CARD_FILTERS, cardKindLabel, scanTypeHint, type CardFilter } from '@/lib/card-kind';
import { identifyProgressively, type ScanStage } from '@/lib/scan-pipeline';
import { CardPriceTag } from '@/components/card-values';
import { PageScan } from './page-scan';
import { Sheet } from './collection-modals';
import { LiveCamera, SCAN_MODES, type LiveMatch, type LivePhoto } from '@/components/live-camera';

const MATCH_NOTE = 'Do the picture and bottom number match? Tap your card.';

const OOPS = "Oops! That didn't work. Try again.";

type ScanScreenProps = {
  onCard: (card: CardBrief, draft?: Card) => void;
  onAdded: (added: AddedCards, source: 'card' | 'page') => void;
  captureRequest: number;
  initialQuery?: string;
  sessionId: number;
};

type LanguageChoice = {
  autoLanguage: boolean;
  setAutoLanguage: (auto: boolean) => void;
  language: Language;
  setLanguage: (language: Language) => void;
};

export function ScanScreen({ sessionId, ...props }: ScanScreenProps) {
  // Auto-detect reads the language from each photo; `language` is the one in use.
  const [autoLanguage, setAutoLanguage] = useState(true);
  const [language, setLanguage] = useState<Language>('en');

  // Keep the language between cards; a saved card starts a fresh scan session.
  return (
    <ScanSession
      key={sessionId}
      {...props}
      autoLanguage={autoLanguage}
      setAutoLanguage={setAutoLanguage}
      language={language}
      setLanguage={setLanguage}
    />
  );
}

function ScanSession({
  onCard,
  onAdded,
  captureRequest,
  initialQuery = '',
  autoLanguage,
  setAutoLanguage,
  language,
  setLanguage,
}: Omit<ScanScreenProps, 'sessionId'> & LanguageChoice) {
  const scroll = useChromeScroll();
  const { trainer } = useCollection();
  const addCards = useAddCards();
  const [mode, setMode] = useState<'card' | 'page'>('card');
  const [quickDismissed, setQuickDismissed] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  // A page photo taken after switching modes inside the card camera, for the page reader.
  const [pagePhoto, setPagePhoto] = useState<LivePhoto | null>(null);
  const [manual, setManual] = useState(false);
  const [manualLanguage, setManualLanguage] = useState<Language>(language);
  const afterManual = useRef<Card | null>(null);
  const [detected, setDetected] = useState<Language | null>(null);
  const [typeFilter, setTypeFilter] = useState<CardFilter>('all');
  const [improving, setImproving] = useState<ScanStage>('done');
  const generation = useRef(0);
  const lastScan = useRef<ScanResult | null>(null);
  const [energyHint, setEnergyHint] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoSize, setPhotoSize] = useState<{ uri: string; aspectRatio: number } | null>(null);
  const [original, setOriginal] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [crop, setCrop] = useState<Crop>(fullCrop);
  const [manualCrop, setManualCrop] = useState<Crop | undefined>();
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [suggested, setSuggested] = useState<ScanCandidate[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const browsing = !query.trim() && typeFilter !== 'all' && !suggested.length;
  const scanLanguage: ScanLanguage = autoLanguage ? 'auto' : language;

  // A clear, finished match gets one big yes/no question instead of a list to compare.
  const sure =
    mode === 'card' &&
    !quickDismissed &&
    !query.trim() &&
    !browsing &&
    !busy &&
    improving === 'done' &&
    suggested.length > 0 &&
    !needsScanRefinement(suggested)
      ? suggested[0].card
      : null;

  const results = useMemo(
    () =>
      !(query.trim() || browsing)
        ? suggested.map((s) => s.card)
        : autoLanguage && query.trim()
          ? searchAnyLanguage(query, detected, 80, typeFilter)
          : searchCards(query, language, 80, typeFilter),
    [query, language, autoLanguage, detected, suggested, typeFilter, browsing],
  );

  async function readPhoto(uri: string, selectedLanguage: ScanLanguage, selection: Crop | undefined, id: number) {
    setError(null);
    setNote(null);
    setQuery('');
    setSuggested([]);
    lastScan.current = null;
    setEnergyHint(false);
    setImproving('done');
    setQuickDismissed(false);

    if (!canRecognize) {
      setNote(
        'Photo ready. Automatic reading works in the installed iPhone/iPad app. Search below in this browser preview.',
      );

      return;
    }

    await identifyProgressively(
      { recognize: recognizeCard, refine: refineCard, compare: compareCardArtwork },
      { uri, language: selectedLanguage, crop: selection, filter: typeFilter },
      (scan, matches, phase, cardLanguage) => {
        lastScan.current = scan;
        setLanguage(cardLanguage);
        setDetected(selectedLanguage === 'auto' ? cardLanguage : null);
        setPhoto(scan.photoUri);
        setCrop(scan.crop);
        setSuggested(matches);
        setImproving(phase);
        setEnergyHint(scanTypeHint(scan.topText) === 'energy');
        busyRef.current = false;
        setBusy(false);
        setNote(
          matches.length
            ? MATCH_NOTE
            : phase === 'done'
              ? 'Hmm, not sure. Try closer, or type the name below.'
              : 'Looking closer… You can type the name below while we read.',
        );
      },
      () => alive.current && generation.current === id,
    );
  }

  async function runScan(uri: string, selectedLanguage: ScanLanguage, selection?: Crop) {
    if (busyRef.current) return;
    const id = ++generation.current;
    busyRef.current = true;
    setBusy(true);

    try {
      await readPhoto(uri, selectedLanguage, selection, id);
    } catch (e) {
      console.warn('Card scan failed', e);

      if (alive.current && generation.current === id) setError(OOPS);
    } finally {
      if (alive.current && generation.current === id) {
        busyRef.current = false;
        setBusy(false);
        setImproving('done');
      }
    }
  }

  function changeType(next: CardFilter) {
    if (busyRef.current) return;
    ++generation.current;
    setImproving('done');
    setTypeFilter(next);

    // The same text can be re-ranked immediately; changing type never rereads the photo.
    if (lastScan.current) {
      const matches = scanCandidates(lastScan.current, language, 12, next);
      setSuggested(matches);
      setNote(matches.length ? MATCH_NOTE : 'No matches of this kind. Type the name below.');
    }
  }

  function changeLanguage(next: ScanLanguage) {
    if (busyRef.current || next === scanLanguage) return;
    ++generation.current;
    lastScan.current = null;
    setEnergyHint(false);
    setManual(false);
    setAutoLanguage(next === 'auto');
    setDetected(null);
    setLanguage(next === 'auto' ? 'en' : next);
    setSuggested([]);
    setNote(null);

    if (original) void runScan(original.uri, next, manualCrop);
  }

  async function takePhoto(library = false, system = false) {
    if (busyRef.current) return;

    if (!library && !system && Platform.OS !== 'web') {
      setLiveOpen(true);

      return;
    }

    setLiveOpen(false);
    const id = ++generation.current;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setImproving('done');

    try {
      if (!library) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();

        if (!permission.granted) {
          setNote('Camera access is off. Pick a photo, or type the name below.');

          return;
        }
      }

      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };

      const result = library
        ? await ImagePicker.launchImageLibraryAsync(options)
        : await ImagePicker.launchCameraAsync(options);

      if (result.canceled || !alive.current) return;
      const asset = result.assets[0];
      setOriginal({ uri: asset.uri, width: asset.width, height: asset.height });
      setPhoto(asset.uri);
      setManualCrop(undefined);
      setCrop(fullCrop);
      await readPhoto(asset.uri, scanLanguage, undefined, id);
    } catch (e) {
      console.warn('Card photo failed', e);

      if (alive.current && generation.current === id) setError(OOPS);
    } finally {
      if (alive.current && generation.current === id) {
        busyRef.current = false;
        setBusy(false);
        setImproving('done');
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

  // The live camera may already have read the card; otherwise the photo goes through the normal reader.
  function acceptLive(next: LivePhoto, match?: LiveMatch) {
    setLiveOpen(false);
    setError(null);

    if (next.page) {
      ++generation.current;
      setImproving('done');
      setPagePhoto(next);
      setMode('page');

      return;
    }

    setOriginal(next);
    setPhoto(next.uri);
    setManualCrop(undefined);
    setCrop(fullCrop);

    if (!match) {
      void runScan(next.uri, scanLanguage);

      return;
    }

    ++generation.current;
    lastScan.current = match.scan;
    setLanguage(match.language);
    setDetected(scanLanguage === 'auto' ? match.language : null);
    setPhoto(match.scan.photoUri);
    setCrop(match.scan.crop);
    setSuggested(match.matches);
    setQuery('');
    setQuickDismissed(false);
    setEnergyHint(false);
    setImproving('done');
    setNote(MATCH_NOTE);
  }

  // "Scan another card" from the celebration opens the camera straight away.
  const handledCapture = useRef(captureRequest);
  useEffect(() => {
    if (captureRequest === handledCapture.current || mode !== 'card') return;
    handledCapture.current = captureRequest;
    void takePhoto();
  }, [captureRequest, mode]);

  const withPhoto = (card: CardBrief) => ({
    ...card,
    ...(!card.image && photo?.startsWith('file://') ? { localImage: photo } : {}),
  });

  async function quickAdd(brief: CardBrief) {
    if (quickBusy) return;
    setQuickBusy(true);
    setError(null);

    try {
      const existing = trainer.entries.find((e) => e.card.id === brief.id && e.card.language === brief.language);
      const card = existing?.card ?? (await fetchCard(withPhoto(brief)));
      const added = await addCards([{ card, finish: existing?.finish ?? defaultFinish(card), quantity: 1 }]);

      if (!alive.current) return;
      ++generation.current;
      lastScan.current = null;
      setSuggested([]);
      setPhoto(null);
      setOriginal(null);
      setManualCrop(undefined);
      setNote(null);
      onAdded(added, 'card');
    } catch (e) {
      console.warn('Adding card failed', e);

      if (alive.current) setError(OOPS);
    } finally {
      if (alive.current) setQuickBusy(false);
    }
  }

  const intro = (
    <>
      {!sure && (
        <View>
          <Txt accessibilityRole="header" variant="title">
            Scan cards
          </Txt>
          <Txt muted variant="caption">
            Capture a card or find it by name.
          </Txt>
        </View>
      )}
      <Segmented
        label="What are you scanning?"
        options={SCAN_MODES}
        value={mode}
        onChange={(id) => {
          if (busy) return;
          ++generation.current;
          setImproving('done');
          setPagePhoto(null);
          setMode(id);
        }}
      />
      <ChoiceMenu<ScanLanguage>
        disabled={busy || quickBusy}
        label="Card language"
        options={[{ id: 'auto', label: 'Auto-detect' }, ...LANGUAGES.map((id) => ({ id, label: LANGUAGE_LABELS[id] }))]}
        value={scanLanguage}
        onChange={changeLanguage}
      />
      {detected && photo && autoLanguage && (
        <Txt muted variant="caption">
          Detected: {LANGUAGE_LABELS[detected]}
        </Txt>
      )}
    </>
  );

  if (mode === 'page')
    return (
      <PageScan
        header={intro}
        language={scanLanguage}
        captureRequest={captureRequest}
        livePhoto={pagePhoto}
        onCardPhoto={(next, match) => {
          setPagePhoto(null);
          setMode('card');
          acceptLive(next, match);
        }}
        onAdded={(added) => onAdded(added, 'page')}
      />
    );

  if (editing && original)
    return (
      <Animated.ScrollView
        {...scroll}
        scrollEnabled={!dragging}
        contentContainerStyle={[s.list, scroll.contentContainerStyle]}
      >
        <CardCrop
          photo={original}
          initial={crop}
          onDrag={setDragging}
          onCancel={() => {
            setEditing(false);
            setDragging(false);
          }}
          onConfirm={(selection) => {
            setEditing(false);
            setDragging(false);
            setManualCrop(selection);
            void runScan(original.uri, scanLanguage, selection);
          }}
        />
      </Animated.ScrollView>
    );

  const liveCamera = (
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
          mode="card"
          language={scanLanguage}
          onCapture={acceptLive}
          onFallback={() => leaveLive(() => takePhoto(false, true))}
          onLibrary={() => leaveLive(() => takePhoto(true))}
          onClose={() => setLiveOpen(false)}
        />
      )}
    </Modal>
  );

  return (
    <>
      <Animated.FlatList
        {...scroll}
        data={sure ? [] : results}
        keyExtractor={(c) => `${c.language}:${c.id}`}
        contentContainerStyle={[s.list, scroll.contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 16 }}>
            {intro}
            {sure && (
              <View accessibilityLiveRegion="polite" style={s.quick}>
                <Txt style={[ui.subtitle, { textAlign: 'center' }]}>Is this your card?</Txt>
                <View>
                  <CardArt card={sure} high style={s.quickArt} />
                  {photo && (
                    <View style={s.yours}>
                      <Image
                        source={photo}
                        style={{ width: 58, height: 80 }}
                        contentFit="cover"
                        accessibilityLabel="Your photo"
                      />
                      <Txt style={s.yoursLabel}>Yours</Txt>
                    </View>
                  )}
                </View>
                <View style={{ alignItems: 'center', gap: S.xs }}>
                  <Txt variant="subtitle" style={{ textAlign: 'center' }}>
                    {sure.name}
                  </Txt>
                  <Txt muted variant="caption" style={{ textAlign: 'center' }}>
                    {setForCard(sure)?.name ?? sure.id}
                  </Txt>
                  <Txt muted variant="readout">
                    #{sure.localId} · {LANGUAGE_CODES[sure.language]}
                  </Txt>
                </View>
                <Button title="Yes! Add it" icon="check" busy={quickBusy} onPress={() => quickAdd(sure)} />
                <ButtonRow>
                  <Button
                    size="medium"
                    title="No, it's not"
                    secondary
                    disabled={quickBusy}
                    onPress={() => setQuickDismissed(true)}
                  />
                  <Button
                    size="medium"
                    title="See card"
                    secondary
                    disabled={quickBusy}
                    onPress={() => {
                      ++generation.current;
                      onCard(withPhoto(sure));
                    }}
                  />
                </ButtonRow>
              </View>
            )}
            {!sure && (
              <>
                {photo ? (
                  <View>
                    <View style={s.capture}>
                      <ZoomablePhoto
                        dark
                        key={photo}
                        aspectRatio={photoSize?.uri === photo ? photoSize.aspectRatio : 0}
                        label="Your card photo"
                        renderPhoto={(width, height) => (
                          <Image source={photo} style={{ width, height }} contentFit="contain" />
                        )}
                      >
                        <Image
                          source={photo}
                          style={{ height: 195, width: 150 }}
                          contentFit="contain"
                          accessibilityLabel="Your card photo"
                          onLoad={({ source }) =>
                            setPhotoSize({ uri: photo, aspectRatio: source.width / source.height })
                          }
                        />
                      </ZoomablePhoto>
                      {busy && (
                        <View style={s.reading}>
                          <ActivityIndicator color="white" />
                          <Txt style={{ color: 'white' }}>Reading the name and number…</Txt>
                        </View>
                      )}
                    </View>
                    {/* Fixes for this photo sit on it as quiet links, so they never compete with the camera. */}
                    {original && canRecognize && (
                      <View style={[s.photoActions, busy && s.locked]}>
                        <LinkButton
                          title="Adjust crop"
                          icon="scan"
                          onPress={() => {
                            if (busyRef.current) return;
                            ++generation.current;
                            setImproving('done');
                            setEditing(true);
                          }}
                        />
                        <LinkButton
                          title="Read again"
                          icon="search"
                          onPress={() => runScan(original.uri, scanLanguage, manualCrop)}
                        />
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={s.captureGuide}>
                    <Icon name="scan" size={34} color={C.muted} />
                    <Txt muted variant="caption" style={{ textAlign: 'center' }}>
                      Keep the whole card and bottom number in view.
                    </Txt>
                  </View>
                )}
                <Button
                  title={photo ? 'Retake photo' : 'Open camera'}
                  icon="camera"
                  onPress={() => takePhoto()}
                  busy={busy}
                />
                {/* Other ways to add a card open their own sheet, so they are navigation rows rather than more buttons. */}
                <View>
                  <ActionRow icon="photo" title="Pick from Photos" disabled={busy} onPress={() => takePhoto(true)} />
                  <ActionRow
                    icon="plus"
                    title="Type in a card"
                    disabled={busy}
                    onPress={() => {
                      setManualLanguage(language);
                      setManual(true);
                    }}
                  />
                </View>
              </>
            )}
            {improving !== 'done' && (
              <View accessibilityLiveRegion="polite" style={s.tip}>
                <ActivityIndicator size="small" color={C.muted} />
                <Txt muted style={{ flex: 1, fontSize: 14 }}>
                  {improving === 'refining'
                    ? 'Reading the small print… You can choose a match now.'
                    : 'Checking pictures… You can choose a match now.'}
                </Txt>
              </View>
            )}
            <ErrorNotice text={error} />
            {note && !sure && (
              <View style={s.note}>
                <Txt style={{ fontSize: 14 }}>{note}</Txt>
              </View>
            )}
            <View style={{ gap: S.sm }}>
              <Txt accessibilityRole="header" variant="subtitle">
                {sure ? 'Or search for it' : 'Find a card'}
              </Txt>
              <SearchBox value={query} onChange={setQuery} placeholder="Pokémon name or card number" />
              <ChoiceMenu
                disabled={busy || quickBusy}
                label="Card kind"
                options={CARD_FILTERS}
                value={typeFilter}
                onChange={changeType}
              />
            </View>
            {(typeFilter === 'energy' || energyHint) && (
              <View style={s.note}>
                <Txt variant="label">An Energy card with just a symbol?</Txt>
                <Txt muted variant="caption">
                  Pick its energy type, then check the bottom number.
                </Txt>
                <View style={[ui.row, { flexWrap: 'wrap', marginTop: S.xs }]}>
                  {ENERGY_SEARCHES.map((e) => (
                    <Chip
                      key={e.label}
                      label={e.label}
                      onPress={() => {
                        changeType('energy');
                        setQuery(e[language]);
                      }}
                    />
                  ))}
                </View>
              </View>
            )}
            {results.length > 0 && !sure && (
              <Txt variant="label">
                {query || browsing ? `${results.length === 80 ? 'First 80' : results.length} found. ` : ''}Which one is
                yours? Tap it.
              </Txt>
            )}
          </View>
        }
        ListEmptyComponent={
          query.trim() ? (
            <View style={s.note}>
              <Txt style={{ fontWeight: '700' }}>No matching cards</Txt>
              <Txt muted style={{ fontSize: 14 }}>
                Try just the Pokémon's name or the card number, or choose a different card language.
              </Txt>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Review ${item.name} ${item.id}`}
            onPress={() => {
              ++generation.current;
              setImproving('done');
              onCard(withPhoto(item));
            }}
            style={({ pressed }) => [s.result, pressed && { opacity: 0.65 }]}
          >
            <CardArt card={item} high style={s.resultArt} />
            <View style={s.resultDetails}>
              <View style={{ flex: 1, minWidth: 0, gap: S.xs }}>
                <CardCaption
                  name={item.name}
                  setName={setForCard(item)?.name ?? item.id}
                  detail={`#${item.localId} · ${LANGUAGE_CODES[item.language]}`}
                />
                <Txt muted variant="caption">
                  {cardKindLabel(item)}
                </Txt>
                {!query && (
                  <Txt muted variant="caption">
                    {suggested.find((s) => s.card.id === item.id)?.evidence}
                  </Txt>
                )}
                <CardPriceTag card={item} enabled={!busy && improving === 'done'} />
              </View>
              <Icon name="chevron" size={16} color={C.muted} />
            </View>
          </Pressable>
        )}
      />
      {liveCamera}
      <Modal
        visible={manual}
        transparent
        animationType="fade"
        onRequestClose={() => setManual(false)}
        onDismiss={() => {
          const card = afterManual.current;
          afterManual.current = null;

          if (card) onCard(card, card);
        }}
      >
        {manual && (
          <Sheet title="Type in a card" onClose={() => setManual(false)} dismissible={false}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              contentContainerStyle={s.manualContent}
            >
              <Txt muted variant="caption">
                Use the name, set code and number printed on your card.
              </Txt>
              <ChoiceMenu
                label="Card language"
                options={LANGUAGES.map((id) => ({ id, label: LANGUAGE_LABELS[id] }))}
                value={manualLanguage}
                onChange={setManualLanguage}
              />
              {PARTIAL_CATALOGS.includes(manualLanguage) && (
                <Txt muted variant="caption">
                  Catalog coverage is still growing. Manual entry lets you keep unlisted cards in your binder.
                </Txt>
              )}
              <ManualCardForm
                key={manualLanguage}
                language={manualLanguage}
                photoUri={photo ?? undefined}
                onReview={(card) => {
                  ++generation.current;
                  setManual(false);

                  // iOS must dismiss this sheet before the root card review modal can open.
                  if (Platform.OS === 'ios') afterManual.current = card;
                  else onCard(card, card);
                }}
              />
            </ScrollView>
          </Sheet>
        )}
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  list: { padding: S.xl, paddingBottom: 40 },
  quick: { gap: S.md },
  quickArt: { width: 180, maxWidth: '70%', alignSelf: 'center' },
  yours: {
    position: 'absolute',
    left: 8,
    bottom: -6,
    padding: 3,
    borderRadius: 9,
    backgroundColor: 'white',
    transform: [{ rotate: '-6deg' }],
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  yoursLabel: { fontSize: 10, lineHeight: 14, fontWeight: '800' },
  capture: {
    minHeight: 215,
    backgroundColor: '#2C4037',
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 2,
    overflow: 'hidden',
  },
  captureGuide: { alignItems: 'center', justifyContent: 'center', gap: S.sm, paddingVertical: S.md },
  photoActions: { flexDirection: 'row', gap: S.xl },
  locked: { opacity: 0.45, pointerEvents: 'none' },
  manualContent: { padding: S.xl, gap: S.md, paddingBottom: S.xxl },
  reading: {
    position: 'absolute',
    inset: 0,
    backgroundColor: '#20392BE8',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  note: { padding: S.md, backgroundColor: '#DEE8D1', borderRadius: R.md, gap: S.xs },
  resultArt: { width: 90, alignSelf: 'flex-start' },
  resultDetails: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: S.sm },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
    paddingVertical: S.md,
  },
});
