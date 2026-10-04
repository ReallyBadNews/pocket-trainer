import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type TextStyle } from 'react-native';
import { ActionRow, C, Icon, R, S, ToolbarAction, Txt, pressFx, tick } from './pokedex-ui';
import { usePricing } from '@/lib/use-pricing';
import { collectionValue, mostValuable, priceKey, quoteLabel, quotePrice, usd } from '@/lib/pricing';
import { needsPrinting } from '@/lib/binder-order';
import { FINISH_LABELS, type CardBrief, type Entry, type Finish } from '@/lib/model';

const dateLabel = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Ranges wrap between whole amounts, never inside one. */
function PriceAmount({ value, size }: { value: { low: number; high: number }; size: 'tag' | 'readout' }) {
  const amount = size === 'tag' ? s.tagAmount : s.amount;
  return <View style={s.amountRow}>
    <Txt variant="readout" style={amount}>{usd(value.low)}</Txt>
    {value.high !== value.low && <View style={s.rangeEnd}><Txt style={[s.rangeDash, size === 'tag' && s.tagDash]}>–</Txt><Txt variant="readout" style={amount}>{usd(value.high)}</Txt></View>}
  </View>;
}

/** A Pokédex-style readout window: what something is worth, with its details one tap away. */
function ValueReadout({ label, accessibilityLabel, expanded, onPress, children, details }: { label: string; accessibilityLabel: string; expanded: boolean; onPress: () => void; children: ReactNode; details?: ReactNode }) {
  return <View style={s.readout}>
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={expanded ? 'Hides price details' : 'Shows price details'} aria-expanded={expanded} onPress={() => { tick(); onPress(); }} style={state => [s.readoutButton, pressFx(state)]}>
      <View style={s.readoutText}><Txt variant="caption" style={s.readoutLabel}>{label}</Txt>{children}</View>
      <View style={{ transform: [{ rotate: expanded ? '-90deg' : '180deg' }] }}><Icon name="back" size={16} color={C.muted} /></View>
    </Pressable>
    {expanded && <View style={s.readoutDetails}>{details}</View>}
  </View>;
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

export function CardValuePanel({ card, finish, quantity }: { card: CardBrief; finish: Finish; quantity: number }) {
  const [details, setDetails] = useState(false);
  const client = usePricing([card], 0);
  const key = priceKey(card), snapshot = client.snapshots[key];
  const quote = quotePrice(snapshot, finish, client.fx);
  const waiting = !client.ready || client.pending.has(key) || (!client.fx && client.pending.has('fx'));
  const failed = client.errors.has(key) || (!quote && client.errors.has('fx'));
  const copies = quote && quantity > 1 ? `${quantity} copies: ${quoteLabel(quote, quantity)}` : undefined;
  return <ValueReadout label="Estimated value" expanded={details} onPress={() => setDetails(open => !open)}
    accessibilityLabel={`Estimated value, ${quote ? `about ${quoteLabel(quote)}${copies ? `. ${copies}` : ''}` : waiting ? 'looking up price' : 'unavailable'}`}
    details={<>
      {quote ? <>
        <Txt variant="caption" style={s.source}>{quote.sources.map(source => `${source} ${source === 'TCGplayer' ? 'market' : 'trend'}`).join(' / ')}{quote.converted ? ' · converted from EUR' : ''}</Txt>
        <Txt muted variant="caption">{FINISH_LABELS[finish]} · {dateLabel(quote.updatedAt)}{quote.stale ? ' · cached' : ''}</Txt>
        {quote.converted && client.fx && <Txt muted variant="caption">EUR → USD exchange rate dated {dateLabel(client.fx.date)}</Txt>}
        {(client.errors.has(key) || (quote.converted && client.errors.has('fx'))) && <Txt muted variant="caption">Refresh failed. Showing the saved estimate.</Txt>}
      </> : <Txt muted variant="caption">{waiting ? 'You can keep collecting while prices load.' : failed ? 'Could not refresh prices. Check your connection and retry.' : 'No matching price is available for this printing. It stays in your binder and is left out of the value total.'}</Txt>}
      <Txt muted variant="caption">Ungraded market estimate in US dollars. Condition affects what a buyer will pay.</Txt>
      {waiting ? <Txt muted variant="caption" style={s.updating}>Updating…</Txt> : <ToolbarAction title="Refresh price" onPress={() => { void client.ensure([card], () => true, 0, true); void client.ensureFx(true); }} style={{ alignSelf: 'flex-start' }} />}
    </>}>
    {quote ? <PriceAmount value={quote} size="readout" /> : <Txt muted style={s.emptyAmount}>{waiting ? 'Looking up price…' : failed ? 'Price unavailable' : 'No price yet'}</Txt>}
    {copies && <Txt variant="label" style={s.tabular}>{copies}</Txt>}
    {quote?.unconfirmed && <Txt variant="caption" style={s.attentionCaption}>Choose your printing for an exact price</Txt>}
  </ValueReadout>;
}

/**
 * The headline counts unconfirmed printings at their lowest available price, so it only goes up as printings are
 * confirmed; the high end of the range is shown beside it.
 */
export function CollectionValue({ entries, onNeedsPrinting, onEntry }: { entries: Entry[]; onNeedsPrinting?: () => void; onEntry?: (entry: Entry) => void }) {
  const [details, setDetails] = useState(false);
  const cards = entries.map(e => e.card);
  const client = usePricing(cards, 20);
  const value = collectionValue(entries, client.snapshots, client.fx);
  const top = mostValuable(entries, client.snapshots, client.fx);
  const total = value.priced + value.missing;
  const toConfirm = entries.filter(needsPrinting).length;
  const checking = entries.some(e => client.pending.has(priceKey(e.card))) || client.pending.has('fx');
  const unresolved = !client.ready || entries.some(e => !client.snapshots[priceKey(e.card)] && !client.errors.has(priceKey(e.card)));
  const updating = checking || unresolved;
  const status = [value.missing ? `${value.priced} of ${total} cards priced` : total === 1 ? 'Your card is priced' : `All ${total} cards priced`, value.high > value.low && `up to ${usd(value.high)}`, updating && 'updating…'].filter(Boolean).join(' · ');
  return <ValueReadout label="Collection value" expanded={details} onPress={() => setDetails(open => !open)}
    accessibilityLabel={`Collection value, ${value.priced ? `about ${usd(value.low)}` : updating ? 'looking up prices' : 'not priced yet'}. ${status}`}
    details={<>
      {top && (onEntry
        ? <ActionRow icon="star" title={`Most valuable: ${top.entry.card.name}`} value={quoteLabel(top.quote)} onPress={() => onEntry(top.entry)} />
        : <Txt variant="label">Most valuable: {top.entry.card.name} · {quoteLabel(top.quote)}</Txt>)}
      {value.high > value.low && <Txt muted variant="caption">Cards marked “Not sure yet” count at their lowest printing price. Confirm them and the total could reach {usd(value.high)}.</Txt>}
      {toConfirm > 0 && (onNeedsPrinting ? <ActionRow icon="check" title={`Confirm ${toConfirm} ${toConfirm === 1 ? 'printing' : 'printings'}`} onPress={() => { setDetails(false); onNeedsPrinting(); }} /> : <Txt variant="caption" style={s.attentionCaption}>{toConfirm} {toConfirm === 1 ? 'printing needs' : 'printings need'} confirmation.</Txt>)}
      {value.missing > 0 && <Txt muted variant="caption">{value.missing} {value.missing === 1 ? 'copy has' : 'copies have'} no price yet and {value.missing === 1 ? 'is' : 'are'} left out.</Txt>}
      {value.stale > 0 && <Txt muted variant="caption">Includes cached prices. Refresh for the latest available estimates.</Txt>}
      {entries.some(e => client.errors.has(priceKey(e.card))) && <Txt muted variant="caption">Some prices could not refresh. Saved estimates are kept.</Txt>}
      <Txt muted variant="caption">Each saved copy counts once, including Trainers and Energy. TAG TEAM cards count once toward the total. TCGdex supplies TCGplayer market prices and Cardmarket trends, refreshed daily. Euro prices are converted using Frankfurter exchange rates. Missing prices are left out. These are ungraded estimates in US dollars; condition, fees and buyer demand affect sale prices.</Txt>
      {checking ? <Txt muted variant="caption" style={s.updating}>Updating…</Txt> : <ToolbarAction title="Refresh prices" onPress={() => { void client.ensure(cards, () => true, 20, true); void client.ensureFx(true); }} style={{ alignSelf: 'flex-start' }} />}
    </>}>
    {value.priced ? <Txt variant="readout" style={s.total}>{usd(value.low)}</Txt> : <Txt muted style={s.emptyAmount}>{updating ? 'Looking up prices…' : 'Not priced yet'}</Txt>}
    <Txt muted variant="caption">{status}</Txt>
  </ValueReadout>;
}

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };
const s = StyleSheet.create({
  tag: { marginTop: S.xs, gap: 2 },
  readout: { borderRadius: R.md, backgroundColor: '#DFE9CE', borderWidth: 1, borderColor: '#C9D8B5', paddingHorizontal: S.lg },
  readoutButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.md },
  readoutText: { flex: 1, minWidth: 0, gap: 2 },
  readoutLabel: { color: C.muted, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  readoutDetails: { gap: S.sm, paddingBottom: S.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#B9CBA4', paddingTop: S.sm },
  amountRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 4, rowGap: 0 },
  rangeEnd: { flexDirection: 'row', alignItems: 'baseline', gap: 4, maxWidth: '100%' },
  amount: { color: C.ink, fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -.5, ...tabular, flexShrink: 1 },
  total: { color: C.ink, fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -.6, ...tabular },
  tagAmount: { color: C.ink, fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -.2, ...tabular, flexShrink: 1 },
  rangeDash: { color: '#7A8C73', fontSize: 24, lineHeight: 34, fontWeight: '400' },
  tagDash: { fontSize: 16, lineHeight: 22 },
  emptyAmount: { fontSize: 18, lineHeight: 27, paddingVertical: 3 },
  source: { fontWeight: '500' },
  tabular,
  attentionCaption: { color: '#786037', fontWeight: '600' },
  updating: { paddingVertical: 13 },
});
