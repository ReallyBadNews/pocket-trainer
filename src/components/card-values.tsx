import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type TextStyle } from 'react-native';
import { C, Icon, R, S, Txt, pressFx, tick } from './pokedex-ui';
import { usePricing } from '@/lib/use-pricing';
import { collectionValue, priceKey, quoteLabel, quotePrice, usd } from '@/lib/pricing';
import type { CardBrief, Entry, Finish } from '@/lib/model';

export const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Ranges wrap between whole amounts, never inside one. */
export function PriceAmount({ value, size }: { value: { low: number; high: number }; size: 'tag' | 'readout' }) {
  const amount = size === 'tag' ? s.tagAmount : s.amount;

  return (
    <View style={s.amountRow}>
      <Txt variant="readout" style={amount}>
        {usd(value.low)}
      </Txt>
      {value.high !== value.low && (
        <View style={s.rangeEnd}>
          <Txt style={[s.rangeDash, size === 'tag' && s.tagDash]}>–</Txt>
          <Txt variant="readout" style={amount}>
            {usd(value.high)}
          </Txt>
        </View>
      )}
    </View>
  );
}

/** A Pokédex-style readout window: what something is worth. Tapping it opens the details on their own page. */
function ValueReadout({
  label,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  children,
}: {
  label: string;
  accessibilityLabel: string;
  accessibilityHint: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={() => {
        tick();
        onPress();
      }}
      style={(state) => [s.readout, pressFx(state)]}
    >
      <View style={s.readoutText}>
        <Txt variant="caption" style={s.readoutLabel}>
          {label}
        </Txt>
        {children}
      </View>
      <View style={{ transform: [{ rotate: '180deg' }] }}>
        <Icon name="back" size={16} color={C.muted} />
      </View>
    </Pressable>
  );
}

export function CardPriceTag({
  card,
  finish = 'unsure',
  enabled = true,
  printingHint = true,
}: {
  card: CardBrief;
  finish?: Finish;
  enabled?: boolean;
  printingHint?: boolean;
}) {
  const client = usePricing([card], 10, enabled);

  const key = priceKey(card),
    snapshot = client.snapshots[key];

  const quote = quotePrice(snapshot, finish, client.fx);

  const waiting =
    !client.ready ||
    client.pending.has(key) ||
    (!client.fx && client.pending.has('fx') && !!snapshot?.prices.some((p) => p.currency === 'EUR'));

  return (
    <View style={s.tag}>
      {quote ? (
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Worth about ${quoteLabel(quote)}${quote.converted ? ', converted from euros' : ''}${quote.stale ? ', saved price' : ''}`}
        >
          <PriceAmount value={quote} size="tag" />
        </View>
      ) : (
        <Txt muted variant="caption">
          {waiting
            ? 'Looking up value…'
            : snapshot || client.errors.has(key)
              ? 'Price unavailable'
              : enabled
                ? 'Value pending'
                : 'Value after matching'}
        </Txt>
      )}
      {printingHint && finish === 'unsure' && (
        <Txt variant="caption" style={s.attentionCaption}>
          Needs printing
        </Txt>
      )}
    </View>
  );
}

export function CardValuePanel({
  card,
  finish,
  quantity,
  onPress,
}: {
  card: CardBrief;
  finish: Finish;
  quantity: number;
  onPress: () => void;
}) {
  const client = usePricing([card], 0);

  const key = priceKey(card),
    snapshot = client.snapshots[key];

  const quote = quotePrice(snapshot, finish, client.fx);
  const waiting = !client.ready || client.pending.has(key) || (!client.fx && client.pending.has('fx'));
  const failed = client.errors.has(key) || (!quote && client.errors.has('fx'));
  const copies = quote && quantity > 1 ? `${quantity} copies: ${quoteLabel(quote, quantity)}` : undefined;

  return (
    <ValueReadout
      label="Estimated value"
      onPress={onPress}
      accessibilityHint="Opens price details for every printing"
      accessibilityLabel={`Estimated value, ${quote ? `about ${quoteLabel(quote)}${copies ? `. ${copies}` : ''}` : waiting ? 'looking up price' : 'unavailable'}`}
    >
      {quote ? (
        <PriceAmount value={quote} size="readout" />
      ) : (
        <Txt muted style={s.emptyAmount}>
          {waiting ? 'Looking up price…' : failed ? 'Price unavailable' : 'No price yet'}
        </Txt>
      )}
      {copies && (
        <Txt variant="label" style={s.tabular}>
          {copies}
        </Txt>
      )}
      {quote?.unconfirmed && (
        <Txt variant="caption" style={s.attentionCaption}>
          Choose your printing for an exact price
        </Txt>
      )}
    </ValueReadout>
  );
}

/**
 * The collection total, coverage and loading state, worked out in one place so the readout and the collection value
 * page always agree. `checking` means requests are in flight; `updating` also covers cards not looked up yet.
 */
export function useCollectionValue(entries: Entry[]) {
  const cards = entries.map((e) => e.card);
  const client = usePricing(cards, 20);
  const value = collectionValue(entries, client.snapshots, client.fx);
  const total = value.priced + value.missing;
  const checking = entries.some((e) => client.pending.has(priceKey(e.card))) || client.pending.has('fx');

  const unresolved =
    !client.ready || entries.some((e) => !client.snapshots[priceKey(e.card)] && !client.errors.has(priceKey(e.card)));

  const coverage = value.missing
    ? `${value.priced} of ${total} cards priced`
    : total === 1
      ? 'Your card is priced'
      : `All ${total} cards priced`;

  const refresh = () => {
    void client.ensure(cards, () => true, 20, true);
    void client.ensureFx(true);
  };

  return { client, value, total, coverage, checking, updating: checking || unresolved, refresh };
}

export type CollectionPricing = ReturnType<typeof useCollectionValue>;

/**
 * The headline counts unconfirmed printings at their lowest available price, so it only goes up as printings are
 * confirmed; the high end of the range is shown beside it.
 */
export function CollectionValue({ entries, onPress }: { entries: Entry[]; onPress: () => void }) {
  const { value, coverage, updating } = useCollectionValue(entries);

  const status = [coverage, value.high > value.low && `up to ${usd(value.high)}`, updating && 'updating…']
    .filter(Boolean)
    .join(' · ');

  return (
    <ValueReadout
      label="Collection value"
      onPress={onPress}
      accessibilityHint="Opens your most valuable cards and how the total is worked out"
      accessibilityLabel={`Collection value, ${value.priced ? `about ${usd(value.low)}` : updating ? 'looking up prices' : 'not priced yet'}. ${status}`}
    >
      {value.priced ? (
        <Txt variant="readout" style={s.total}>
          {usd(value.low)}
        </Txt>
      ) : (
        <Txt muted style={s.emptyAmount}>
          {updating ? 'Looking up prices…' : 'Not priced yet'}
        </Txt>
      )}
      <Txt muted variant="caption">
        {status}
      </Txt>
    </ValueReadout>
  );
}

/** The collection value page's headline: the same readout window, larger, with nothing to tap. */
export function CollectionValueHero({ pricing, newest }: { pricing: CollectionPricing; newest?: string }) {
  const { value, coverage, updating } = pricing;
  const range = value.high > value.low ? `up to ${usd(value.high)}` : undefined;

  const label = [
    `Collection value, ${value.priced ? `about ${usd(value.low)}` : updating ? 'looking up prices' : 'not priced yet'}`,
    range,
    coverage,
    updating && 'updating prices',
    newest && `prices from ${dateLabel(newest)}`,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View accessible accessibilityRole="summary" accessibilityLabel={label} style={[s.readout, s.hero]}>
      <Txt variant="caption" style={s.readoutLabel}>
        Collection value
      </Txt>
      {value.priced ? (
        <Txt variant="readout" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={s.heroTotal}>
          {usd(value.low)}
        </Txt>
      ) : (
        <Txt muted style={s.emptyAmount}>
          {updating ? 'Looking up prices…' : 'Not priced yet'}
        </Txt>
      )}
      {range && (
        <Txt variant="label" style={s.heroRange}>
          {range}
        </Txt>
      )}
      <Txt variant="caption" style={s.heroCoverage}>
        {coverage}
      </Txt>
      {(updating || newest) && (
        <View style={s.heroStatus}>
          {updating && <ActivityIndicator size="small" color={C.muted} />}
          <Txt muted variant="caption" style={{ flexShrink: 1 }}>
            {[updating && 'Updating prices…', newest && `Prices from ${dateLabel(newest)}`].filter(Boolean).join(' · ')}
          </Txt>
        </View>
      )}
    </View>
  );
}

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

const s = StyleSheet.create({
  tag: { marginTop: S.xs, gap: 2 },
  readout: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    paddingVertical: S.md,
    borderRadius: R.md,
    backgroundColor: '#DFE9CE',
    borderWidth: 1,
    borderColor: '#C9D8B5',
    paddingHorizontal: S.lg,
  },
  readoutText: { flex: 1, minWidth: 0, gap: 2 },
  readoutLabel: { color: C.muted, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  amountRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 4, rowGap: 0 },
  rangeEnd: { flexDirection: 'row', alignItems: 'baseline', gap: 4, maxWidth: '100%' },
  amount: {
    color: C.ink,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
    ...tabular,
    flexShrink: 1,
  },
  total: { color: C.ink, fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.6, ...tabular },
  tagAmount: {
    color: C.ink,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.2,
    ...tabular,
    flexShrink: 1,
  },
  rangeDash: { color: '#7A8C73', fontSize: 24, lineHeight: 34, fontWeight: '400' },
  tagDash: { fontSize: 16, lineHeight: 22 },
  emptyAmount: { fontSize: 18, lineHeight: 27, paddingVertical: 3 },
  hero: { flexDirection: 'column', alignItems: 'stretch', gap: 2, paddingVertical: S.lg },
  heroTotal: { color: C.ink, fontSize: 42, lineHeight: 50, fontWeight: '800', letterSpacing: -1, ...tabular },
  heroRange: { color: C.ink, fontSize: 16, lineHeight: 22, ...tabular },
  heroCoverage: { color: C.ink, fontWeight: '600', ...tabular },
  heroStatus: { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginTop: S.xs },
  tabular,
  attentionCaption: { color: '#786037', fontWeight: '600' },
});
