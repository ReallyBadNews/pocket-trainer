import index from '../data/card-types.json';
import type { Card, CardBrief } from './model';

export type CardFilter = 'all' | 'pokemon' | 'trainer' | 'item' | 'energy' | 'tagteam' | 'stadium';
export const CARD_FILTERS: { id: CardFilter; label: string }[] = [
  { id: 'all', label: 'All cards' }, { id: 'pokemon', label: 'Pokémon' },
  { id: 'trainer', label: 'Trainer' }, { id: 'item', label: 'Item' },
  { id: 'energy', label: 'Energy' }, { id: 'tagteam', label: 'TAG TEAM' }, { id: 'stadium', label: 'Stadium' },
];
const types = index as Record<string, Record<string, number>>;
const categoryForCode = (code: number) => code === 1 ? 'Pokemon' : code === 3 ? 'Energy' : code >= 2 ? 'Trainer' : 'Card';
export function cardCategory(card: CardBrief): string {
  if (card.category && ['Pokemon', 'Trainer', 'Energy'].includes(card.category)) return card.category;
  return categoryForCode((types[card.language]?.[card.id] ?? 0) & 15);
}
export function trainerType(card: CardBrief): string | undefined {
  if (cardCategory(card) !== 'Trainer') return undefined;
  return card.trainerType ?? ({ 4: 'Item', 5: 'Stadium', 6: 'Supporter', 7: 'Tool' } as Record<number, string>)[(types[card.language]?.[card.id] ?? 0) & 15];
}
export const isTagTeam = (card: CardBrief) => card.tagTeam ?? !!((types[card.language]?.[card.id] ?? 0) & 16);
export function matchesCardFilter(card: CardBrief, filter: CardFilter): boolean {
  const category = cardCategory(card);
  return filter === 'all' || (filter === 'pokemon' && category === 'Pokemon') ||
    (filter === 'trainer' && category === 'Trainer') || (filter === 'energy' && category === 'Energy') ||
    (filter === 'item' && trainerType(card) === 'Item') || (filter === 'stadium' && trainerType(card) === 'Stadium') ||
    (filter === 'tagteam' && isTagTeam(card));
}
export function cardKindLabel(card: CardBrief): string {
  const category = cardCategory(card);
  const label = category === 'Pokemon' ? 'Pokémon' : trainerType(card) ? `Trainer · ${trainerType(card)}` : category;
  return isTagTeam(card) ? `TAG TEAM · ${label}` : label;
}
export const pokemonIds = (card: Card) => cardCategory(card) === 'Pokemon' ? [...new Set(card.dexIds.filter(n => Number.isInteger(n) && n > 0))] : [];

export function scanTypeHint(header: string): CardFilter {
  // Only the heading area counts: attack/rule text often mentions Energy or Trainers.
  const text = header.normalize('NFKC');
  if (/スタジアム|\bstadium\b/i.test(text)) return 'stadium';
  if (/グッズ|\bitem\b/i.test(text)) return 'item';
  if (/サポート|トレーナーズ|\b(?:supporter|trainer)\b/i.test(text)) return 'trainer';
  if (/\btag\s*team\b|タッグチーム/i.test(text)) return 'tagteam';
  if (/^(?:basic\s+|special\s+)?energy\s*$/im.test(text) || /^(?:基本|特殊)?エネルギー\s*$/m.test(text)) return 'energy';
  return 'all';
}
