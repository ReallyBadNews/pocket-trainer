import type { Entry } from './model';
import { priceKey, quotePrice, type ExchangeRate, type PriceSnapshot } from './pricing';

export type BinderSort = 'recent' | 'priceHigh' | 'priceLow' | 'needsPrinting';
export const BINDER_SORTS: { id: BinderSort; label: string }[] = [
  { id: 'recent', label: 'Recently added' }, { id: 'priceHigh', label: 'Highest price' },
  { id: 'priceLow', label: 'Lowest price' }, { id: 'needsPrinting', label: 'Needs printing first' },
];
export const needsPrinting = (entry: Entry) => entry.finish === 'unsure';

/** Sort card values, not stack totals. Unknown prices stay last in either direction. */
export function sortBinderEntries(entries: Entry[], sort: BinderSort, snapshots: Readonly<Record<string, PriceSnapshot>>, fx?: ExchangeRate): Entry[] {
  const rows = entries.map((entry, index) => ({ entry, index, price: sort === 'priceHigh' || sort === 'priceLow' ? quotePrice(snapshots[priceKey(entry.card)], entry.finish, fx)?.low : undefined }));
  return rows.sort((a, b) => {
    if (sort === 'needsPrinting') {
      const attention = Number(needsPrinting(b.entry)) - Number(needsPrinting(a.entry));
      if (attention) return attention;
    }
    if (sort === 'priceHigh' || sort === 'priceLow') {
      if (a.price === undefined && b.price !== undefined) return 1;
      if (a.price !== undefined && b.price === undefined) return -1;
      if (a.price !== undefined && b.price !== undefined && a.price !== b.price) return (a.price - b.price) * (sort === 'priceHigh' ? -1 : 1);
      return a.index - b.index;
    }
    return Date.parse(b.entry.addedAt) - Date.parse(a.entry.addedAt) || a.index - b.index;
  }).map(row => row.entry);
}
