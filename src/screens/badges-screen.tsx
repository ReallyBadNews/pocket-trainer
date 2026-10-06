import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { BadgeArtwork } from '@/components/badge-artwork';
import { C, Icon, Progress, S, Segmented, Txt, pressFx, tick, ui } from '@/components/pokedex-ui';
import { useChromeScroll } from '@/components/scroll-chrome';
import { badgeMeter, badgeStatus, type BadgeStatus } from '@/lib/badge-details';
import { BADGES, BADGE_GROUPS, type Badge } from '@/lib/badges';
import { catalogSet } from '@/lib/catalog';
import { useCollection } from '@/lib/collection-context';
import { discoveredIds } from '@/lib/model';
import { setProgress } from '@/lib/set-progress';
import { openPage } from '@/components/page';

type BadgeFilter = 'all' | 'todo' | 'earned';
const FILTERS = [{ id: 'all', label: 'All' }, { id: 'todo', label: 'Not yet' }, { id: 'earned', label: 'Earned' }] as const;

export function BadgesScreen() {
  const scroll = useChromeScroll();
  const { trainer } = useCollection();
  const [filter, setFilter] = useState<BadgeFilter>('all');
  const discovered = useMemo(() => discoveredIds(trainer), [trainer]);
  const sets = useMemo(() => setProgress(trainer, catalogSet), [trainer]);
  const achievements = useMemo(() => BADGES.map(badge => ({ badge, ...badgeStatus(trainer, badge, discovered, sets) })), [trainer, discovered, sets]);
  const earnedCount = achievements.filter(achievement => achievement.earned).length;
  const visible = achievements.filter(achievement => filter === 'all' || (filter === 'earned' ? achievement.earned : !achievement.earned));

  return <Animated.ScrollView {...scroll} contentContainerStyle={[s.list, scroll.contentContainerStyle]} showsVerticalScrollIndicator={false}>
    <View style={s.header}>
      <View style={s.heading}><Txt accessibilityRole="header" variant="title">Badges</Txt><Txt muted variant="caption">{earnedCount} of {BADGES.length} earned</Txt></View>
      <Segmented label="Show badges" options={FILTERS} value={filter} onChange={setFilter} />
    </View>
    {BADGE_GROUPS.map(group => {
      const items = visible.filter(achievement => achievement.badge.group === group);
      if (!items.length) return null;
      return <View key={group} style={s.group}>
        <Txt accessibilityRole="header" variant="subtitle" style={s.groupTitle}>{group}</Txt>
        {items.map(({ badge, ...status }) => <AchievementRow key={badge.id} badge={badge} status={status} />)}
      </View>;
    })}
    {!visible.length && <View style={s.empty}>
      <Image source={require('../../assets/crafted/badge.png')} style={{ width: 96, height: 96, opacity: filter === 'earned' ? .5 : 1 }} contentFit="contain" accessibilityIgnoresInvertColors />
      <Txt style={[ui.subtitle, s.emptyText]}>{filter === 'earned' ? 'Add your first card to earn a badge!' : 'Wow! You got them all!'}</Txt>
    </View>}
  </Animated.ScrollView>;
}

/** The whole row opens the badge's page: what it needs, which Pokémon are left, and the 3D view once earned. */
function AchievementRow({ badge, status }: { badge: Badge; status: BadgeStatus }) {
  const meter = badgeMeter(badge, status);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${badge.name}, ${status.earned ? 'earned' : meter.label}. ${badge.description}`} accessibilityHint={status.earned ? 'Opens the badge, where you can view it in 3D' : 'Shows what you still need for this badge'} onPress={() => { tick(); openPage({ pathname: '/badges/[id]', params: { id: badge.id } }); }} style={state => [s.row, pressFx(state)]}>
    <BadgeArtwork emblem={badge.emblem} earned={status.earned} />
    <View style={s.copy}>
      <Txt variant="cardTitle">{badge.name}</Txt><Txt muted variant="caption">{badge.description}</Txt>
      {status.earned ? <View style={s.earned}><Icon name="star" size={15} color={C.gold} filled /><Txt variant="caption" style={s.earnedText}>Earned!</Txt></View> : <>
        <View style={s.progress}><Progress value={meter.value} total={meter.total} color="#679255" /></View>
        <Txt variant="caption" style={s.progressText}>{meter.label}</Txt>
      </>}
    </View>
    <View style={s.chevron}><Icon name="back" size={16} color={C.muted} /></View>
  </Pressable>;
}

const s = StyleSheet.create({
  list: { padding: S.xl, paddingBottom: 32 },
  header: { gap: S.lg, marginBottom: S.xl },
  heading: { gap: S.xs },
  group: { marginBottom: S.lg },
  groupTitle: { marginBottom: S.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: S.md, paddingVertical: S.md, minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  copy: { flex: 1, minWidth: 0, gap: S.xs },
  progress: { marginVertical: S.xs },
  earned: { flexDirection: 'row', alignItems: 'center', gap: S.xs, marginTop: S.xs },
  earnedText: { color: '#80611F', fontWeight: '600', flexShrink: 1 },
  chevron: { alignSelf: 'center', transform: [{ rotate: '180deg' }] },
  progressText: { color: C.muted, fontWeight: '600', flexShrink: 1 },
  empty: { alignItems: 'center', paddingVertical: 28, gap: 12 },
  emptyText: { textAlign: 'center', maxWidth: 330 },
});
