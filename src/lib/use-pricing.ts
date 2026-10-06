import { useEffect, useEffectEvent, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { PriceClient } from './price-client';
import { fetchCardData } from './card-api';
import { readPrices, writePrices } from './storage';
import { priceKey } from './pricing';
import type { CardBrief } from './model';

export const prices = new PriceClient({
  card: fetchCardData,
  read: readPrices,
  write: writePrices,
  exchange: async () => {
    const response = await fetch('https://api.frankfurter.dev/v2/rate/EUR/USD?providers=ECB', {
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) throw new Error('Exchange rate unavailable.');

    return response.json();
  },
});

const actions = { ensure: prices.ensure.bind(prices), ensureFx: prices.ensureFx.bind(prices) };

// Coming back to the app picks up the provider's newer prices without reopening a screen.
AppState.addEventListener('change', (state) => {
  if (state === 'active') prices.wake();
});

/** Fetch after rendering, share requests, and drop queued work when a screen is left. */
export function usePricing(cards: CardBrief[], priority = 10, enabled = true) {
  const state = useSyncExternalStore(prices.subscribe, prices.getState);
  const keys = cards.map(priceKey).join('|');
  // Requests follow the cards' identities (`keys`), not a new array from every render.
  const ensure = useEffectEvent((isActive: () => boolean) => prices.ensure(cards, isActive, priority));
  useEffect(() => {
    void prices.hydrate();
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const timer = setTimeout(() => void ensure(() => active), priority === 0 ? 0 : 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [keys, enabled, priority, state.wakes]);

  return { ...state, ...actions };
}
