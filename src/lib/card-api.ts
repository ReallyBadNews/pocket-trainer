import type { CardBrief } from './model';
import { DAY, priceKey } from './pricing';

const cached = new Map<string, { data: any; at: number }>();
const pending = new Map<string, Promise<any>>();
/** Card details and pricing share one request when opened together. */
export async function fetchCardData(card: CardBrief, force = false): Promise<any> {
  const key = priceKey(card), hit = cached.get(key);
  if (!force && hit && Date.now() - hit.at < DAY) return hit.data;
  if (pending.has(key)) return pending.get(key)!;
  const task = (async () => {
    const response = await fetch(`https://api.tcgdex.net/v2/${card.language}/cards/${encodeURIComponent(card.id)}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('We could not load this card. Check your connection and try again.');
    const data = await response.json();
    if (data.id !== card.id) throw new Error('The catalog returned a different card. Please try again.');
    cached.set(key, { data, at: Date.now() });
    if (cached.size > 1200) cached.delete(cached.keys().next().value!);
    return data;
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
