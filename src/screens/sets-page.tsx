import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { PageFrame } from '@/components/page';
import { Button, C, ChoiceMenu, Icon, Progress, S, SearchBox, Segmented, Txt, pressFx, tick, ui } from '@/components/pokedex-ui';
import { catalogSet } from '@/lib/catalog';
import { useCollection } from '@/lib/collection-context';
import { browseSets, defaultSetShow, SET_SHOWS, SET_SORTS, type SetShow, type SetSort } from '@/lib/collection-filters';
import { LANGUAGE_CODES, LANGUAGE_LABELS } from '@/lib/languages';
import { usePokedexNav } from '@/lib/pokedex-nav';
import { setProgress, type SetProgress } from '@/lib/set-progress';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Every set he has started, with a checklist behind each one. Lives in both the Binder and Badges stacks. */
export function SetsPage() {
  const { trainer } = useCollection();
  const nav = usePokedexNav();
  const { fontScale } = useWindowDimensions();
  const sets = useMemo(() => setProgress(trainer, catalogSet), [trainer]);
  const [chosenShow, setShow] = useState<SetShow | null>(null);
  const [sort, setSort] = useState<SetSort>('closest');
  const [query, setQuery] = useState('');
  const show = chosenShow ?? defaultSetShow(sets);
  const searchable = sets.length > 6;
  const search = searchable ? query.trim() : '';
  const visible = browseSets(sets, { show, sort, query: search });
  const complete = sets.filter(set => set.complete).length;
  const closest = sets.find(set => !set.complete);

  const empty = !sets.length
    ? { title: 'No sets started yet', body: 'Every card belongs to a set. Add a card and its set shows up here, with a checklist of what’s still to find.', action: 'Add a card', onPress: () => nav.openScan() }
    : search ? { title: `No sets match “${search}”`, body: 'Try part of the set name, or a language like Japanese.', action: 'Clear search', onPress: () => setQuery('') }
    : show === 'complete' ? { title: 'No finished sets yet', body: closest ? `${closest.name} is closest: ${plural(closest.official - closest.owned, 'card')} to go.` : 'Find every numbered card in a set to finish it.', action: 'Show sets in progress', onPress: () => setShow('progress') }
    : { title: 'Every set is complete!', body: `You finished all ${plural(sets.length, 'set')} you started. Amazing!`, action: 'Show all sets', onPress: () => setShow('all') };

  return <PageFrame title="Your sets">{scroll => <Animated.FlatList {...scroll} data={visible} keyExtractor={set => set.key} contentContainerStyle={[s.list, scroll.contentContainerStyle]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
    ListHeaderComponent={sets.length ? <View style={s.header}>
      <View style={{ gap: S.xs }}><Txt variant="label">{plural(sets.length, 'set')} started · {complete} complete</Txt><Txt muted variant="caption">Tap a set to see every card in it and what’s still to find.</Txt></View>
      <Segmented label="Show sets" options={SET_SHOWS} value={show} onChange={setShow} />
      {searchable && <SearchBox value={query} onChange={setQuery} placeholder="Find a set" />}
      <View style={s.toolbar}>
        <Txt muted variant="caption" style={s.count}>{plural(visible.length, 'set')} · {SET_SORTS.find(option => option.id === sort)?.label}</Txt>
        <ChoiceMenu compact triggerTitle="Sort" label="Sort sets" options={SET_SORTS} value={sort} onChange={setSort} style={[s.tool, { flexBasis: 74 * Math.min(fontScale, 1.4) }]} />
      </View>
    </View> : null}
    ListEmptyComponent={<View style={s.empty}>
      <Image source={require('../../assets/crafted/pokeball.png')} style={{ width: 104, height: 104 }} contentFit="contain" />
      <Txt style={[ui.subtitle, { textAlign: 'center' }]}>{empty.title}</Txt>
      <Txt muted style={{ textAlign: 'center', maxWidth: 300 }}>{empty.body}</Txt>
      <Button title={empty.action} icon={sets.length ? undefined : 'scan'} onPress={empty.onPress} style={{ marginTop: S.sm }} />
    </View>}
    renderItem={({ item }) => <SetRow set={item} />} />}</PageFrame>;
}

function SetRow({ set }: { set: SetProgress }) {
  const note = [set.complete ? 'Set complete!' : `${set.official - set.owned} to find`, set.bonus > 0 && `+${set.bonus} bonus`].filter(Boolean).join(' · ');
  return <Pressable accessibilityRole="button" accessibilityLabel={`${set.name}, ${LANGUAGE_LABELS[set.language]}: ${set.owned} of ${set.official} cards, ${note}`} accessibilityHint="Opens the set checklist" onPress={() => { tick(); router.push({ pathname: '/sets/[language]/[id]', params: { language: set.language, id: set.setId } }); }} style={state => [s.row, pressFx(state)]}>
    <View style={[ui.between, { alignItems: 'flex-start', gap: S.md }]}><Txt variant="cardTitle" style={s.name}>{set.name}<Txt variant="caption" muted> · {LANGUAGE_CODES[set.language]}</Txt></Txt><Txt variant="readout" style={{ fontWeight: '600' }}>{set.owned} / {set.official}</Txt></View>
    <Progress value={set.owned} total={set.official} color={set.complete ? '#A98428' : '#679255'} />
    <View style={ui.row}>{set.complete && <Icon name="check" size={13} color="#80611F" />}<Txt variant="caption" style={{ flexShrink: 1, fontWeight: '600', color: set.complete ? '#80611F' : C.muted }}>{note}</Txt></View>
  </Pressable>;
}

const s = StyleSheet.create({
  list: { paddingHorizontal: S.xl },
  header: { gap: S.md, marginBottom: S.xs },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: S.md },
  count: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  tool: { flexGrow: 0, flexShrink: 0, maxWidth: '100%' },
  row: { minHeight: 52, gap: S.sm, paddingVertical: S.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, justifyContent: 'center' },
  name: { flex: 1, minWidth: 0 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 38, gap: S.md },
});
