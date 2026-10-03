import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { BadgeArtwork } from '@/components/badge-artwork';
import { BadgeInspection } from '@/components/badge-inspection';
import { C, Icon, Progress, S, Segmented, Txt, pressFx, tick, ui } from '@/components/pokedex-ui';
import { useChromeScroll } from '@/components/scroll-chrome';
import { BADGES, BADGE_GROUPS, type Badge } from '@/lib/badges';
import { catalogSet, speciesById } from '@/lib/catalog';
import { useCollection } from '@/lib/collection-context';
import { badgeProgress, discoveredIds } from '@/lib/model';
import { setProgress, type SetProgress } from '@/lib/set-progress';

type BadgeFilter = 'all' | 'todo' | 'earned';
const FILTERS = [{ id: 'all', label: 'All' }, { id: 'todo', label: 'Not yet' }, { id: 'earned', label: 'Earned' }] as const;

export function BadgesScreen({ onSpecies }: { onSpecies: (id: number) => void }) {
  const scroll = useChromeScroll();
  const { trainer } = useCollection();
  const [filter, setFilter] = useState<BadgeFilter>('all');
  const [inspected, setInspected] = useState<Badge | null>(null);
  const discovered = useMemo(() => discoveredIds(trainer), [trainer]);
  const sets = useMemo(() => setProgress(trainer, catalogSet), [trainer]);
  const achievements = useMemo(() => BADGES.map(badge => {
    const progress = badgeProgress(trainer, badge, discovered, sets.filter(set => set.complete).length);
    return { badge, progress, earned: progress >= badge.target };
  }), [trainer, discovered, sets]);
  const earnedCount = achievements.filter(achievement => achievement.earned).length;
  const visible = achievements.filter(achievement => filter === 'all' || (filter === 'earned' ? achievement.earned : !achievement.earned));

  return <><Animated.ScrollView {...scroll} contentContainerStyle={[s.list, scroll.contentContainerStyle]} showsVerticalScrollIndicator={false}>
    <View style={s.header}>
      <View style={s.heading}><Txt accessibilityRole="header" variant="title">Badges</Txt><Txt muted variant="caption">{earnedCount} of {BADGES.length} earned</Txt></View>
      <Segmented label="Show badges" options={FILTERS} value={filter} onChange={setFilter} />
    </View>
    {BADGE_GROUPS.map(group => {
      const items = visible.filter(achievement => achievement.badge.group === group);
      if (!items.length) return null;
      return <View key={group} style={s.group}>
        <Txt accessibilityRole="header" variant="subtitle" style={s.groupTitle}>{group}</Txt>
        {items.map(({ badge, progress, earned }) => <AchievementRow key={badge.id} badge={badge} progress={progress} earned={earned} discovered={discovered} closestSet={sets[0]} onSpecies={onSpecies} onInspect={() => { tick(); setInspected(badge); }} />)}
      </View>;
    })}
    {!visible.length && <View style={s.empty}>
      <Image source={require('../../assets/crafted/badge.png')} style={{ width: 96, height: 96, opacity: filter === 'earned' ? .5 : 1 }} contentFit="contain" accessibilityIgnoresInvertColors />
      <Txt style={[ui.subtitle, s.emptyText]}>{filter === 'earned' ? 'Add your first card to earn a badge!' : 'Wow! You got them all!'}</Txt>
    </View>}
  </Animated.ScrollView>{inspected && <BadgeInspection badge={inspected} onClose={() => setInspected(null)} />}</>;
}

function AchievementRow({ badge, progress, earned, discovered, closestSet, onSpecies, onInspect }: {
  badge: Badge; progress: number; earned: boolean; discovered: ReadonlySet<number>; closestSet?: SetProgress; onSpecies: (id: number) => void; onInspect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { fontScale } = useWindowDimensions();
  // One finished set earns Set master, so its bar follows the set he is closest to finishing.
  const closest = badge.kind === 'sets' && !earned ? closestSet : undefined;
  return <View style={s.achievement}>
    {earned ? <Pressable accessibilityRole="button" accessibilityLabel={`${badge.name}, earned badge. Inspect in 3D`} accessibilityHint="Opens a full-screen badge viewer. Drag to turn it, or use Flip and Reset." onPress={onInspect} style={state => [s.row, pressFx(state)]}>
      <BadgeArtwork emblem={badge.emblem} />
      <View style={s.copy}><Txt variant="cardTitle">{badge.name}</Txt><Txt muted variant="caption">{badge.description}</Txt><Txt variant="caption" style={s.earnedHint}>View in 3D</Txt></View>
      <View style={s.chevron}><Icon name="back" size={16} color={C.muted} /></View>
    </Pressable> : <View style={s.row}>
      <BadgeArtwork emblem={badge.emblem} earned={false} />
      <View style={s.copy}>
        <Txt variant="cardTitle">{badge.name}</Txt><Txt muted variant="caption">{badge.description}</Txt>
        <View style={s.progress}><Progress value={closest ? closest.owned : progress} total={closest ? closest.official : badge.target} color="#679255" /></View>
        <Txt variant="caption" style={s.progressText}>{badge.kind === 'sets' ? closest ? `${closest.name}: ${closest.owned} of ${closest.official}` : 'Add a card to start your first set' : `${progress} of ${badge.target} ${badge.kind === 'cards' ? 'cards' : badge.kind === 'languages' ? 'languages' : 'Pokémon'}`}</Txt>
      </View>
    </View>}
    {badge.kind === 'species-set' && <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Hide' : 'Show'} Pokémon for ${badge.name}`} aria-expanded={expanded} onPress={() => { tick(); setExpanded(value => !value); }} style={state => [s.toggle, pressFx(state)]}>
        <Txt variant="label" style={s.toggleText}>{expanded ? 'Hide' : earned ? 'Show Pokémon' : `Show Pokémon (${badge.target - progress} left)`}</Txt>
        <Icon name={expanded ? 'minus' : 'plus'} size={17} color={C.muted} />
      </Pressable>
      {expanded && <View style={s.checklist}>
        <Txt muted variant="caption">Tap a Pokémon to see its cards.</Txt>
        <View style={s.speciesList}>{badge.speciesIds.map(id => {
          const owned = discovered.has(id);
          const name = speciesById.get(id)?.en ?? `#${id}`;
          return <Pressable key={id} accessibilityRole="button" accessibilityLabel={`${name}, ${owned ? 'collected' : 'still to find'}. View cards`} onPress={() => { tick(); onSpecies(id); }} style={state => [s.species, { flexBasis: 132 * Math.min(fontScale, 1.4) }, pressFx(state)]}>
            <Icon name={owned ? 'check' : 'search'} color={owned ? '#48763A' : C.muted} size={14} />
            <Txt variant="label" style={s.speciesName}>{name}</Txt>
          </Pressable>;
        })}</View>
      </View>}
    </>}
  </View>;
}

const s = StyleSheet.create({
  list: { padding: S.xl, paddingBottom: 32 },
  header: { gap: S.lg, marginBottom: S.xl },
  heading: { gap: S.xs },
  group: { marginBottom: S.lg },
  groupTitle: { marginBottom: S.xs },
  achievement: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, paddingBottom: S.sm, marginBottom: S.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: S.md, paddingVertical: S.md },
  copy: { flex: 1, minWidth: 0, gap: S.xs },
  progress: { marginVertical: S.xs },
  earnedHint: { color: '#80611F', fontWeight: '600', marginTop: S.xs },
  chevron: { alignSelf: 'center', transform: [{ rotate: '180deg' }] },
  progressText: { color: C.muted, fontWeight: '600', flexShrink: 1 },
  toggle: { minHeight: 44, paddingVertical: S.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.sm },
  toggleText: { color: C.muted, flexShrink: 1 },
  checklist: { paddingBottom: S.md, gap: S.md },
  speciesList: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  species: { flexDirection: 'row', alignItems: 'center', gap: S.sm, flexGrow: 1, maxWidth: '100%', minWidth: 0, minHeight: 44, paddingVertical: S.sm },
  speciesName: { flexShrink: 1 },
  empty: { alignItems: 'center', paddingVertical: 28, gap: 12 },
  emptyText: { textAlign: 'center', maxWidth: 330 },
});
