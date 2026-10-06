import { pokemonIds } from './card-kind';
import { REGIONS, regionOf, type Region } from './collection-filters';
import type { Entry } from './model';

export type RecentDiscovery = { id: number; at: string };

/**
 * The Pokémon newest to the Pokédex, newest first. Each one dates from the first card that showed it, so adding
 * another Pikachu later doesn't bring Pikachu back to the front.
 */
export function recentDiscoveries(entries: readonly Pick<Entry, 'card' | 'addedAt'>[], limit = 8): RecentDiscovery[] {
  const first = new Map<number, { at: string; time: number; index: number; slot: number }>();
  // Entries are saved newest first, so when two share a timestamp the later index was added earlier.
  entries.forEach((entry, index) => {
    const parsed = Date.parse(entry.addedAt);
    const time = Number.isFinite(parsed) ? parsed : -Infinity;
    pokemonIds(entry.card).forEach((id, slot) => {
      const seen = first.get(id);
      if (!seen || time < seen.time || (time === seen.time && index > seen.index)) first.set(id, { at: entry.addedAt, time, index, slot });
    });
  });
  return [...first].sort(([, a], [, b]) => b.time - a.time || a.index - b.index || a.slot - b.slot).slice(0, Math.max(0, limit)).map(([id, { at }]) => ({ id, at }));
}

/** "Today", "Yesterday" or a short date, by the device's calendar. */
export function discoveredOn(at: string, now = new Date()): string {
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return '';
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  // Rounding absorbs the 23 and 25 hour days around daylight saving changes.
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

export type RegionProgress = Region & { discovered: number; total: number; complete: boolean; active: boolean };

/** Discovered Pokémon in each region, in National Pokédex order, marking the region the Pokédex list is showing. */
export function regionProgress(discovered: Iterable<number>, show: string = 'all'): RegionProgress[] {
  const counts = new Map<string, number>();
  for (const id of new Set(discovered)) {
    const region = regionOf(id);
    if (region) counts.set(region.id, (counts.get(region.id) ?? 0) + 1);
  }
  return REGIONS.map(region => {
    const total = region.last - region.first + 1, found = counts.get(region.id) ?? 0;
    return { ...region, discovered: found, total, complete: found >= total, active: show === region.id };
  });
}

/** "#001–#151": regions are shown by their Pokédex numbers. */
export const regionRange = (region: Pick<Region, 'first' | 'last'>) => `#${String(region.first).padStart(3, '0')}–#${String(region.last).padStart(3, '0')}`;
