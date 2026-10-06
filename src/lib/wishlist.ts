import { setForCard, speciesById } from './catalog';
import { WISHLIST_LIMIT, wishKey, type CardBrief, type Language, type Trainer, type Wish } from './model';

export { WISHLIST_LIMIT, wishKey, type Wish } from './model';

// Plain names for the share message: grown-ups shopping may not read 日本語.
const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  'zh-cn': 'Simplified Chinese',
  'zh-tw': 'Traditional Chinese',
};

export const wishesOf = (trainer: Trainer): Wish[] => trainer.wishlist ?? [];

export const isWished = (trainer: Trainer, card: CardBrief) => wishesOf(trainer).some((w) => w.key === wishKey(card));

export const wishesForSpecies = (trainer: Trainer, id: number) =>
  wishesOf(trainer).filter((w) => w.dexIds.includes(id));

/** Only catalog identity is kept: device photo paths and full card details stay out of the wishlist. */
export function wishBrief(card: CardBrief): CardBrief {
  const { id, localId, name, image, language, category, trainerType, energyType, tagTeam } = card;

  const brief: CardBrief = { id, localId, name, language };

  if (image) brief.image = image;

  if (category) brief.category = category;

  if (trainerType) brief.trainerType = trainerType;

  if (energyType) brief.energyType = energyType;

  if (tagTeam !== undefined) brief.tagTeam = tagTeam;

  return brief;
}

export function addWish(
  trainer: Trainer,
  card: CardBrief,
  dexIds: number[] = [],
  addedAt = new Date().toISOString(),
): Trainer {
  const wishes = wishesOf(trainer);

  if (wishes.some((w) => w.key === wishKey(card))) return trainer;

  if (wishes.length >= WISHLIST_LIMIT)
    throw new Error(`Your wishlist is full (${WISHLIST_LIMIT} cards). Remove a card to wish for a new one.`);

  const wish: Wish = {
    key: wishKey(card),
    card: wishBrief(card),
    dexIds: [...new Set(dexIds.filter((n) => Number.isInteger(n) && n > 0))],
    addedAt,
  };

  return { ...trainer, wishlist: [...wishes, wish] };
}

export const removeWish = (trainer: Trainer, key: string): Trainer => ({
  ...trainer,
  wishlist: wishesOf(trainer).filter((w) => w.key !== key),
});

export const toggleWish = (trainer: Trainer, card: CardBrief, dexIds: number[] = []): Trainer =>
  isWished(trainer, card) ? removeWish(trainer, wishKey(card)) : addWish(trainer, card, dexIds);

/** Undo puts a removed wish back where it was, unless it was wished again meanwhile. */
export function restoreWish(trainer: Trainer, wish: Wish, index: number): Trainer {
  const wishes = wishesOf(trainer);

  if (wishes.some((w) => w.key === wish.key) || wishes.length >= WISHLIST_LIMIT) return trainer;

  return { ...trainer, wishlist: [...wishes.slice(0, index), wish, ...wishes.slice(index)] };
}

export const wishSetName = (card: CardBrief) => setForCard(card)?.name;

export function wishLine(wish: Wish, setName: (card: CardBrief) => string | undefined = wishSetName): string {
  const { card } = wish;

  // Non-English cards also name the Pokémon in English so family can find the right one.
  const english =
    card.language !== 'en'
      ? wish.dexIds
          .map((id) => speciesById.get(id)?.en)
          .filter(Boolean)
          .join(' & ')
      : '';

  const set = setName(card);

  return `${card.name}${english && english !== card.name ? ` (${english})` : ''} — ${set ? `${set} ` : ''}#${card.localId} (${LANGUAGE_NAMES[card.language]})`;
}

export function wishlistShareText(
  trainerName: string,
  wishes: Wish[],
  setName?: (card: CardBrief) => string | undefined,
): string {
  const title = `${trainerName.trim() || 'Trainer'}'s Pokémon card wishlist ⭐`;

  return wishes.length
    ? [title, ...wishes.map((w, i) => `${i + 1}. ${wishLine(w, setName)}`)].join('\n')
    : `${title}\nNo wishes yet!`;
}
