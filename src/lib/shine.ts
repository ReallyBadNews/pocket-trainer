import type { Finish } from './model';

const SHINY_FINISHES: Finish[] = ['holo', 'reverse', 'firstEditionHolo', 'firstEditionReverse'];

// English TCGdex rarities, plus the letter codes printed on Japanese, Korean and Chinese cards.
const SHINY_RARITY =
  /holo|double|ultra|illustration|hyper|shiny|secret|rainbow|amazing|radiant|ace spec|gold|^(RR|RRR|AR|SAR|SR|UR|HR|CHR|CSR|SSR|S)$/i;

/** Cards that shine in real life get a holo shimmer: foil printings and the special rarities. */
export function isShiny(card: { rarity?: string }, finish?: Finish) {
  return (!!finish && SHINY_FINISHES.includes(finish)) || SHINY_RARITY.test(card.rarity?.trim() ?? '');
}
