import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { AchievementEmblem } from '@/components/achievement-emblem';
import { C, Chip, Icon, Progress, Txt, ui } from '@/components/pokedex-ui';
import { useChromeScroll } from '@/components/scroll-chrome';
import { BADGES, BADGE_GROUPS, type Badge } from '@/lib/badges';
import { catalogSet, speciesById } from '@/lib/catalog';
import { useCollection } from '@/lib/collection-context';
import { badgeProgress, discoveredIds } from '@/lib/model';
import { setProgress, type SetProgress } from '@/lib/set-progress';

type BadgeFilter = 'All badges' | 'To earn' | 'Earned';

export function BadgesScreen({ onSpecies }: { onSpecies: (id: number) => void }) {
  const scroll = useChromeScroll();
  const { trainer } = useCollection();
  const [filter, setFilter] = useState<BadgeFilter>('All badges');
  const discovered = useMemo(() => discoveredIds(trainer), [trainer]);
  const sets = useMemo(() => setProgress(trainer, catalogSet), [trainer]);
  const achievements = useMemo(() => BADGES.map(badge => {
    const progress = badgeProgress(trainer, badge, discovered, sets.filter(set => set.complete).length);
    return { badge, progress, earned: progress >= badge.target };
  }), [trainer, discovered, sets]);
  const earnedCount = achievements.filter(achievement => achievement.earned).length;
  const visible = achievements.filter(achievement => filter === 'All badges' || (filter === 'Earned' ? achievement.earned : !achievement.earned));

  return <Animated.ScrollView {...scroll} contentContainerStyle={[s.list, scroll.contentContainerStyle]} showsVerticalScrollIndicator={false}>
    <View style={s.header}>
      <Txt style={ui.title}>Little wins. Big adventures.</Txt>
      <Txt muted>{earnedCount} of {BADGES.length} badges earned. Every discovery counts.</Txt>
      <Txt muted style={s.note}>Any printing or language counts. For Pokémon challenges, each species counts once.</Txt>
      <View style={s.filters}>{(['All badges', 'To earn', 'Earned'] as const).map(label => <Chip key={label} label={label} selected={filter === label} onPress={() => setFilter(label)} />)}</View>
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
      <Icon name="badge" size={40} color={C.muted} />
      <Txt style={ui.subtitle}>{filter === 'Earned' ? 'Your first badge is waiting' : 'Every badge earned!'}</Txt>
      <Txt muted style={s.emptyText}>{filter === 'Earned' ? 'Add a Pokémon card to earn First discovery. Your collection already counts toward every challenge.' : 'You’ve completed every challenge with this trainer’s collection.'}</Txt>
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
          <Txt style={[s.progressText, earned && { color: '#80611F' }]}>{earned ? 'Badge earned!' : badge.kind === 'sets' ? closest ? `Closest: ${closest.name} · ${closest.owned} / ${closest.official}` : 'Add a card to start your first set' : `${progress} / ${badge.target} ${badge.kind === 'cards' ? 'cards' : badge.kind === 'languages' ? 'languages' : 'Pokémon'}`}</Txt>
        </View>
      </View>
    </View>
    {badge.kind === 'species-set' && <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Hide' : 'Show'} Pokémon for ${badge.name}`} aria-expanded={expanded} onPress={() => setExpanded(value => !value)} style={({ pressed }) => [s.toggle, pressed && { opacity: .6 }]}>
        <Txt style={s.toggleText}>{expanded ? 'Hide checklist' : earned ? 'View collected Pokémon' : `See Pokémon · ${badge.target - progress} to find`}</Txt>
        <Icon name={expanded ? 'minus' : 'plus'} size={17} color={C.muted} />
      </Pressable>
      {expanded && <View style={s.checklist}>
        <Txt muted style={s.checklistHint}>Tap a Pokémon to view its cards. Alternate forms count as the same species.</Txt>
        <View style={s.speciesList}>{badge.speciesIds.map(id => {
          const owned = discovered.has(id);
          const name = speciesById.get(id)?.en ?? `#${id}`;
          return <Pressable key={id} accessibilityRole="button" accessibilityLabel={`${name}, ${owned ? 'collected' : 'still to find'}. View cards`} onPress={() => onSpecies(id)} style={({ pressed }) => [s.species, owned && s.speciesOwned, pressed && { opacity: .6 }]}>
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
  header: { gap: 12, marginBottom: 24 },
  note: { fontSize: 12, lineHeight: 18 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
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
  progressText: { color: C.muted, fontSize: 11, lineHeight: 17, fontWeight: '700', flexShrink: 1 },
  toggle: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: 1, borderTopColor: C.line },
  toggleText: { color: C.muted, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  checklist: { padding: 12, paddingTop: 0, gap: 10 },
  checklistHint: { fontSize: 12, lineHeight: 18 },
  speciesList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  species: { flexDirection: 'row', alignItems: 'center', gap: 7, flexGrow: 1, flexBasis: '46%', minHeight: 44, padding: 9, borderWidth: 1, borderColor: C.line, borderRadius: 9, backgroundColor: '#FAFCF7' },
  speciesOwned: { backgroundColor: '#E4EDD9', borderColor: '#BBCDAA' },
  speciesName: { fontSize: 12, lineHeight: 18, flexShrink: 1 },
  empty: { alignItems: 'center', paddingVertical: 28, gap: 12 },
  emptyText: { textAlign: 'center', maxWidth: 330 },
});
