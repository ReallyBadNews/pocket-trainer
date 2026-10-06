import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { goBack, Page } from '@/components/page';
import {
  ActionRow,
  Button,
  C,
  Icon,
  LinkButton,
  Progress,
  S,
  SectionHeader,
  Txt,
  mono,
  pressFx,
  tick,
  ui,
} from '@/components/pokedex-ui';
import { DEFAULT_BINDER_BROWSE, DEFAULT_DEX_BROWSE, useBinderBrowse, useDexBrowse } from '@/lib/browse-state';
import { species, speciesById, speciesImage } from '@/lib/catalog';
import { useCollection } from '@/lib/collection-context';
import { REGIONS, type BinderShow } from '@/lib/collection-filters';
import {
  discoveredOn,
  recentDiscoveries,
  regionProgress,
  regionRange,
  type RecentDiscovery,
  type RegionProgress,
} from '@/lib/discoveries';
import { discoveredIds, duplicateCards, totalCards } from '@/lib/model';
import { usePokedexNav } from '@/lib/pokedex-nav';
import { QUIZ_LENGTH } from '@/lib/quiz';
import { POKEMON_TYPES, TYPE_COLORS, typeCounts, typeLabel } from '@/lib/species-details';

// Progress greens and the gold of a finished set, as the Binder's set rows use.
const GREEN = '#679255',
  GOLD = '#A98428',
  GOLD_TEXT = '#80611F';

const dexNumber = (id: number) => `#${String(id).padStart(3, '0')}`;

/** The Pokédex at a glance: how far along it is, the newest finds, and regions and types that each narrow the list. */
export function DiscoveriesPage() {
  const { trainer } = useCollection();
  const nav = usePokedexNav();
  const [browse, updateBrowse] = useDexBrowse();
  const [, updateBinder] = useBinderBrowse();
  const discovered = useMemo(() => discoveredIds(trainer), [trainer]);
  const types = useMemo(() => typeCounts(discovered), [discovered]);
  const regions = useMemo(() => regionProgress(discovered, browse.show), [discovered, browse.show]);
  const recent = useMemo(() => recentDiscoveries(trainer.entries), [trainer.entries]);
  // Matches the list: a type whose last card was deleted is no longer filtering.
  const activeType = types.some((t) => t.type === browse.type) ? browse.type : null;

  const found = discovered.size,
    total = species.length,
    cards = totalCards(trainer),
    doubles = duplicateCards(trainer);

  const regionsComplete = regions.filter((r) => r.complete).length;
  const activeRegion = regions.find((r) => r.active);

  // Binder rows open the whole binder (or just its doubles) rather than whatever it was last filtered to.
  const openBinder = (show: BinderShow) => {
    updateBinder((current) => ({ ...DEFAULT_BINDER_BROWSE, sort: current.sort, show }));
    nav.goToTab('binder');
  };

  const showRegion = (region: RegionProgress) => {
    tick();
    updateBrowse({ show: region.active ? 'all' : region.id });
    goBack();
  };

  return (
    <Page title="Pokédex overview">
      <View style={s.section}>
        <SectionHeader title="Your discoveries" />
        {found ? (
          <>
            <View accessible accessibilityLabel={`${found} of ${total} Pokémon discovered`} style={s.count}>
              <Txt variant="title" style={s.tabular}>
                {found}
              </Txt>
              <Txt muted style={{ flexShrink: 1 }}>
                of {total} Pokémon discovered
              </Txt>
            </View>
            <Progress value={found} total={total} color={found >= total ? GOLD : GREEN} />
            <Txt muted variant="caption">
              {found >= total ? 'You’ve discovered every Pokémon!' : `${total - found} more to discover`}
            </Txt>
          </>
        ) : (
          <View style={s.empty}>
            <Image
              source={require('../../assets/crafted/pokeball.png')}
              style={s.pokeball}
              contentFit="contain"
              accessible={false}
            />
            <Txt variant="subtitle" style={s.center}>
              Your first discovery is waiting
            </Txt>
            <Txt muted style={s.center}>
              Scan a Pokémon card to bring its entry to life. Your newest Pokémon and their types will show up here.
            </Txt>
            <Button title="Scan a card" icon="scan" onPress={() => nav.openScan()} />
          </View>
        )}
        <View>
          {cards > 0 && (
            <ActionRow title="Cards in binder" value={String(cards)} onPress={() => openBinder('All cards')} />
          )}
          {doubles > 0 && (
            <ActionRow
              title="Doubles"
              value={String(doubles)}
              detail="Extra copies to trade or share"
              onPress={() => openBinder('Doubles')}
            />
          )}
          <View
            accessible
            accessibilityLabel={
              trainer.quizBest ? `Best quiz score: ${trainer.quizBest} out of ${QUIZ_LENGTH}` : 'No quiz score yet'
            }
            style={ui.actionRow}
          >
            <Txt style={s.rowTitle}>Best quiz score</Txt>
            <Txt variant="readout" muted={!trainer.quizBest} style={!!trainer.quizBest && s.strong}>
              {trainer.quizBest ? `${trainer.quizBest}/${QUIZ_LENGTH}` : 'Not played yet'}
            </Txt>
          </View>
        </View>
        {/* Scanning leads an empty Pokédex, so the game steps back to a plain action there. */}
        <Button
          size="medium"
          title="Play Who’s That Pokémon?"
          icon="quiz"
          secondary={!found}
          onPress={nav.openQuiz}
          style={s.start}
        />
      </View>

      {recent.length > 0 && (
        <View style={s.section}>
          <SectionHeader
            title="Recently discovered"
            action={
              found > recent.length && (
                <LinkButton
                  title={`See all ${found}`}
                  onPress={() => {
                    updateBrowse(() => ({ ...DEFAULT_DEX_BROWSE, show: 'discovered' }));
                    goBack();
                  }}
                />
              )
            }
          />
          <RecentGrid recent={recent} onSpecies={nav.openSpecies} />
        </View>
      )}

      <View style={s.section}>
        <SectionHeader
          title="Regions"
          detail={
            activeRegion
              ? `Showing ${activeRegion.name}`
              : regionsComplete
                ? `${regionsComplete} of ${REGIONS.length} complete!`
                : 'Tap one to explore it'
          }
        />
        <View>
          {regions.map((region) => (
            <Pressable
              key={region.id}
              accessibilityRole="button"
              accessibilityLabel={`${region.name}, numbers ${region.first} to ${region.last}: ${region.discovered} of ${region.total} discovered${region.complete ? ', region complete' : ''}. ${region.active ? 'Showing now. Show every region' : 'Show these Pokémon'}`}
              accessibilityState={{ selected: region.active }}
              onPress={() => showRegion(region)}
              style={(state) => [s.regionRow, pressFx(state)]}
            >
              <View style={s.regionTop}>
                <View style={s.regionName}>
                  <Txt variant="cardTitle">{region.name}</Txt>
                  <Txt style={s.mono}>{regionRange(region)}</Txt>
                </View>
                <Txt variant="readout" style={s.strong}>
                  {region.discovered} / {region.total}
                </Txt>
                {region.active && <Icon name="check" size={18} />}
              </View>
              <Progress value={region.discovered} total={region.total} color={region.complete ? GOLD : GREEN} />
              {(region.complete || region.active) && (
                <View style={s.notes}>
                  {region.complete && (
                    <View style={ui.row}>
                      <Icon name="check" size={13} color={GOLD_TEXT} />
                      <Txt variant="caption" style={[s.strong, { color: GOLD_TEXT, flexShrink: 1 }]}>
                        Region complete!
                      </Txt>
                    </View>
                  )}
                  {region.active && (
                    <Txt variant="caption" style={[s.strong, { flexShrink: 1 }]}>
                      Showing in your Pokédex
                    </Txt>
                  )}
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </View>

      {types.length > 0 && (
        <View style={s.section}>
          <SectionHeader title="Your types" detail={`${types.length} of ${POKEMON_TYPES.length} found`} />
          <View style={s.typeBar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {types.map((t) => (
              <View key={t.type} style={{ flex: t.count, backgroundColor: TYPE_COLORS[t.type] }} />
            ))}
          </View>
          <View>
            {types.map((t) => (
              <Pressable
                key={t.type}
                accessibilityRole="button"
                accessibilityLabel={`${typeLabel(t.type)}, ${t.count} discovered. ${activeType === t.type ? 'Show every type' : 'Show this type'}`}
                accessibilityState={{ selected: activeType === t.type }}
                onPress={() => {
                  tick();
                  updateBrowse({ type: activeType === t.type ? null : t.type });
                  goBack();
                }}
                style={(state) => [s.typeRow, pressFx(state)]}
              >
                <View style={[s.typeDot, { backgroundColor: TYPE_COLORS[t.type] }]} />
                <Txt style={{ flex: 1 }}>{typeLabel(t.type)}</Txt>
                <Txt muted variant="readout">
                  {t.count}
                </Txt>
                {activeType === t.type && <Icon name="check" size={18} />}
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </Page>
  );
}

/** Sprite tiles for the newest Pokémon; wider text gets fewer, wider columns so names can wrap. */
function RecentGrid({ recent, onSpecies }: { recent: RecentDiscovery[]; onSpecies: (id: number) => void }) {
  const { width, fontScale } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(0);

  // Before layout, guess from the window less the device frame and page padding.
  const columns = Math.max(
    2,
    Math.min(4, Math.floor((gridWidth || Math.min(width, 1100) - 72) / (104 * Math.min(fontScale, 1.4)))),
  );

  return (
    <View onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)} style={s.grid}>
      {recent.map(({ id, at }) => {
        const name = speciesById.get(id)?.en ?? dexNumber(id),
          when = discoveredOn(at);

        return (
          <View key={id} style={[s.cell, { width: `${100 / columns}%` }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${name}, number ${id}${when ? `, discovered ${when}` : ''}`}
              accessibilityHint="Opens its Pokédex entry"
              onPress={() => {
                tick();
                onSpecies(id);
              }}
              style={(state) => [s.tile, pressFx(state)]}
            >
              <Image
                source={speciesImage(id)}
                style={s.sprite}
                contentFit="contain"
                cachePolicy="memory-disk"
                accessible={false}
              />
              <Txt variant="cardTitle" style={s.center}>
                {name}
              </Txt>
              <Txt style={s.mono}>{dexNumber(id)}</Txt>
              {!!when && (
                <Txt muted variant="caption" style={s.center}>
                  {when}
                </Txt>
              )}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  section: { gap: S.sm },
  count: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: S.sm },
  tabular: { fontVariant: ['tabular-nums'] },
  strong: { fontWeight: '600' },
  center: { textAlign: 'center' },
  rowTitle: { flex: 1, minWidth: 0, fontWeight: '500' },
  start: { alignSelf: 'flex-start' },
  empty: { alignItems: 'center', gap: S.md, paddingVertical: S.lg },
  pokeball: { width: 96, height: 96 },
  mono: { fontFamily: mono, fontSize: 12, lineHeight: 18, color: C.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -S.xs },
  cell: { padding: S.xs },
  tile: { alignItems: 'center', gap: 2, paddingVertical: S.sm, minHeight: 44 },
  sprite: { width: '100%', height: 84, marginBottom: S.xs },
  regionRow: {
    minHeight: 52,
    gap: S.sm,
    paddingVertical: S.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
    justifyContent: 'center',
  },
  regionTop: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  regionName: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: S.sm },
  notes: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: S.md, rowGap: S.xs },
  typeBar: { flexDirection: 'row', gap: 2, height: 7, borderRadius: 4, overflow: 'hidden' },
  typeRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  typeDot: { width: 12, height: 12, borderRadius: 6 },
});
