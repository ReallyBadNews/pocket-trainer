import { useEffect, useState } from 'react';
import { PriceClient } from './price-client';
import { fetchCardData } from './card-api';
import { readPrices, writePrices } from './storage';
import { priceKey } from './pricing';
import type { CardBrief } from './model';

export const prices = new PriceClient({
  card: fetchCardData, read: readPrices, write: writePrices,
  exchange: async () => {
    const response = await fetch('https://api.frankfurter.dev/v2/rate/EUR/USD?providers=ECB', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Exchange rate unavailable.');
    return response.json();
  },
});

/** Fetch after rendering, share requests, and drop queued work when a screen is left. */
export function usePricing(cards: CardBrief[], priority = 10, enabled = true) {
  const [, setRevision] = useState(prices.revision);
  const keys = cards.map(priceKey).join('|');
  useEffect(() => {
    const unsubscribe = prices.subscribe(() => setRevision(prices.revision));
    void prices.hydrate();
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const timer = setTimeout(() => void prices.ensure(cards, () => active, priority), priority === 0 ? 0 : 200);
    return () => { active = false; clearTimeout(timer); };
  }, [keys, enabled, priority]);
  return prices;
}
