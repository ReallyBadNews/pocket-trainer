import { CARD_FILTERS, matchesCardFilter, type CardFilter } from './card-kind';
import { normalize, speciesById } from './catalog';
import { needsPrinting } from './binder-order';
import { isLanguage, LANGUAGE_CODES, LANGUAGE_LABELS } from './languages';
import type { Entry, Trainer } from './model';
import { setKey, setProgress, type SetCatalog, type SetProgress } from './set-progress';

export const BINDER_SHOWS = ['All cards', 'Favorites', 'Doubles', 'Japanese', 'Korean', 'Chinese'] as const;

export type BinderShow = (typeof BINDER_SHOWS)[number];

/** What the Binder filter page edits. Search stays in the Binder's own search box. */
export type BinderFilters = { show: BinderShow; kind: CardFilter; needsPrinting: boolean };

export const DEFAULT_BINDER_FILTERS: BinderFilters = { show: 'All cards', kind: 'all', needsPrinting: false };

export function matchesBinderShow(entry: Entry, show: BinderShow) {
  switch (show) {
    case 'All cards':
      return true;
    case 'Favorites':
      return entry.favorite;
    case 'Doubles':
      return entry.quantity > 1;
    case 'Japanese':
      return entry.card.language === 'ja';
    case 'Korean':
      return entry.card.language === 'ko';
    case 'Chinese':
      return entry.card.language.startsWith('zh-');
  }
}

/** Every word must appear in the card name, set, number or Pokémon names. */
export function matchesBinderQuery(entry: Entry, query: string) {
  const terms = query.trim().split(/\s+/).filter(Boolean);

  if (!terms.length) return true;

  const text = normalize(
    `${entry.card.name} ${entry.card.set.name} ${entry.card.localId} ${entry.card.dexIds.map((id) => speciesById.get(id)?.en ?? '').join(' ')}`,
  );

  return terms.every((term) => text.includes(normalize(term)));
}

export const matchesBinderFilters = (entry: Entry, filters: BinderFilters) =>
  (!filters.needsPrinting || needsPrinting(entry)) &&
  matchesCardFilter(entry.card, filters.kind) &&
  matchesBinderShow(entry, filters.show);

export const activeBinderFilters = (filters: BinderFilters) =>
  Number(filters.show !== DEFAULT_BINDER_FILTERS.show) +
  Number(filters.kind !== DEFAULT_BINDER_FILTERS.kind) +
  Number(filters.needsPrinting);

export type BinderFilterCounts = {
  show: Record<BinderShow, number>;
  kind: Record<CardFilter, number>;
  printing: { all: number; needs: number };
  total: number;
};

/**
 * How many Binder entries each filter choice would show if picked, keeping the other two filters and the search as
 * they are. `total` is what the Binder shows now. Entries, not copies, to match the Binder's "N cards shown".
 */
export function binderFilterCounts(entries: readonly Entry[], filters: BinderFilters, query = ''): BinderFilterCounts {
  const counts: BinderFilterCounts = {
    show: Object.fromEntries(BINDER_SHOWS.map((show) => [show, 0])) as Record<BinderShow, number>,
    kind: Object.fromEntries(CARD_FILTERS.map(({ id }) => [id, 0])) as Record<CardFilter, number>,
    printing: { all: 0, needs: 0 },
    total: 0,
  };

  for (const entry of entries) {
    if (!matchesBinderQuery(entry, query)) continue;

    const show = matchesBinderShow(entry, filters.show),
      kind = matchesCardFilter(entry.card, filters.kind),
      needs = needsPrinting(entry),
      printing = !filters.needsPrinting || needs;

    if (kind && printing)
      for (const option of BINDER_SHOWS) if (matchesBinderShow(entry, option)) counts.show[option]++;

    if (show && printing) for (const { id } of CARD_FILTERS) if (matchesCardFilter(entry.card, id)) counts.kind[id]++;

    if (show && kind) {
      counts.printing.all++;

      if (needs) counts.printing.needs++;
    }
  }

  counts.total = filters.needsPrinting ? counts.printing.needs : counts.printing.all;

  return counts;
}

export type SetShow = 'progress' | 'complete' | 'all';

export const SET_SHOWS: { id: SetShow; label: string }[] = [
  { id: 'progress', label: 'To finish' },
  { id: 'complete', label: 'Complete' },
  { id: 'all', label: 'All' },
];

export type SetSort = 'closest' | 'name' | 'collected';

export const SET_SORTS: { id: SetSort; label: string }[] = [
  { id: 'closest', label: 'Closest to finishing' },
  { id: 'name', label: 'Name' },
  { id: 'collected', label: 'Most collected' },
];

/** Unfinished sets are the ones worth hunting, unless every set is done. */
export const defaultSetShow = (sets: readonly SetProgress[]): SetShow =>
  sets.some((set) => !set.complete) ? 'progress' : 'all';

// Accents fold away so "pokemon" finds Pokémon sets.
const fold = (value: string) => normalize(value.normalize('NFD').replace(/\p{M}/gu, ''));

/** Words match the set name, its code or its language ("japanese", "jp"). */
export function matchesSetQuery(set: SetProgress, query: string) {
  const terms = query.trim().split(/\s+/).filter(Boolean);

  if (!terms.length) return true;
  const text = fold(`${set.name} ${set.setId} ${LANGUAGE_CODES[set.language]} ${LANGUAGE_LABELS[set.language]}`);

  return terms.every((term) => text.includes(fold(term)));
}

/** `sets` comes closest-to-finishing first, as `setProgress` orders them; the other sorts keep that order for ties. */
export function browseSets(
  sets: readonly SetProgress[],
  { show, sort, query }: { show: SetShow; sort: SetSort; query: string },
): SetProgress[] {
  const visible = sets.filter(
    (set) => (show === 'all' || (show === 'complete') === set.complete) && matchesSetQuery(set, query),
  );

  if (sort === 'name') visible.sort((a, b) => a.name.localeCompare(b.name));

  if (sort === 'collected') visible.sort((a, b) => b.owned - a.owned);

  return visible;
}

/**
 * The set behind a `/sets/[language]/[id]` link. Started sets come from the live collection; a catalog set with
 * nothing collected yet still gets an empty checklist. Open-ended promo sets have no size to finish, so none.
 */
export function routeSet(
  trainer: Trainer,
  language: string | undefined,
  id: string | undefined,
  catalog: SetCatalog,
): SetProgress | undefined {
  if (!isLanguage(language) || !id) return undefined;
  const info = catalog(language, id);
  const setId = info?.id ?? id;

  return (
    setProgress(trainer, catalog).find((set) => set.key === setKey(language, setId)) ??
    (info && info.official > 0
      ? {
          key: setKey(language, info.id),
          language,
          setId: info.id,
          name: info.name,
          owned: 0,
          official: info.official,
          bonus: 0,
          complete: false,
        }
      : undefined)
  );
}

/** The main-series regions by National Pokédex number. */
export const REGIONS = [
  { id: 'kanto', name: 'Kanto', first: 1, last: 151 },
  { id: 'johto', name: 'Johto', first: 152, last: 251 },
  { id: 'hoenn', name: 'Hoenn', first: 252, last: 386 },
  { id: 'sinnoh', name: 'Sinnoh', first: 387, last: 493 },
  { id: 'unova', name: 'Unova', first: 494, last: 649 },
  { id: 'kalos', name: 'Kalos', first: 650, last: 721 },
  { id: 'alola', name: 'Alola', first: 722, last: 809 },
  { id: 'galar', name: 'Galar', first: 810, last: 905 },
  { id: 'paldea', name: 'Paldea', first: 906, last: 1025 },
] as const;

export type Region = (typeof REGIONS)[number];

export type RegionId = Region['id'];

export const regionOf = (id: number) => REGIONS.find((region) => id >= region.first && id <= region.last);

export const isRegionId = (value: unknown): value is RegionId => REGIONS.some((region) => region.id === value);
