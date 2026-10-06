import { Pressable, StyleSheet, View } from 'react-native';
import { Page, goBack } from '@/components/page';
import { Button, ButtonRow, C, Icon, LinkButton, S, Txt, pressFx, tick, ui } from '@/components/pokedex-ui';
import { useBinderBrowse } from '@/lib/browse-state';
import { CARD_FILTERS } from '@/lib/card-kind';
import { useCollection } from '@/lib/collection-context';
import { activeBinderFilters, BINDER_SHOWS, binderFilterCounts, DEFAULT_BINDER_FILTERS } from '@/lib/collection-filters';

type Printing = 'all' | 'needs';
const cards = (n: number) => `${n} ${n === 1 ? 'card' : 'cards'}`;

/** What the Binder shows. Each tap applies straight away, so the Binder under this page is already up to date. */
export function BinderFiltersPage() {
  const { trainer } = useCollection();
  const [browse, update] = useBinderBrowse();
  const counts = binderFilterCounts(trainer.entries, browse, browse.query);
  const active = activeBinderFilters(browse);
  const query = browse.query.trim();
  return <Page title="Filter cards" footer={<ButtonRow>
    <Button secondary title="Clear filters" disabled={!active} accessibilityHint="Shows every card again. Keeps your search and sort." onPress={() => update(DEFAULT_BINDER_FILTERS)} />
    <Button title={`Show ${cards(counts.total)}`} onPress={goBack} />
  </ButtonRow>}>
    <View style={s.intro}>
      <Txt muted variant="caption">The number beside each choice is how many cards you’d see.</Txt>
      {/* The note wraps; Clear search keeps its place beside the first line. */}
      {!!query && <View style={s.search}><Txt variant="label" style={s.label}>Also matching “{query}”</Txt><LinkButton title="Clear search" onPress={() => update({ query: '' })} /></View>}
    </View>
    <Choices label="Show" options={BINDER_SHOWS.map(id => ({ id, label: id, count: counts.show[id] }))} value={browse.show} onChange={show => update({ show })} />
    <Choices label="Card kind" options={CARD_FILTERS.map(option => ({ ...option, count: counts.kind[option.id] }))} value={browse.kind} onChange={kind => update({ kind })} />
    <Choices<Printing> label="Printing" detail="Cards saved as “Not sure yet” need their printing picked for an exact price."
      options={[{ id: 'all', label: 'All printings', count: counts.printing.all }, { id: 'needs', label: 'Needs printing', count: counts.printing.needs }]}
      value={browse.needsPrinting ? 'needs' : 'all'} onChange={value => update({ needsPrinting: value === 'needs' })} />
  </Page>;
}

/** One pick per section, like a native checked list, with each choice's card count. */
function Choices<T extends string>({ label, detail, options, value, onChange }: { label: string; detail?: string; options: readonly { id: T; label: string; count: number }[]; value: T; onChange: (value: T) => void }) {
  return <View style={s.section}>
    <View style={{ gap: S.xs }}><Txt accessibilityRole="header" variant="subtitle">{label}</Txt>{detail && <Txt muted variant="caption">{detail}</Txt>}</View>
    <View accessibilityRole="radiogroup" accessibilityLabel={label}>{options.map(option => {
      const checked = option.id === value;
      return <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={`${option.label}, ${cards(option.count)}`} accessibilityState={{ checked }} aria-checked={checked} onPress={() => { if (!checked) { tick(); onChange(option.id); } }} style={state => [ui.actionRow, pressFx(state)]}>
        <Txt style={[s.label, checked && { fontWeight: '600' }, !checked && !option.count && { color: C.muted }]}>{option.label}</Txt>
        <Txt variant="readout" muted={!checked} style={checked && { fontWeight: '600' }}>{option.count}</Txt>
        <View style={s.check}>{checked && <Icon name="check" size={18} />}</View>
      </Pressable>;
    })}</View>
  </View>;
}

const s = StyleSheet.create({
  intro: { gap: S.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  section: { gap: S.xs },
  label: { flex: 1, minWidth: 0 },
  check: { width: 20, alignItems: 'flex-end' },
});
