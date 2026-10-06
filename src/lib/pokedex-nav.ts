import { createContext, useContext } from 'react';
import type { Card, CardBrief, Entry } from './model';
import type { AddedCards } from './use-add-cards';

export const TABS = [
  { name: 'dex', href: '/', label: 'Pokédex', icon: 'dex' },
  { name: 'binder', href: '/binder', label: 'Binder', icon: 'binder' },
  { name: 'scan', href: '/scan', label: 'Scan', icon: 'scan' },
  { name: 'badges', href: '/badges', label: 'Badges', icon: 'badge' },
] as const;

export type TabName = (typeof TABS)[number]['name'];

/**
 * Pages are expo-router routes in each tab's stack. Cards, Pokémon, the wishlist, the quiz and settings stay in the
 * device's sheet host so they can open over any page; these actions reach it, and switch tabs, from any route.
 */
export type PokedexNav = {
  tab: TabName;
  /** Switch to a tab's first page, or pop back to it if it's already showing. */
  goToTab: (tab: TabName) => void;
  openEntry: (entry: Entry) => void;
  openCard: (card: CardBrief, draft?: Card) => void;
  openSpecies: (id: number) => void;
  openWishlist: () => void;
  openQuiz: () => void;
  /** A fresh scan, optionally searching for a name. */
  openScan: (query?: string) => void;
  /** The Binder, showing only cards whose printing still needs choosing. */
  confirmPrintings: () => void;
  scan: { query: string; session: number; captureRequest: number };
  onScanAdded: (added: AddedCards, source: 'card' | 'page') => void;
};

export const PokedexNavContext = createContext<PokedexNav | null>(null);

export function usePokedexNav() {
  const nav = useContext(PokedexNavContext);

  if (!nav) throw new Error('usePokedexNav must be used inside the Pokédex shell.');

  return nav;
}
