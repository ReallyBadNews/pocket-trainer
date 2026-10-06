import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type TextStyle } from 'react-native';
import { C, Icon, R, S, Txt, pressFx, tick } from './pokedex-ui';
import { usePricing } from '@/lib/use-pricing';
import { collectionValue, priceKey, quoteLabel, quotePrice, usd } from '@/lib/pricing';
import type { CardBrief, Entry, Finish } from '@/lib/model';

export const dateLabel = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Ranges wrap between whole amounts, never inside one. */
export function PriceAmount({ value, size }: { value: { low: number; high: number }; size: 'tag' | 'readout' }) {
  const amount = size === 'tag' ? s.tagAmount : s.amount;
  return <View style={s.amountRow}>
    <Txt variant="readout" style={amount}>{usd(value.low)}</Txt>
    {value.high !== value.low && <View style={s.rangeEnd}><Txt style={[s.rangeDash, size === 'tag' && s.tagDash]}>–</Txt><Txt variant="readout" style={amount}>{usd(value.high)}</Txt></View>}
  </View>;
}

/** A Pokédex-style readout window: what something is worth. Tapping it opens the details on their own page. */
function ValueReadout({ label, accessibilityLabel, accessibilityHint, onPress, children }: { label: string; accessibilityLabel: string; accessibilityHint: string; onPress: () => void; children: ReactNode }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint} onPress={() => { tick(); onPress(); }} style={state => [s.readout, pressFx(state)]}>
    <View style={s.readoutText}><Txt variant="caption" style={s.readoutLabel}>{label}</Txt>{children}</View>
    <View style={{ transform: [{ rotate: '180deg' }] }}><Icon name="back" size={16} color={C.muted} /></View>
  </Pressable>;
}

export function CardPriceTag({ card, finish = 'unsure', enabled = true, printingHint = true }: { card: CardBrief; finish?: Finish; enabled?: boolean; printingHint?: boolean }) {
  const client = usePricing([card], 10, enabled);
  const key = priceKey(card), snapshot = client.snapshots[key];
  const quote = quotePrice(snapshot, finish, client.fx);
  const waiting = !client.ready || client.pending.has(key) || (!client.fx && client.pending.has('fx') && !!snapshot?.prices.some(p => p.currency === 'EUR'));
  return <View style={s.tag}>
    {quote ? <View accessible accessibilityRole="text" accessibilityLabel={`Worth about ${quoteLabel(quote)}${quote.converted ? ', converted from euros' : ''}${quote.stale ? ', saved price' : ''}`}><PriceAmount value={quote} size="tag" /></View> : <Txt muted variant="caption">{waiting ? 'Looking up value…' : snapshot || client.errors.has(key) ? 'Price unavailable' : enabled ? 'Value pending' : 'Value after matching'}</Txt>}
    {printingHint && finish === 'unsure' && <Txt variant="caption" style={s.attentionCaption}>Needs printing</Txt>}
  </View>;
}

export function CardValuePanel({ card, finish, quantity, onPress }: { card: CardBrief; finish: Finish; quantity: number; onPress: () => void }) {
  const client = usePricing([card], 0);
  const key = priceKey(card), snapshot = client.snapshots[key];
  const quote = quotePrice(snapshot, finish, client.fx);
  const waiting = !client.ready || client.pending.has(key) || (!client.fx && client.pending.has('fx'));
  const failed = client.errors.has(key) || (!quote && client.errors.has('fx'));
  const copies = quote && quantity > 1 ? `${quantity} copies: ${quoteLabel(quote, quantity)}` : undefined;
  return <ValueReadout label="Estimated value" onPress={onPress} accessibilityHint="Opens price details for every printing"
    accessibilityLabel={`Estimated value, ${quote ? `about ${quoteLabel(quote)}${copies ? `. ${copies}` : ''}` : waiting ? 'looking up price' : 'unavailable'}`}>
    {quote ? <PriceAmount value={quote} size="readout" /> : <Txt muted style={s.emptyAmount}>{waiting ? 'Looking up price…' : failed ? 'Price unavailable' : 'No price yet'}</Txt>}
    {copies && <Txt variant="label" style={s.tabular}>{copies}</Txt>}
    {quote?.unconfirmed && <Txt variant="caption" style={s.attentionCaption}>Choose your printing for an exact price</Txt>}
  </ValueReadout>;
}

/**
 * The headline counts unconfirmed printings at their lowest available price, so it only goes up as printings are
 * confirmed; the high end of the range is shown beside it.
 */
export function CollectionValue({ entries, onPress }: { entries: Entry[]; onPress: () => void }) {
  const client = usePricing(entries.map(e => e.card), 20);
  const value = collectionValue(entries, client.snapshots, client.fx);
  const total = value.priced + value.missing;
  const checking = entries.some(e => client.pending.has(priceKey(e.card))) || client.pending.has('fx');
  const unresolved = !client.ready || entries.some(e => !client.snapshots[priceKey(e.card)] && !client.errors.has(priceKey(e.card)));
  const updating = checking || unresolved;
  const status = [value.missing ? `${value.priced} of ${total} cards priced` : total === 1 ? 'Your card is priced' : `All ${total} cards priced`, value.high > value.low && `up to ${usd(value.high)}`, updating && 'updating…'].filter(Boolean).join(' · ');
  return <ValueReadout label="Collection value" onPress={onPress} accessibilityHint="Opens your most valuable cards and how the total is worked out"
    accessibilityLabel={`Collection value, ${value.priced ? `about ${usd(value.low)}` : updating ? 'looking up prices' : 'not priced yet'}. ${status}`}>
    {value.priced ? <Txt variant="readout" style={s.total}>{usd(value.low)}</Txt> : <Txt muted style={s.emptyAmount}>{updating ? 'Looking up prices…' : 'Not priced yet'}</Txt>}
    <Txt muted variant="caption">{status}</Txt>
  </ValueReadout>;
}

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };
const s = StyleSheet.create({
  tag: { marginTop: S.xs, gap: 2 },
  readout: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.md, borderRadius: R.md, backgroundColor: '#DFE9CE', borderWidth: 1, borderColor: '#C9D8B5', paddingHorizontal: S.lg },
  readoutText: { flex: 1, minWidth: 0, gap: 2 },
  readoutLabel: { color: C.muted, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  amountRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 4, rowGap: 0 },
  rangeEnd: { flexDirection: 'row', alignItems: 'baseline', gap: 4, maxWidth: '100%' },
  amount: { color: C.ink, fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -.5, ...tabular, flexShrink: 1 },
  total: { color: C.ink, fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -.6, ...tabular },
  tagAmount: { color: C.ink, fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -.2, ...tabular, flexShrink: 1 },
  rangeDash: { color: '#7A8C73', fontSize: 24, lineHeight: 34, fontWeight: '400' },
  tagDash: { fontSize: 16, lineHeight: 22 },
  emptyAmount: { fontSize: 18, lineHeight: 27, paddingVertical: 3 },
  tabular,
  attentionCaption: { color: '#786037', fontWeight: '600' },
});
