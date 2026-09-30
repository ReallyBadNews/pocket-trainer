import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { AchievementEmblem } from '@/components/achievement-emblem';
import { C, Icon, Progress, Segmented, Txt, pressFx, tick, ui } from '@/components/pokedex-ui';
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
  const discovered = useMemo(() => discoveredIds(trainer), [trainer]);
  const sets = useMemo(() => setProgress(trainer, catalogSet), [trainer]);
  const achievements = useMemo(() => BADGES.map(badge => {
    const progress = badgeProgress(trainer, badge, discovered, sets.filter(set => set.complete).length);
    return { badge, progress, earned: progress >= badge.target };
  }), [trainer, discovered, sets]);
  const earnedCount = achievements.filter(achievement => achievement.earned).length;
  const visible = achievements.filter(achievement => filter === 'all' || (filter === 'earned' ? achievement.earned : !achievement.earned));

  return <Animated.ScrollView {...scroll} contentContainerStyle={[s.list, scroll.contentContainerStyle]} showsVerticalScrollIndicator={false}>
    <View style={s.header}>
      <View style={s.heading}><Txt accessibilityRole="header" style={ui.title}>Your badges</Txt><Txt style={s.count}>{earnedCount} of {BADGES.length} earned!</Txt><Txt muted style={s.note}>Any card of that Pokémon counts!</Txt></View>
      <Segmented label="Show badges" options={FILTERS} value={filter} onChange={setFilter} />
    </View>
    {BADGE_GROUPS.map(group => {
      const items = visible.filter(achievement => achievement.badge.group === group);
      if (!items.length) return null;
      return <View key={group} style={s.group}>
        <Txt accessibilityRole="header" style={[ui.subtitle, s.groupTitle]}>{group}</Txt>
        {items.map(({ badge, progress, earned }) => <AchievementRow key={badge.id} badge={badge} progress={progress} earned={earned} discovered={discovered} closestSet={sets[0]} onSpecies={onSpecies} />)}
      </View>;
    })}
    {!visible.length && <View style={s.empty}>
      <Image source={require('../../assets/crafted/badge.png')} style={{ width: 96, height: 96, opacity: filter === 'earned' ? .5 : 1 }} contentFit="contain" accessibilityIgnoresInvertColors />
      <Txt style={[ui.subtitle, s.emptyText]}>{filter === 'earned' ? 'Add your first card to earn a badge!' : 'Wow! You got them all!'}</Txt>
    </View>}
  </Animated.ScrollView>;
}

function AchievementRow({ badge, progress, earned, discovered, closestSet, onSpecies }: {
  badge: Badge; progress: number; earned: boolean; discovered: ReadonlySet<number>; closestSet?: SetProgress; onSpecies: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // One finished set earns Set master, so its bar follows the set he is closest to finishing.
  const closest = badge.kind === 'sets' && !earned ? closestSet : undefined;
  return <View style={[s.achievement, earned && s.earned]}>
    <View style={s.row}>
      <AchievementEmblem emblem={badge.emblem} earned={earned} />
      <View style={s.copy}>
        <Txt style={s.name}>{badge.name}</Txt>
        <Txt muted style={s.description}>{badge.description}</Txt>
        <View style={s.progress}><Progress value={closest ? closest.owned : progress} total={closest ? closest.official : badge.target} color={earned ? '#A98428' : '#679255'} /></View>
        <View style={s.status}>
          {earned && <Icon name="check" color="#80611F" size={14} />}
          <Txt style={[s.progressText, earned && { color: '#80611F' }]}>{earned ? 'Badge earned!' : badge.kind === 'sets' ? closest ? `${closest.name}: ${closest.owned} of ${closest.official}` : 'Add a card to start your first set' : `${progress} of ${badge.target} ${badge.kind === 'cards' ? 'cards' : badge.kind === 'languages' ? 'languages' : 'Pokémon'}`}</Txt>
        </View>
      </View>
    </View>
    {badge.kind === 'species-set' && <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Hide' : 'Show'} Pokémon for ${badge.name}`} aria-expanded={expanded} onPress={() => { tick(); setExpanded(value => !value); }} style={state => [s.toggle, pressFx(state)]}>
        <Txt style={s.toggleText}>{expanded ? 'Hide' : earned ? 'Show Pokémon' : `Show Pokémon (${badge.target - progress} left)`}</Txt>
        <Icon name={expanded ? 'minus' : 'plus'} size={17} color={C.muted} />
      </Pressable>
      {expanded && <View style={s.checklist}>
        <Txt muted style={s.checklistHint}>Tap a Pokémon to see its cards.</Txt>
        <View style={s.speciesList}>{badge.speciesIds.map(id => {
          const owned = discovered.has(id);
          const name = speciesById.get(id)?.en ?? `#${id}`;
          return <Pressable key={id} accessibilityRole="button" accessibilityLabel={`${name}, ${owned ? 'collected' : 'still to find'}. View cards`} onPress={() => { tick(); onSpecies(id); }} style={state => [s.species, owned && s.speciesOwned, pressFx(state)]}>
            <Icon name={owned ? 'check' : 'search'} color={owned ? '#48763A' : C.muted} size={14} />
            <Txt style={s.speciesName}>{name}</Txt>
          </Pressable>;
        })}</View>
      </View>}
    </>}
  </View>;
}

const s = StyleSheet.create({
  list: { padding: 20, paddingBottom: 32 },
  header: { gap: 16, marginBottom: 24 },
  heading: { gap: 4 },
  count: { fontSize: 17, fontWeight: '800' },
  note: { fontSize: 14 },
  group: { marginBottom: 16 },
  groupTitle: { marginBottom: 12 },
  achievement: { borderWidth: 1, borderColor: C.line, marginBottom: 12, backgroundColor: '#F5F8EE', borderRadius: 17, overflow: 'hidden' },
  earned: { backgroundColor: '#F7ECCC', borderColor: '#DBC786' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  copy: { flex: 1, gap: 4 },
  name: { fontWeight: '800', fontSize: 17 },
  description: { fontSize: 13, lineHeight: 19 },
  progress: { marginVertical: 5 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  progressText: { color: C.muted, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  toggle: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: 1, borderTopColor: C.line },
  toggleText: { color: C.muted, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  checklist: { padding: 12, paddingTop: 0, gap: 10 },
  checklistHint: { fontSize: 13 },
  speciesList: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  species: { flexDirection: 'row', alignItems: 'center', gap: 7, width: '48.5%', minHeight: 44, padding: 9, borderWidth: 1, borderColor: C.line, borderRadius: 9, backgroundColor: '#FAFCF7' },
  speciesOwned: { backgroundColor: '#E4EDD9', borderColor: '#BBCDAA' },
  speciesName: { fontSize: 14, flexShrink: 1 },
  empty: { alignItems: 'center', paddingVertical: 28, gap: 12 },
  emptyText: { textAlign: 'center', maxWidth: 330 },
});
