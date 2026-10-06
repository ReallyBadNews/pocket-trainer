import { matchesCardFilter, type CardFilter } from './card-kind';
import { normalize, speciesById } from './catalog';
import { needsPrinting } from './binder-order';
import type { Entry } from './model';

export const BINDER_SHOWS = ['All cards', 'Favorites', 'Doubles', 'Japanese', 'Korean', 'Chinese'] as const;
export type BinderShow = typeof BINDER_SHOWS[number];
/** What the Binder filter page edits. Search stays in the Binder's own search box. */
export type BinderFilters = { show: BinderShow; kind: CardFilter; needsPrinting: boolean };
export const DEFAULT_BINDER_FILTERS: BinderFilters = { show: 'All cards', kind: 'all', needsPrinting: false };

export function matchesBinderShow(entry: Entry, show: BinderShow) {
  switch (show) {
    case 'All cards': return true;
    case 'Favorites': return entry.favorite;
    case 'Doubles': return entry.quantity > 1;
    case 'Japanese': return entry.card.language === 'ja';
    case 'Korean': return entry.card.language === 'ko';
    case 'Chinese': return entry.card.language.startsWith('zh-');
  }
}

/** Every word must appear in the card name, set, number or Pokémon names. */
export function matchesBinderQuery(entry: Entry, query: string) {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const text = normalize(`${entry.card.name} ${entry.card.set.name} ${entry.card.localId} ${entry.card.dexIds.map(id => speciesById.get(id)?.en ?? '').join(' ')}`);
  return terms.every(term => text.includes(normalize(term)));
}

export const matchesBinderFilters = (entry: Entry, filters: BinderFilters) =>
  (!filters.needsPrinting || needsPrinting(entry)) && matchesCardFilter(entry.card, filters.kind) && matchesBinderShow(entry, filters.show);

export const activeBinderFilters = (filters: BinderFilters) =>
  Number(filters.show !== DEFAULT_BINDER_FILTERS.show) + Number(filters.kind !== DEFAULT_BINDER_FILTERS.kind) + Number(filters.needsPrinting);

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
export type Region = typeof REGIONS[number];
export type RegionId = Region['id'];
export const regionOf = (id: number) => REGIONS.find(region => id >= region.first && id <= region.last);
export const isRegionId = (value: unknown): value is RegionId => REGIONS.some(region => region.id === value);
