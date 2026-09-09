import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { C, Icon, Txt, ui } from './pokedex-ui';
import { usePricing } from '@/lib/use-pricing';
import { collectionValue, priceKey, quoteLabel, quotePrice, usd } from '@/lib/pricing';
import { needsPrinting } from '@/lib/binder-order';
import { FINISH_LABELS, type CardBrief, type Entry, type Finish } from '@/lib/model';

const dateLabel = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function PriceAmount({ value, small = false }: { value: { low: number; high: number }; small?: boolean }) {
  return <View accessible accessibilityRole="text" accessibilityLabel={`${quoteLabel(value)} USD`} style={s.amountRow}>
    <Txt numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[s.amount, small && s.tagAmount]}>{usd(value.low)}</Txt>
    {value.high !== value.low && <View style={s.rangeEnd}><Txt style={[s.rangeDash, small && s.tagAmount]}>–</Txt><Txt numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[s.amount, small && s.tagAmount]}>{usd(value.high)}</Txt></View>}
  </View>;
}

export function CardPriceTag({ card, finish = 'unsure', enabled = true }: { card: CardBrief; finish?: Finish; enabled?: boolean }) {
  const client = usePricing([card], 10, enabled);
  const key = priceKey(card), snapshot = client.snapshots[key];
  const quote = quotePrice(snapshot, finish, client.fx);
  const waiting = !client.ready || client.pending.has(key) || (!client.fx && client.pending.has('fx') && !!snapshot?.prices.some(p => p.currency === 'EUR'));
  return <View style={{ marginTop: 7, gap: 2 }}>
    {quote ? <><PriceAmount value={quote} small /><Txt muted style={s.tagCaption}>Est. USD{quote.converted ? ' · from EUR' : ''}{quote.stale ? ' · cached' : ''}</Txt></> : <Txt muted style={s.tagCaption}>{waiting ? 'Looking up value…' : snapshot || client.errors.has(key) ? 'Price unavailable' : enabled ? 'Value pending' : 'Value after matching'}</Txt>}
    {finish === 'unsure' && <Txt style={s.attentionCaption}>Needs printing</Txt>}
  </View>;
}

export function CardValuePanel({ card, finish, quantity }: { card: CardBrief; finish: Finish; quantity: number }) {
  const client = usePricing([card], 0);
  const key = priceKey(card), snapshot = client.snapshots[key];
  const quote = quotePrice(snapshot, finish, client.fx);
  const waiting = !client.ready || client.pending.has(key) || (!client.fx && client.pending.has('fx'));
  const failed = client.errors.has(key) || (!quote && client.errors.has('fx'));
  return <View style={s.panel}>
    <View style={ui.between}><Txt style={s.heading}>Estimated value</Txt><Txt muted style={s.currency}>USD</Txt></View>
    {quote ? <PriceAmount value={quote} /> : <Txt muted style={s.emptyAmount}>{waiting ? 'Looking up price…' : 'Price unavailable'}</Txt>}
    {quote ? <>
      <Txt style={s.source}>{quote.sources.map(source => `${source} ${source === 'TCGplayer' ? 'market' : 'trend'}`).join(' / ')}{quote.converted ? ' · converted from EUR' : ''}</Txt>
      <Txt muted style={s.small}>{FINISH_LABELS[finish]} · {dateLabel(quote.updatedAt)}{quote.stale ? ' · cached' : ''}</Txt>
      {quote.converted && client.fx && <Txt muted style={s.small}>EUR → USD exchange rate dated {dateLabel(client.fx.date)}</Txt>}
      {quote.unconfirmed && <Txt muted style={s.small}>Based on available printing prices. Choose your printing for a closer estimate.</Txt>}
      {quantity > 1 && <Txt style={{ fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{quantity} copies: {quoteLabel(quote, quantity)}</Txt>}
      {(client.errors.has(key) || (quote.converted && client.errors.has('fx'))) && <Txt muted style={s.small}>Refresh failed. Showing the saved estimate.</Txt>}
    </> : <Txt muted style={s.small}>{waiting ? 'You can keep collecting while prices load.' : failed ? 'Could not refresh prices. Check your connection and retry.' : 'No matching price is available for this printing. It stays in your binder and is left out of the value total.'}</Txt>}
    <Txt muted style={s.small}>Ungraded market estimate. Condition affects what a buyer will pay.</Txt>
    <Pressable accessibilityRole="button" accessibilityLabel="Refresh card price" disabled={waiting} onPress={() => { void client.ensure([card], () => true, 0, true); void client.ensureFx(true); }} style={s.link}><Txt style={s.linkText}>{waiting ? 'Updating…' : 'Refresh price'}</Txt></Pressable>
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
    <View style={ui.between}><Txt style={s.heading}>Collection value</Txt><Txt muted style={s.currency}>Est. USD</Txt></View>
    {value.priced || !total ? <PriceAmount value={value} /> : <Txt muted style={s.emptyAmount}>{checking || unresolved ? 'Looking up prices…' : 'Not priced yet'}</Txt>}
    <Txt muted style={s.small}>{total ? `${value.priced} of ${total} copies priced${checking || unresolved ? ' · updating…' : ''}` : 'Add a card to start your collection.'}</Txt>
    {value.missing > 0 && <Txt muted style={s.small}>{value.missing} {value.missing === 1 ? 'copy is' : 'copies are'} not included yet.</Txt>}
    {toConfirm > 0 && (onNeedsPrinting ? <Pressable accessibilityRole="button" accessibilityLabel={`Confirm ${toConfirm} ${toConfirm === 1 ? 'printing' : 'printings'}`} onPress={onNeedsPrinting} style={s.attentionLink}><Txt style={s.attentionText}>Confirm {toConfirm} {toConfirm === 1 ? 'printing' : 'printings'}</Txt><Icon name="arrow" size={15} color="#786037" /></Pressable> : <Txt style={s.attentionCaption}>{toConfirm} {toConfirm === 1 ? 'printing needs' : 'printings need'} confirmation.</Txt>)}
    {value.stale > 0 && <Txt muted style={s.small}>Includes cached prices. Refresh for the latest available estimates.</Txt>}
    {entries.some(e => client.errors.has(priceKey(e.card))) && <Txt muted style={s.small}>Some prices could not refresh. Saved estimates are kept.</Txt>}
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={details ? 'Hide value details' : 'How collection value is calculated'} onPress={() => setDetails(v => !v)} style={s.link}><Txt style={s.linkText}>{details ? 'Hide details' : 'About estimates'}</Txt></Pressable>
      {!!total && <Pressable accessibilityRole="button" accessibilityLabel="Refresh collection prices" disabled={checking} onPress={() => { void client.ensure(cards, () => true, 20, true); void client.ensureFx(true); }} style={s.link}><Txt style={s.linkText}>{checking ? 'Updating…' : 'Refresh prices'}</Txt></Pressable>}
    </View>
    {details && <Txt muted style={s.small}>Each saved copy counts once, including Trainers and Energy. TAG TEAM cards count once toward the total. TCGdex supplies TCGplayer market prices and Cardmarket trends. Euro prices are converted using Frankfurter exchange rates. Unconfirmed printings use the range of available prices. Missing prices are excluded. These are ungraded estimates; condition, fees and buyer demand affect sale prices.</Txt>}
  </View>;
}

const s = StyleSheet.create({
  panel: { backgroundColor: '#E0E9D3', borderRadius: 14, padding: 16, gap: 7 },
  collection: { backgroundColor: '#DFE9CE', borderColor: '#B7C99D', borderWidth: 1, borderRadius: 13, padding: 16, gap: 6 },
  heading: { fontSize: 13, fontWeight: '600' }, currency: { fontSize: 11, lineHeight: 17 },
  amountRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6, rowGap: 0 },
  rangeEnd: { flexDirection: 'row', alignItems: 'baseline', gap: 6, maxWidth: '100%' },
  amount: { color: C.ink, fontSize: 28, lineHeight: 36, fontWeight: '600', letterSpacing: -.5, fontVariant: ['tabular-nums'], flexShrink: 1 },
  rangeDash: { color: '#7A8C73', fontSize: 25, lineHeight: 36, fontWeight: '400' },
  tagAmount: { fontSize: 17, lineHeight: 23, letterSpacing: -.25 }, tagCaption: { fontSize: 10, lineHeight: 15 },
  emptyAmount: { fontSize: 18, lineHeight: 27, paddingVertical: 3 },
  source: { fontSize: 12, lineHeight: 18, fontWeight: '500' }, small: { fontSize: 11, lineHeight: 18 },
  attentionCaption: { fontSize: 10, lineHeight: 16, color: '#786037', fontWeight: '500' },
  attentionLink: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  attentionText: { fontSize: 12, lineHeight: 18, color: '#786037', fontWeight: '600' },
  link: { minHeight: 40, justifyContent: 'center', paddingRight: 10 }, linkText: { fontSize: 11, fontWeight: '500', color: C.ink, textDecorationLine: 'underline' },
});
