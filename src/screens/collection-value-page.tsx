import { Image } from 'expo-image';
import { useMemo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type TextStyle } from 'react-native';
import { Page, openPage } from '@/components/page';
import { CollectionValueHero, dateLabel, useCollectionValue } from '@/components/card-values';
import {
  ActionRow,
  Button,
  C,
  CardArt,
  Icon,
  LinkButton,
  Progress,
  R,
  S,
  SectionHeader,
  Txt,
  pressFx,
  tick,
} from '@/components/pokedex-ui';
import { needsPrinting } from '@/lib/binder-order';
import { showAllBinderCardsBy } from '@/lib/browse-state';
import { catalogSet } from '@/lib/catalog';
import { useCollection } from '@/lib/collection-context';
import { LANGUAGE_CODES, LANGUAGE_LABELS } from '@/lib/languages';
import { collectorNumber, FINISH_LABELS, type Entry } from '@/lib/model';
import { usePokedexNav } from '@/lib/pokedex-nav';
import {
  missingPriceReason,
  newestPriceDate,
  priceKey,
  quoteLabel,
  rankByValue,
  usd,
  valueByGroup,
  type MissingPrice,
  type RankedEntry,
} from '@/lib/pricing';
import { setKey, setProgress } from '@/lib/set-progress';

const TOP_CARDS = 10,
  TOP_SETS = 8;

const MISSING_LABELS: Record<MissingPrice, string> = {
  loading: 'Looking up price…',
  failed: 'Could not load a price. Try Refresh prices below.',
  exchange: 'Waiting for the euro exchange rate',
  printing: 'No price for this printing. Check it’s the right one.',
  unlisted: 'No market price listed yet',
};

const copiesLabel = (n: number) => `${n} ${n === 1 ? 'copy' : 'copies'}`;

const cardDetail = ({ card, finish }: Entry) =>
  [
    card.set.name,
    `${card.language !== 'en' ? `${LANGUAGE_CODES[card.language]} ` : ''}${collectorNumber(card)}`,
    FINISH_LABELS[finish],
  ].join(' · ');

/** Everything behind the collection value readout: the cards and sets it comes from, what's missing, and how it's worked out. */
export function CollectionValuePage() {
  const { trainer, ready } = useCollection();
  const nav = usePokedexNav();
  const entries = trainer.entries;
  const pricing = useCollectionValue(entries);
  const { client, value, checking, refresh } = pricing;
  const progress = useMemo(() => new Map(setProgress(trainer, catalogSet).map((set) => [set.key, set])), [trainer]);
  const ranked = rankByValue(entries, client.snapshots, client.fx);
  const newest = newestPriceDate(entries, client.snapshots);

  // Sets use set progress's key, so a row can open the same checklist the Sets page does.
  const sets = valueByGroup(entries, client.snapshots, client.fx, (e) =>
    setKey(e.card.language, catalogSet(e.card.language, e.card.set.id)?.id ?? e.card.set.id),
  );

  const shownSets = sets.length > TOP_SETS + 1 ? sets.slice(0, TOP_SETS) : sets,
    otherSets = sets.slice(shownSets.length);

  const languages = valueByGroup(entries, client.snapshots, client.fx, (e) => e.card.language);
  const priced = new Set(ranked.map((row) => row.entry.key));

  const missing = entries
    .filter((e) => !priced.has(e.key))
    .map((entry) => ({
      entry,
      reason: missingPriceReason(client.snapshots[priceKey(entry.card)], entry.finish, client.fx, {
        pending: client.pending.has(priceKey(entry.card)),
        failed: client.errors.has(priceKey(entry.card)),
      }),
    }));

  const listed = missing.filter((m) => m.reason !== 'loading'),
    looking = missing.length - listed.length;

  const listedCopies = listed.reduce((n, m) => n + m.entry.quantity, 0);
  const toConfirm = entries.filter(needsPrinting).length;
  const converted = ranked.filter((row) => row.quote.converted).length;
  const failed = entries.some((e) => client.errors.has(priceKey(e.card)));

  // A deep link can land before the saved collection opens; don't flash the empty state.
  if (!ready)
    return (
      <Page title="Collection value">
        <ActivityIndicator color={C.muted} style={s.loading} />
      </Page>
    );

  if (!entries.length)
    return (
      <Page title="Collection value">
        <View style={s.empty}>
          <Image source={require('../../assets/crafted/pokeball.png')} style={s.emptyArt} contentFit="contain" />
          <Txt accessibilityRole="header" variant="subtitle" style={s.center}>
            Nothing to count yet
          </Txt>
          <Txt muted style={s.center}>
            Scan your first card to find out what it’s worth. Every card you add joins your collection value.
          </Txt>
          <Button title="Scan a card" icon="scan" onPress={() => nav.openScan()} style={s.emptyButton} />
        </View>
      </Page>
    );

  return (
    <Page title="Collection value">
      <CollectionValueHero pricing={pricing} newest={newest} />

      {ranked.length > 0 && (
        <Section
          title="Most valuable"
          detail={
            ranked.length > TOP_CARDS
              ? `Your top ${TOP_CARDS} cards, by what one copy is worth`
              : 'By what one copy is worth'
          }
        >
          <View>
            {ranked.slice(0, TOP_CARDS).map((row, i) => (
              <ValueCardRow key={row.entry.key} rank={i + 1} row={row} onPress={() => nav.openEntry(row.entry)} />
            ))}
          </View>
          <ActionRow
            icon="binder"
            title="See all cards by price"
            detail="Opens your Binder, highest price first"
            onPress={() => {
              showAllBinderCardsBy(trainer.id, 'priceHigh');
              nav.goToTab('binder');
            }}
          />
        </Section>
      )}

      {value.priced > 0 && (
        <Section
          title="Value by set"
          detail={`${sets.length} ${sets.length === 1 ? 'set' : 'sets'} in your collection`}
        >
          <View>
            {shownSets.map((group) => {
              const first = group.entries[0].card,
                set = progress.get(group.key);

              const name = set?.name ?? catalogSet(first.language, first.set.id)?.name ?? first.set.name;

              return (
                <GroupRow
                  key={group.key}
                  title={name}
                  detail={[
                    LANGUAGE_CODES[first.language],
                    copiesLabel(group.copies),
                    group.missing > 0 && `${group.missing} not priced`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  low={group.low}
                  total={value.low}
                  onPress={
                    set &&
                    (() =>
                      openPage({
                        pathname: '/sets/[language]/[id]',
                        params: { language: set.language, id: set.setId },
                      }))
                  }
                />
              );
            })}
            {otherSets.length > 0 && (
              <GroupRow
                title={`${otherSets.length} more sets`}
                detail={copiesLabel(otherSets.reduce((n, g) => n + g.copies, 0))}
                low={otherSets.reduce((n, g) => n + g.low, 0)}
                total={value.low}
              />
            )}
          </View>
        </Section>
      )}

      {value.priced > 0 && languages.length > 1 && (
        <Section title="Value by language">
          <View>
            {languages.map((group) => (
              <GroupRow
                key={group.key}
                title={LANGUAGE_LABELS[group.key]}
                detail={[copiesLabel(group.copies), group.missing > 0 && `${group.missing} not priced`]
                  .filter(Boolean)
                  .join(' · ')}
                low={group.low}
                total={value.low}
              />
            ))}
          </View>
        </Section>
      )}

      {toConfirm > 0 && (
        <Section title="Printings to confirm">
          <Txt>
            Lots of cards come in more than one printing, like Regular and Reverse holo, and each is worth a different
            amount. {value.unconfirmed} {value.unconfirmed === 1 ? 'copy is' : 'copies are'} marked “Not sure yet”, so{' '}
            {value.unconfirmed === 1 ? 'it counts' : 'they count'} at the cheapest printing and your total stays on the
            low side.
          </Txt>
          {value.high > value.low && (
            <View accessible style={s.reach}>
              <Txt variant="label">Confirm them and your total could reach</Txt>
              <Txt style={s.reachAmount}>{usd(value.high)}</Txt>
            </View>
          )}
          <Button
            size="medium"
            icon="check"
            title={`Confirm ${toConfirm} ${toConfirm === 1 ? 'printing' : 'printings'}`}
            accessibilityHint="Opens your Binder showing only cards that need a printing"
            onPress={nav.confirmPrintings}
            style={s.leadingButton}
          />
        </Section>
      )}

      {listed.length > 0 && (
        <Section title="Missing prices" detail={`${copiesLabel(listedCopies)} left out of the total`}>
          <Txt muted>
            Brand-new cards, promos and some older or non-English cards may not have a market price yet. They stay in
            your binder and join the total as soon as a price appears.
          </Txt>
          <View>
            {listed.map(({ entry, reason }) => (
              <MissingRow key={entry.key} entry={entry} reason={reason} onPress={() => nav.openEntry(entry)} />
            ))}
          </View>
          {looking > 0 && (
            <Txt muted variant="caption">
              Still looking up {looking} more {looking === 1 ? 'card' : 'cards'}…
            </Txt>
          )}
        </Section>
      )}

      <Section title="How the value is worked out">
        <View style={s.notes}>
          <Txt muted>
            Prices come from TCGdex, which collects TCGplayer market prices in US dollars and Cardmarket trend prices in
            euros. They refresh once a day.
          </Txt>
          <Txt muted>
            Euro prices are changed into US dollars with Frankfurter exchange rates.
            {client.fx
              ? ` The current rate is €1 = $${client.fx.rate.toFixed(2)}, dated ${dateLabel(client.fx.date)}.`
              : ''}
            {converted ? ` ${converted} ${converted === 1 ? 'card uses' : 'cards use'} a converted price.` : ''}
          </Txt>
          <Txt muted>
            These are estimates for ungraded cards. Condition, fees and what a buyer wants all change what someone would
            really pay.
          </Txt>
          <Txt muted>
            Each saved copy counts once, including Trainers and Energy. TAG TEAM cards count once, even with several
            Pokémon on them. Cards marked “Not sure yet” count at their cheapest printing, and cards without a price are
            left out.
          </Txt>
          {value.stale > 0 && (
            <Txt style={s.attention}>
              {copiesLabel(value.stale)} {value.stale === 1 ? 'uses a saved price' : 'use saved prices'} from an earlier
              check. Refresh for the latest estimates.
            </Txt>
          )}
          {failed && <Txt style={s.attention}>Some prices could not refresh. Saved estimates are kept.</Txt>}
          {client.errors.has('fx') && (
            <Txt style={s.attention}>
              The exchange rate could not refresh.{' '}
              {client.fx ? 'The last saved rate is used.' : 'Euro prices are left out until it loads.'}
            </Txt>
          )}
        </View>
        {checking ? (
          <View accessible accessibilityLiveRegion="polite" style={s.updating}>
            <ActivityIndicator size="small" color={C.muted} />
            <Txt muted variant="caption">
              Updating…
            </Txt>
          </View>
        ) : (
          <LinkButton title="Refresh prices" onPress={refresh} />
        )}
      </Section>
    </Page>
  );
}

function Section({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return (
    <View style={s.section}>
      <SectionHeader title={title} detail={detail} />
      {children}
    </View>
  );
}

const Chevron = () => <Icon name="chevron" size={16} color={C.muted} />;

function ValueCardRow({
  rank,
  row: { entry, quote },
  onPress,
}: {
  rank: number;
  row: RankedEntry;
  onPress: () => void;
}) {
  const each = quoteLabel(quote),
    stack = entry.quantity > 1 ? quoteLabel(quote, entry.quantity) : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Number ${rank}, ${entry.card.name}, ${cardDetail(entry)}. Worth about ${each}${stack ? ` each. ${entry.quantity} copies, ${stack}` : ''}`}
      accessibilityHint="Opens this card"
      onPress={() => {
        tick();
        onPress();
      }}
      style={(state) => [s.row, pressFx(state)]}
    >
      <View>
        <CardArt card={entry.card} style={s.thumb} />
        <View style={[s.rank, rank === 1 && s.rankFirst]}>
          <Txt maxFontSizeMultiplier={1} style={s.rankText}>
            {rank}
          </Txt>
        </View>
      </View>
      <View style={s.rowText}>
        <Txt variant="cardTitle">{entry.card.name}</Txt>
        <Txt muted variant="caption">
          {cardDetail(entry)}
        </Txt>
        <View style={s.valueLine}>
          <Txt style={s.value}>{each}</Txt>
          {stack && (
            <Txt muted variant="caption">
              each
            </Txt>
          )}
        </View>
        {stack && (
          <Txt variant="label" style={s.tabular}>
            ×{entry.quantity} = {stack}
          </Txt>
        )}
      </View>
      <Chevron />
    </Pressable>
  );
}

/** One set or language: its value, and a bar for its share of the whole collection. */
function GroupRow({
  title,
  detail,
  low,
  total,
  onPress,
}: {
  title: string;
  detail: string;
  low: number;
  total: number;
  onPress?: () => void;
}) {
  const label = `${title}, ${detail}, ${low ? `worth about ${usd(low)}, ${Math.round((low / Math.max(1, total)) * 100)} percent of your total` : 'no prices yet'}`;

  const body = (
    <>
      <View style={s.groupTop}>
        <View style={s.rowText}>
          <Txt variant="cardTitle">{title}</Txt>
          <Txt muted variant="caption">
            {detail}
          </Txt>
        </View>
        <Txt style={[s.groupValue, !low && { color: C.muted }]}>{low ? usd(low) : '—'}</Txt>
        {onPress && <Chevron />}
      </View>
      <Progress value={low} total={total} color="#679255" />
    </>
  );

  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens this set’s checklist"
      onPress={() => {
        tick();
        onPress();
      }}
      style={(state) => [s.group, pressFx(state)]}
    >
      {body}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={label} style={s.group}>
      {body}
    </View>
  );
}

function MissingRow({ entry, reason, onPress }: { entry: Entry; reason: MissingPrice; onPress: () => void }) {
  const detail = `${cardDetail(entry)}${entry.quantity > 1 ? ` · ×${entry.quantity}` : ''}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.card.name}, ${detail}. ${MISSING_LABELS[reason]}`}
      accessibilityHint="Opens this card"
      onPress={() => {
        tick();
        onPress();
      }}
      style={(state) => [s.row, s.compactRow, pressFx(state)]}
    >
      <CardArt card={entry.card} style={s.smallThumb} />
      <View style={s.rowText}>
        <Txt variant="cardTitle">{entry.card.name}</Txt>
        <Txt muted variant="caption">
          {detail}
        </Txt>
        <Txt variant="caption" style={reason === 'printing' || reason === 'failed' ? s.attention : { color: C.muted }}>
          {MISSING_LABELS[reason]}
        </Txt>
      </View>
      <Chevron />
    </Pressable>
  );
}

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

const s = StyleSheet.create({
  section: { gap: S.md },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    paddingVertical: S.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  compactRow: { paddingVertical: S.sm },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  thumb: { width: 56 },
  smallThumb: { width: 40 },
  rank: {
    position: 'absolute',
    left: -4,
    top: -4,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: R.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.ink,
  },
  rankFirst: { backgroundColor: '#A98428' },
  rankText: { color: 'white', fontSize: 12, lineHeight: 15, fontWeight: '800', ...tabular },
  valueLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: S.xs, marginTop: 2 },
  value: { color: C.ink, fontSize: 19, lineHeight: 25, fontWeight: '700', letterSpacing: -0.2, ...tabular },
  tabular,
  group: {
    minHeight: 44,
    gap: S.sm,
    paddingVertical: S.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  groupTop: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  groupValue: { color: C.ink, fontSize: 17, lineHeight: 22, fontWeight: '700', ...tabular, flexShrink: 0 },
  reach: { gap: 2 },
  reachAmount: { color: C.ink, fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.5, ...tabular },
  leadingButton: { alignSelf: 'flex-start' },
  notes: { gap: S.md },
  attention: { color: '#786037', fontWeight: '600' },
  updating: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: S.sm },
  loading: { paddingVertical: S.xxl },
  empty: { alignItems: 'center', gap: S.md, paddingVertical: S.xxl },
  emptyArt: { width: 120, height: 120 },
  center: { textAlign: 'center', maxWidth: 320 },
  emptyButton: { alignSelf: 'stretch' },
});
