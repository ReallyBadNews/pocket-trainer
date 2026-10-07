import { Pressable, ScrollView, StyleSheet, View, type TextStyle } from 'react-native';
import { C, CardArt, Icon, LinkButton, R, S, Txt, pressFx, tick } from './pokedex-ui';
import { EstimateAmount, dateLabel } from './card-values';
import { usePricing } from '@/lib/use-pricing';
import { priceKey, quotePrice, spokenQuote, usd } from '@/lib/pricing';
import { eur, printingPrices, sourceDates, type PrintingPrice } from '@/lib/printing-prices';
import { collectorNumber, FINISH_LABELS, type Card, type Finish } from '@/lib/model';

/**
 * Everything behind a card's estimated value: the chosen printing's estimate, what every printing is worth at both
 * providers, and where the numbers come from. Tapping a printing chooses it.
 */
export function CardPriceDetails({
  card,
  finish,
  quantity,
  disabled = false,
  onChoose,
}: {
  card: Card;
  finish: Finish;
  quantity: number;
  disabled?: boolean;
  onChoose: (finish: Finish) => void;
}) {
  const client = usePricing([card], 0);

  const key = priceKey(card),
    snapshot = client.snapshots[key];

  const quote = quotePrice(snapshot, finish, client.fx);
  // The chosen printing always gets a row, even when the catalog no longer lists it.
  const rows = printingPrices([...card.finishes, finish], snapshot, client.fx);
  const dates = sourceDates(snapshot);
  const euros = rows.some((row) => row.cardmarket);
  const waiting = !client.ready || client.pending.has(key) || (!client.fx && client.pending.has('fx'));
  const updating = waiting || client.pending.has('fx');
  const failed = client.errors.has(key) || (!quote && client.errors.has('fx'));
  const refreshFailed = client.errors.has(key) || (euros && client.errors.has('fx'));
  const printing = FINISH_LABELS[finish];
  const copies = quote && quantity > 1 ? `. ${quantity} copies: ${spokenQuote(quote, quantity)}` : '';

  const provenance =
    quote &&
    `${quote.sources.map((source) => `${source} ${source === 'TCGplayer' ? 'market' : 'trend'}`).join(' / ')}${quote.converted ? ' · converted from euros' : ''} · ${dateLabel(quote.updatedAt)}${quote.stale ? ' · saved price' : ''}`;

  const number = collectorNumber(card);

  return (
    <ScrollView style={s.scrolling} contentContainerStyle={s.content}>
      <View accessible accessibilityLabel={`${card.name}, ${card.set.name}, number ${number}`} style={s.identity}>
        <CardArt card={card} style={s.thumb} />
        <View style={s.identityText}>
          <Txt variant="cardTitle">{card.name}</Txt>
          <Txt variant="caption" muted>
            {card.set.name} · #{number}
          </Txt>
        </View>
      </View>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`Estimated value for ${printing}, ${quote ? `about ${spokenQuote(quote)}${copies}. ${provenance}` : waiting ? 'looking up price' : 'unavailable'}`}
        style={s.readout}
      >
        <Txt variant="caption" style={s.readoutLabel}>
          Estimated value · {printing}
        </Txt>
        {quote ? (
          <EstimateAmount quote={quote} quantity={quantity} />
        ) : (
          <Txt muted style={s.emptyAmount}>
            {waiting ? 'Looking up price…' : failed ? 'Price unavailable' : 'No price yet'}
          </Txt>
        )}
        {provenance && (
          <Txt variant="caption" muted>
            {provenance}
          </Txt>
        )}
      </View>
      <View style={s.section}>
        <Txt accessibilityRole="header" variant="label" muted>
          Every printing
        </Txt>
        <Txt variant="caption" muted={finish !== 'unsure'} style={finish === 'unsure' && s.attention}>
          {finish === 'unsure'
            ? '“Not sure yet” shows the range across these printings. Tap the one that matches your card for an exact price.'
            : 'Tap a printing to choose it. “Not sure yet” shows the range across all of them.'}
        </Txt>
        <View>
          {rows.length ? (
            rows.map((row) => (
              <PrintingRow
                key={row.finish}
                row={row}
                selected={row.finish === finish}
                disabled={disabled}
                converting={!client.fx && updating}
                onPress={() => onChoose(row.finish)}
              />
            ))
          ) : (
            <Txt variant="caption" muted>
              {waiting ? 'Looking up printings…' : 'No printings are listed for this card yet.'}
            </Txt>
          )}
        </View>
      </View>
      <View style={s.section}>
        <Txt accessibilityRole="header" variant="label" muted>
          About these prices
        </Txt>
        {dates.map((date) => (
          <Txt key={date.source} variant="caption" muted>
            {date.source === 'TCGplayer' ? 'TCGplayer market prices in US dollars' : 'Cardmarket trend prices in euros'}
            , updated {dateLabel(date.updatedAt)}.
          </Txt>
        ))}
        {dates.length > 1 && (
          <Txt variant="caption" muted>
            The estimate uses the TCGplayer price when there is one, otherwise the Cardmarket trend.
          </Txt>
        )}
        {euros && (
          <Txt variant="caption" muted>
            {client.fx
              ? `Euro prices are converted with the EUR → USD exchange rate dated ${dateLabel(client.fx.date)}.`
              : updating
                ? 'Getting today’s euro exchange rate…'
                : 'Euro prices need an exchange rate. Refresh to try again.'}
          </Txt>
        )}
        {quote?.stale && (
          <Txt variant="caption" muted>
            This is a saved price from an earlier check. Refresh for the latest.
          </Txt>
        )}
        {refreshFailed && !updating && (
          <Txt variant="caption" muted>
            {quote
              ? 'Refresh failed. Showing the saved estimate.'
              : 'Could not refresh prices. Check your connection and try again.'}
          </Txt>
        )}
        {!quote && !waiting && !failed && (
          <Txt variant="caption" muted>
            No matching price is available for this printing. It stays in your binder and is left out of the value
            total.
          </Txt>
        )}
        <Txt variant="caption" muted>
          Ungraded market estimate in US dollars. Condition affects what a buyer will pay.
        </Txt>
        {updating ? (
          <Txt accessibilityLiveRegion="polite" variant="caption" muted style={s.updating}>
            Updating…
          </Txt>
        ) : (
          <LinkButton
            title="Refresh price"
            onPress={() => {
              void client.ensure([card], () => true, 0, true);
              void client.ensureFx(true);
            }}
          />
        )}
      </View>
    </ScrollView>
  );
}

function PrintingRow({
  row,
  selected,
  disabled,
  converting,
  onPress,
}: {
  row: PrintingPrice;
  selected: boolean;
  disabled: boolean;
  converting: boolean;
  onPress: () => void;
}) {
  const label = FINISH_LABELS[row.finish];
  const { tcgplayer: tcg, cardmarket: cm } = row;
  const converted = cm?.cents !== undefined ? usd(cm.cents) : undefined;

  const spoken = [
    label,
    tcg ? `TCGplayer market ${usd(tcg.cents)}` : 'no TCGplayer price yet',
    cm
      ? `Cardmarket trend ${converted ? `${converted}, from ${eur(cm.euros)}` : eur(cm.euros)}`
      : 'no Cardmarket price yet',
  ].join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={selected ? 'Goes back to the card' : 'Chooses this printing and goes back to the card'}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={() => {
        tick();
        onPress();
      }}
      style={(state) => [s.row, selected && s.rowSelected, disabled && { opacity: 0.45 }, pressFx(state)]}
    >
      <View style={s.rowHead}>
        <Txt variant="cardTitle" style={s.grow}>
          {label}
        </Txt>
        {selected && <Icon name="check" size={20} />}
      </View>
      {tcg || cm ? (
        <>
          <SourcePrice name="TCGplayer market" amount={tcg && usd(tcg.cents)} />
          <SourcePrice
            name="Cardmarket trend"
            amount={converted ?? (cm && eur(cm.euros))}
            detail={
              cm && (converted ? `from ${eur(cm.euros)}` : converting ? 'Converting to dollars…' : 'Not converted yet')
            }
          />
        </>
      ) : (
        <Txt variant="caption" muted>
          No price yet
        </Txt>
      )}
    </Pressable>
  );
}

/** The amount keeps its own column so long labels and euro notes wrap beside it at large text sizes. */
function SourcePrice({ name, amount, detail }: { name: string; amount?: string; detail?: string }) {
  return (
    <View style={s.source}>
      <Txt variant="caption" muted style={[s.grow, s.sourceName]}>
        {name}
      </Txt>
      <View style={s.sourceValue}>
        {amount ? (
          <Txt variant="readout" style={s.sourceAmount}>
            {amount}
          </Txt>
        ) : (
          <Txt variant="caption" muted style={s.sourceName}>
            No price yet
          </Txt>
        )}
        {detail && (
          <Txt variant="caption" muted style={[s.tabular, s.right]}>
            {detail}
          </Txt>
        )}
      </View>
    </View>
  );
}

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

const s = StyleSheet.create({
  scrolling: { flexShrink: 1 },
  content: { padding: S.xl, paddingBottom: S.xxl, gap: S.xl },
  identity: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  thumb: { width: 56 },
  identityText: { flex: 1, minWidth: 0, gap: 2 },
  grow: { flex: 1, minWidth: 0 },
  readout: {
    gap: 2,
    paddingHorizontal: S.lg,
    paddingVertical: S.md,
    borderRadius: R.md,
    backgroundColor: '#DFE9CE',
    borderWidth: 1,
    borderColor: '#C9D8B5',
  },
  readoutLabel: { color: C.muted, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  emptyAmount: { fontSize: 18, lineHeight: 27, paddingVertical: 3 },
  section: { gap: S.sm },
  row: {
    minHeight: 48,
    gap: S.xs,
    paddingVertical: S.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  rowSelected: { marginHorizontal: -S.sm, paddingHorizontal: S.sm, borderRadius: R.sm, backgroundColor: '#DFE9CE' },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  source: { flexDirection: 'row', alignItems: 'flex-start', gap: S.md },
  sourceName: { paddingTop: 2 },
  sourceValue: { flexShrink: 1, maxWidth: '60%', alignItems: 'flex-end' },
  sourceAmount: {
    color: C.ink,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.2,
    ...tabular,
    textAlign: 'right',
  },
  right: { textAlign: 'right' },
  tabular,
  attention: { color: '#786037', fontWeight: '600' },
  updating: { paddingVertical: 13 },
});
