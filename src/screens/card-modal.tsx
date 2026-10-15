import { CardInspection } from '@/components/card-inspection';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import {
  ActionRow,
  Button,
  ButtonRow,
  C,
  CardArt,
  CardCaption,
  ChoiceMenu,
  ErrorNotice,
  Icon,
  IconButton,
  S,
  Txt,
  pressFx,
  tick,
  ui,
} from '@/components/pokedex-ui';
import { LANGUAGE_LABELS } from '@/lib/languages';
import { cardKindLabel, pokemonIds } from '@/lib/card-kind';
import { useCollection } from '@/lib/collection-context';
import { fetchCard, speciesById } from '@/lib/catalog';
import {
  collectorNumber,
  changePrinting,
  defaultFinish,
  FINISH_LABELS,
  updateQuantity,
  type Card,
  type CardBrief,
  type Entry,
  type Finish,
} from '@/lib/model';
import { isWished, toggleWish } from '@/lib/wishlist';
import { useAddCards, type AddedCards } from '@/lib/use-add-cards';
import { CardPriceTag, CardValuePanel } from '@/components/card-values';
import { CardPriceDetails } from '@/components/card-price-details';
import { usePricing } from '@/lib/use-pricing';
import { priceKey } from '@/lib/pricing';
import { printingFinishes } from '@/lib/printing-prices';
import { useGrownUpCheck } from '@/components/grown-up-gate';
import { Sheet } from '@/components/sheet';

type CardPage = 'card' | 'price' | 'delete';

export function CardModal({
  brief,
  entry,
  draft,
  onClose,
  onAdded,
  onBusyChange,
}: {
  brief: CardBrief;
  entry?: Entry;
  draft?: Card;
  onClose: () => void;
  onAdded: (added: AddedCards) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { trainer, updateTrainer } = useCollection();
  const addCards = useAddCards();
  const [card, setCard] = useState<Card | null>(entry?.card ?? draft ?? null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(!entry && !draft);
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const [quantity, setQuantity] = useState(1);
  const [finish, setFinish] = useState<Finish>(entry?.finish ?? 'unsure');
  // Price details and the delete check are pages of this sheet, so Back keeps the printing and copies chosen here.
  const [page, setPage] = useState<CardPage>('card');
  const { locked, requireGrownUp, gate } = useGrownUpCheck();
  const liveEntry = entry ? trainer.entries.find((e) => e.key === entry.key) : undefined;
  const wished = isWished(trainer, brief);

  // Manual drafts have no catalog identity to reopen later, and owned cards are already granted.
  const canWish =
    !draft && (wished || !trainer.entries.some((e) => e.card.id === brief.id && e.card.language === brief.language));

  const [wishing, setWishing] = useState(false);
  const [wishError, setWishError] = useState<string | null>(null);
  const priceClient = usePricing([brief], 0);

  const printingChoices: Finish[] = [
    ...printingFinishes(card?.finishes ?? [], priceClient.snapshots[priceKey(brief)]),
    'unsure',
  ];

  // Read once per load: adding this card to the collection mustn't reload the open sheet.
  const savedCard = useEffectEvent(
    () => trainer.entries.find((e) => e.card.id === brief.id && e.card.language === brief.language)?.card,
  );

  // The sheet is keyed by card, so this runs when it opens and on "Try again".
  useEffect(() => {
    if (entry || draft) return;
    let active = true;
    const saved = savedCard();
    (saved ? Promise.resolve(saved) : fetchCard(brief))
      .then((c) => {
        if (!active) return;
        setCard(c);
        setFinish(defaultFinish(c));
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Unable to load this card. Try again.'))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [brief, entry, draft, retry]);

  async function run(action: () => Promise<void>) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    onBusyChange(true);
    setError(null);

    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not save this change. Please try again.');
    } finally {
      guard.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  function save() {
    if (!card) return;
    run(async () => onAdded(await addCards([{ card, finish, quantity }])));
  }

  async function toggleWished() {
    if (!card || wishing || guard.current) return;
    setWishing(true);
    setWishError(null);

    try {
      await updateTrainer((t) => toggleWish(t, card, pokemonIds(card)));
    } catch (e) {
      setWishError(e instanceof Error ? e.message : 'We could not update your wishlist. Please try again.');
    } finally {
      setWishing(false);
    }
  }

  const backToCard = () => setPage('card');

  if (page === 'price' && card)
    return (
      <Sheet title="Price details" onClose={onClose} onBack={backToCard} busy={busy}>
        <CardPriceDetails
          card={card}
          finish={finish}
          quantity={liveEntry?.quantity ?? quantity}
          disabled={busy}
          onChoose={(value) => {
            if (busy) return;
            setFinish(value);
            backToCard();
          }}
        />
      </Sheet>
    );

  if (page === 'delete' && card && liveEntry)
    return (
      <Sheet title="Delete card?" onClose={onClose} onBack={backToCard} busy={busy} overlay={gate}>
        <ScrollView style={m.scrolling} contentContainerStyle={m.content}>
          <View style={m.cardHero}>
            <CardArt card={card} style={{ width: 140, maxWidth: '100%' }} />
          </View>
          <View>
            <CardCaption
              name={card.name}
              setName={card.set.name}
              detail={`#${collectorNumber(card)} · ${FINISH_LABELS[liveEntry.finish]}${liveEntry.quantity > 1 ? ` · ${liveEntry.quantity} copies` : ''}`}
            />
            <CardPriceTag card={card} finish={liveEntry.finish} printingHint={false} />
          </View>
          <Txt>
            This removes {liveEntry.quantity === 1 ? card.name : `all ${liveEntry.quantity} copies of ${card.name}`} (
            {FINISH_LABELS[liveEntry.finish]}) from {trainer.name}'s binder. Other printings stay in your collection.
            You can add this card again later.
          </Txt>
          {locked && (
            <View style={m.lockNote}>
              <Icon name="lock" size={18} />
              <Txt variant="caption" style={{ flex: 1, minWidth: 0, fontWeight: '600' }}>
                A grown-up answers a quick question first.
              </Txt>
            </View>
          )}
          <ErrorNotice text={error} />
        </ScrollView>
        <View style={m.footer}>
          <ButtonRow>
            <Button title="Keep it" secondary disabled={busy} onPress={backToCard} />
            <Button
              title="Delete card"
              icon={locked ? 'lock' : undefined}
              busy={busy}
              style={m.destructive}
              onPress={() =>
                requireGrownUp(
                  () =>
                    run(async () => {
                      await updateTrainer((t) => updateQuantity(t, liveEntry.key, 0));
                      onClose();
                    }),
                  'delete this card',
                )
              }
            />
          </ButtonRow>
        </View>
      </Sheet>
    );

  return (
    <Sheet title={entry ? 'Card details' : 'Review card'} onClose={onClose} busy={busy} overlay={gate}>
      <ScrollView style={m.scrolling} contentContainerStyle={m.content} keyboardShouldPersistTaps="handled">
        {loading && (
          <View style={m.loading}>
            <ActivityIndicator color={C.ink} />
            <Txt>Finding the card details…</Txt>
          </View>
        )}
        <ErrorNotice text={error} />
        {!loading && !card && (
          <Button
            title="Try again"
            onPress={() => {
              setLoading(true);
              setError(null);
              setRetry((n) => n + 1);
            }}
            secondary
          />
        )}
        {card && (
          <>
            <View style={m.cardHero}>
              <CardInspection card={card} finish={finish} disabled={busy}>
                <CardArt key={card.id} card={card} high style={{ width: 160, maxWidth: '100%' }} />
              </CardInspection>
            </View>
            <View style={{ gap: S.xs }}>
              <View style={ui.between}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="title">{card.name}</Txt>
                  {card.language !== 'en' && card.dexIds.length > 0 && (
                    <Txt muted>
                      {card.dexIds
                        .map((id) => speciesById.get(id)?.en)
                        .filter(Boolean)
                        .join(' & ')}
                    </Txt>
                  )}
                </View>
                {liveEntry && (
                  <IconButton
                    disabled={busy}
                    icon="heart"
                    color={liveEntry.favorite ? C.red : C.muted}
                    filled={liveEntry.favorite}
                    label={liveEntry.favorite ? 'Remove from favorites' : 'Add to favorites'}
                    onPress={() =>
                      run(() =>
                        updateTrainer((t) => ({
                          ...t,
                          entries: t.entries.map((e) =>
                            e.key === liveEntry.key ? { ...e, favorite: !e.favorite } : e,
                          ),
                        })),
                      )
                    }
                  />
                )}
              </View>
              <Txt variant="caption" muted>
                {card.set.name} · {LANGUAGE_LABELS[card.language]}
              </Txt>
              <Txt variant="readout" muted>
                #{collectorNumber(card)} · {card.rarity} · {cardKindLabel(card)}
                {card.hp ? ` · HP ${card.hp}` : ''}
              </Txt>
              <Txt variant="caption" muted>
                {pokemonIds(card).length
                  ? `Pokédex entries: ${pokemonIds(card)
                      .map((id) => speciesById.get(id)?.en ?? `#${id}`)
                      .join(' & ')}`
                  : 'Counts toward your binder and collection badges.'}
              </Txt>
            </View>
            <CardValuePanel
              card={card}
              finish={finish}
              quantity={liveEntry?.quantity ?? quantity}
              onPress={() => !busy && setPage('price')}
            />
            <View style={m.section}>
              <ChoiceMenu
                disabled={busy}
                label="Printing"
                options={printingChoices.map((id) => ({ id, label: FINISH_LABELS[id] }))}
                value={finish}
                onChange={(value) => !busy && setFinish(value)}
              />
              {!entry && (
                <Txt variant="caption" muted>
                  Compare the artwork and card number with yours. Holo shines on the picture; reverse holo shines around
                  it.
                  {printingChoices.includes('pokemonCenter') &&
                    ' A Pokémon Center copy has the Pokémon Center logo stamped on the picture.'}{' '}
                  “Not sure yet” is okay.
                </Txt>
              )}
            </View>
            {liveEntry ? (
              <>
                <CopiesField
                  finish={liveEntry.finish}
                  quantity={liveEntry.quantity}
                  busy={busy}
                  minusLabel="Remove one copy"
                  plusLabel="Add one copy"
                  onMinus={() =>
                    liveEntry.quantity === 1
                      ? setPage('delete')
                      : run(() => updateTrainer((t) => updateQuantity(t, liveEntry.key, liveEntry.quantity - 1)))
                  }
                  onPlus={() =>
                    run(() => updateTrainer((t) => updateQuantity(t, liveEntry.key, liveEntry.quantity + 1)))
                  }
                />
                {card.description && <Txt>{card.description}</Txt>}
                <ActionRow title="Delete card" destructive disabled={busy} onPress={() => setPage('delete')} />
              </>
            ) : (
              <>
                <CopiesField
                  finish={finish}
                  quantity={quantity}
                  busy={busy}
                  minusDisabled={quantity <= 1}
                  minusLabel="Fewer copies"
                  plusLabel="More copies"
                  onMinus={() => setQuantity((n) => Math.max(1, n - 1))}
                  onPlus={() => setQuantity((n) => Math.min(999, n + 1))}
                />
                {canWish && (
                  <>
                    <WishButton wished={wished} disabled={busy || wishing} onPress={toggleWished} />
                    <ErrorNotice text={wishError} />
                    <Txt variant="caption" muted>
                      {wished
                        ? 'When you get it, add it to your binder. Wish granted!'
                        : 'Don’t have it yet? Wish for it and share your list with family.'}
                    </Txt>
                  </>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
      {card && !loading && (!liveEntry || finish !== liveEntry.finish) && (
        <View style={m.footer}>
          {liveEntry ? (
            <Button
              title="Save printing"
              busy={busy}
              onPress={() =>
                run(async () => {
                  await updateTrainer((t) => changePrinting(t, liveEntry.key, finish));
                  onClose();
                })
              }
            />
          ) : (
            <Button
              title={`Add ${quantity === 1 ? 'to binder' : `${quantity} to binder`}`}
              icon="plus"
              onPress={save}
              busy={busy}
            />
          )}
        </View>
      )}
    </Sheet>
  );
}

/** Copy controls stay in one row until the measured space or text size needs a second line. */
function CopiesField({
  finish,
  quantity,
  busy,
  minusDisabled = false,
  minusLabel,
  plusLabel,
  onMinus,
  onPlus,
}: {
  finish: Finish;
  quantity: number;
  busy: boolean;
  minusDisabled?: boolean;
  minusLabel: string;
  plusLabel: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const [stepperWidth, setStepperWidth] = useState(0);
  const stacked = width > 0 && width < (stepperWidth || 128) + S.lg + 112 * Math.min(fontScale, 1.4);

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[m.quantityField, stacked && m.quantityStacked]}
    >
      <View style={[m.quantityLabel, stacked && { flex: 0, width: '100%' }]}>
        <Txt>Copies</Txt>
        <Txt variant="caption" muted>
          {FINISH_LABELS[finish]}
        </Txt>
      </View>
      <View onLayout={(e) => setStepperWidth(e.nativeEvent.layout.width)} style={m.stepper}>
        <StepButton icon="minus" label={minusLabel} disabled={busy || minusDisabled} onPress={onMinus} />
        <Txt variant="readout" style={m.stepperNumber}>
          {quantity}
        </Txt>
        <StepButton icon="plus" label={plusLabel} disabled={busy} onPress={onPlus} />
      </View>
    </View>
  );
}

function StepButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'minus' | 'plus';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        tick();
        onPress();
      }}
      style={(state) => [m.stepButton, disabled && { opacity: 0.4 }, pressFx(state)]}
    >
      <Icon name={icon} size={20} />
    </Pressable>
  );
}

function WishButton({ wished, disabled, onPress }: { wished: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Button
      title={wished ? 'On your wishlist' : 'Add to wishlist'}
      accessibilityHint={
        wished ? 'Takes this card off your wishlist' : 'Saves this card to a list you can share with family'
      }
      selected={wished}
      icon="star"
      size="medium"
      secondary
      disabled={disabled}
      onPress={onPress}
      style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
    />
  );
}

const m = StyleSheet.create({
  scrolling: { flexShrink: 1 },
  content: { padding: S.xl, paddingBottom: S.xxl, gap: S.lg },
  cardHero: { alignItems: 'center' },
  lockNote: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  footer: { padding: S.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.paper },
  destructive: { backgroundColor: C.redDark },
  loading: { padding: 50, alignItems: 'center', gap: 14 },
  section: { gap: S.sm },
  quantityField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: S.lg,
    paddingVertical: S.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  quantityStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  quantityLabel: { flex: 1, minWidth: 0, gap: 2 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E8EEE1',
    borderRadius: 8,
  },
  stepperNumber: { fontSize: 20, lineHeight: 26, fontWeight: '600', minWidth: 32, textAlign: 'center' },
  stepButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
