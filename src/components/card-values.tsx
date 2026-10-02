import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, C, LinkButton, R, S, Txt } from './pokedex-ui';
import { usePricing } from '@/lib/use-pricing';
import { collectionValue, priceKey, quoteLabel, quotePrice, usd } from '@/lib/pricing';
import { needsPrinting } from '@/lib/binder-order';
import { FINISH_LABELS, type CardBrief, type Entry, type Finish } from '@/lib/model';

const dateLabel = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function PriceAmount({ value, small = false }: { value: { low: number; high: number }; small?: boolean }) {
  return <View accessible accessibilityRole="text" accessibilityLabel={`${quoteLabel(value)} USD`} style={s.amountRow}>
    <Txt variant="readout" style={[s.amount, small && s.tagAmount]}>{usd(value.low)}</Txt>
    {value.high !== value.low && <View style={s.rangeEnd}><Txt style={[s.rangeDash, small && s.tagAmount]}>–</Txt><Txt variant="readout" style={[s.amount, small && s.tagAmount]}>{usd(value.high)}</Txt></View>}
  </View>;
}

export function CardPriceTag({ card, finish = 'unsure', enabled = true, printingHint = true }: { card: CardBrief; finish?: Finish; enabled?: boolean; printingHint?: boolean }) {
  const client = usePricing([card], 10, enabled);
  const key = priceKey(card), snapshot = client.snapshots[key];
  const quote = quotePrice(snapshot, finish, client.fx);
  const waiting = !client.ready || client.pending.has(key) || (!client.fx && client.pending.has('fx') && !!snapshot?.prices.some(p => p.currency === 'EUR'));
  return <View style={{ marginTop: 7, gap: 2 }}>
    {quote ? <><PriceAmount value={quote} small /><Txt muted variant="caption">Est. USD{quote.converted ? ' · from EUR' : ''}{quote.stale ? ' · cached' : ''}</Txt></> : <Txt muted variant="caption">{waiting ? 'Looking up value…' : snapshot || client.errors.has(key) ? 'Price unavailable' : enabled ? 'Value pending' : 'Value after matching'}</Txt>}
    {printingHint && finish === 'unsure' && <Txt variant="caption" style={s.attentionCaption}>Needs printing</Txt>}
  </View>;
}

export function CardValuePanel({ card, finish, quantity }: { card: CardBrief; finish: Finish; quantity: number }) {
  const client = usePricing([card], 0);
  const key = priceKey(card), snapshot = client.snapshots[key];
  const quote = quotePrice(snapshot, finish, client.fx);
  const waiting = !client.ready || client.pending.has(key) || (!client.fx && client.pending.has('fx'));
  const failed = client.errors.has(key) || (!quote && client.errors.has('fx'));
  return <View style={s.panel}>
    <View style={s.headingRow}><Txt variant="label" style={{ flexShrink: 1 }}>Estimated value</Txt><Txt muted variant="caption">USD</Txt></View>
    {quote ? <PriceAmount value={quote} /> : <Txt muted style={s.emptyAmount}>{waiting ? 'Looking up price…' : 'Price unavailable'}</Txt>}
    {quote ? <>
      <Txt variant="caption" style={s.source}>{quote.sources.map(source => `${source} ${source === 'TCGplayer' ? 'market' : 'trend'}`).join(' / ')}{quote.converted ? ' · converted from EUR' : ''}</Txt>
      <Txt muted variant="caption">{FINISH_LABELS[finish]} · {dateLabel(quote.updatedAt)}{quote.stale ? ' · cached' : ''}</Txt>
      {quote.converted && client.fx && <Txt muted variant="caption">EUR → USD exchange rate dated {dateLabel(client.fx.date)}</Txt>}
      {quote.unconfirmed && <Txt muted variant="caption">Based on available printing prices. Choose your printing for a closer estimate.</Txt>}
      {quantity > 1 && <Txt variant="label" style={{ fontVariant: ['tabular-nums'] }}>{quantity} copies: {quoteLabel(quote, quantity)}</Txt>}
      {(client.errors.has(key) || (quote.converted && client.errors.has('fx'))) && <Txt muted variant="caption">Refresh failed. Showing the saved estimate.</Txt>}
    </> : <Txt muted variant="caption">{waiting ? 'You can keep collecting while prices load.' : failed ? 'Could not refresh prices. Check your connection and retry.' : 'No matching price is available for this printing. It stays in your binder and is left out of the value total.'}</Txt>}
    <Txt muted variant="caption">Ungraded market estimate. Condition affects what a buyer will pay.</Txt>
    {waiting ? <Txt muted variant="caption" style={s.updating}>Updating…</Txt> : <LinkButton title="Refresh price" onPress={() => { void client.ensure([card], () => true, 0, true); void client.ensureFx(true); }} style={{ alignSelf: 'flex-start' }} />}
  </View>;
}

export function CollectionValue({ entries, compact = false, onNeedsPrinting }: { entries: Entry[]; compact?: boolean; onNeedsPrinting?: () => void }) {
  const [details, setDetails] = useState(false);
  const cards = entries.map(e => e.card);
  const client = usePricing(cards, 20);
  const value = collectionValue(entries, client.snapshots, client.fx);
  const total = value.priced + value.missing;
  const toConfirm = entries.filter(needsPrinting).length;
  const checking = entries.some(e => client.pending.has(priceKey(e.card))) || client.pending.has('fx');
  const unresolved = !client.ready || entries.some(e => !client.snapshots[priceKey(e.card)] && !client.errors.has(priceKey(e.card)));
  return <View style={[s.collection, compact && { paddingVertical: 12 }]}>
    <View style={s.headingRow}><Txt variant="label" style={{ flexShrink: 1 }}>Collection value</Txt><Txt muted variant="caption">Est. USD</Txt></View>
    {value.priced || !total ? <PriceAmount value={value} /> : <Txt muted style={s.emptyAmount}>{checking || unresolved ? 'Looking up prices…' : 'Not priced yet'}</Txt>}
    <Txt muted variant="caption">{total ? `${value.priced} of ${total} copies priced${checking || unresolved ? ' · updating…' : ''}` : 'Add a card to start your collection.'}</Txt>
    {value.missing > 0 && <Txt muted variant="caption">{value.missing} {value.missing === 1 ? 'copy is' : 'copies are'} not included yet.</Txt>}
    {toConfirm > 0 && (onNeedsPrinting ? <Button size="medium" secondary icon="check" title={`Confirm ${toConfirm} ${toConfirm === 1 ? 'printing' : 'printings'}`} onPress={onNeedsPrinting} style={s.attentionButton} /> : <Txt variant="caption" style={s.attentionCaption}>{toConfirm} {toConfirm === 1 ? 'printing needs' : 'printings need'} confirmation.</Txt>)}
    {value.stale > 0 && <Txt muted variant="caption">Includes cached prices. Refresh for the latest available estimates.</Txt>}
    {entries.some(e => client.errors.has(priceKey(e.card))) && <Txt muted variant="caption">Some prices could not refresh. Saved estimates are kept.</Txt>}
    <View style={s.links}>
      <LinkButton title={details ? 'Hide details' : 'About estimates'} onPress={() => setDetails(v => !v)} />
      {!!total && (checking ? <Txt muted variant="caption" style={s.updating}>Updating…</Txt> : <LinkButton title="Refresh prices" onPress={() => { void client.ensure(cards, () => true, 20, true); void client.ensureFx(true); }} />)}
    </View>
    {details && <Txt muted variant="caption">Each saved copy counts once, including Trainers and Energy. TAG TEAM cards count once toward the total. TCGdex supplies TCGplayer market prices and Cardmarket trends. Euro prices are converted using Frankfurter exchange rates. Unconfirmed printings use the range of available prices. Missing prices are excluded. These are ungraded estimates; condition, fees and buyer demand affect sale prices.</Txt>}
  </View>;
}

const s = StyleSheet.create({
  panel: { backgroundColor: '#E0E9D3', borderRadius: R.lg, padding: S.lg, gap: S.sm },
  collection: { backgroundColor: '#DFE9CE', borderColor: '#B7C99D', borderWidth: 1, borderRadius: R.lg, padding: S.lg, gap: S.sm },
  headingRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', columnGap: S.md, rowGap: S.xs },
  amountRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6, rowGap: 0 },
  rangeEnd: { flexDirection: 'row', alignItems: 'baseline', gap: 6, maxWidth: '100%' },
  amount: { color: C.ink, fontSize: 28, lineHeight: 36, fontWeight: '600', letterSpacing: -.5, fontVariant: ['tabular-nums'], flexShrink: 1 },
  rangeDash: { color: '#7A8C73', fontSize: 25, lineHeight: 36, fontWeight: '400' },
  tagAmount: { fontSize: 16, lineHeight: 22, letterSpacing: -.25 },
  emptyAmount: { fontSize: 18, lineHeight: 27, paddingVertical: 3 },
  source: { fontWeight: '500' },
  attentionCaption: { color: '#786037', fontWeight: '600' },
  attentionButton: { alignSelf: 'flex-start', maxWidth: '100%', marginTop: S.xs },
  links: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: S.lg },
  updating: { paddingVertical: 13 },
});
