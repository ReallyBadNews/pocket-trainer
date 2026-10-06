import * as v from 'valibot';
import { pokemonIds } from './card-kind';
import { LanguageSchema, type Language } from './languages';
import type { Badge } from './badges';
import { QUIZ_LENGTH } from './quiz';
import { DateText, DexId, lenient, TcgdexImage, Text, withoutUndefined } from './schema';
import { completedSetCount } from './set-progress';
import {
  awardTrainerAccessories,
  TRAINER_ACCESSORIES,
  type TrainerAccessoryId,
  type TrainerAccessorySelection,
} from './trainer-accessories';

export { BADGES } from './badges';

export type { Language } from './languages';

export const FINISHES = [
  'normal',
  'holo',
  'reverse',
  'firstEdition',
  'firstEditionHolo',
  'firstEditionReverse',
  'wPromo',
  'unsure',
] as const;

export type Finish = (typeof FINISHES)[number];

export type CardBrief = {
  id: string;
  localId: string;
  name: string;
  image?: string;
  localImage?: string;
  language: Language;
  category?: string;
  trainerType?: string;
  energyType?: string;
  tagTeam?: boolean;
};

export type Card = CardBrief & {
  set: { id: string; name: string; total: number };
  dexIds: number[];
  types: string[];
  category: string;
  rarity: string;
  hp?: number;
  description?: string;
  finishes: Finish[];
};

export type Entry = { key: string; card: Card; finish: Finish; quantity: number; favorite: boolean; addedAt: string };

export const TRAINER_SKIN_TONES = ['porcelain', 'peach', 'golden', 'brown', 'deep'] as const;

export const TRAINER_HAIR_STYLES = ['short', 'spiky', 'bob', 'ponytail'] as const;

export const TRAINER_HAIR_COLORS = ['ink', 'chestnut', 'auburn', 'gold', 'blue'] as const;

export const TRAINER_OUTFITS = ['red', 'blue', 'green', 'violet', 'gold'] as const;

export const TRAINER_HEADWEAR = ['none', 'cap', 'headband'] as const;

export type TrainerAppearance = {
  skinTone: (typeof TRAINER_SKIN_TONES)[number];
  hairStyle: (typeof TRAINER_HAIR_STYLES)[number];
  hairColor: (typeof TRAINER_HAIR_COLORS)[number];
  outfit: (typeof TRAINER_OUTFITS)[number];
  headwear: (typeof TRAINER_HEADWEAR)[number];
  accessory?: TrainerAccessorySelection;
};

export const TRAINER_OUTFIT_COLORS: Record<TrainerAppearance['outfit'], string> = {
  red: '#C93240',
  blue: '#377DD1',
  green: '#519269',
  violet: '#8561A8',
  gold: '#CB8437',
};

export const trainerAppearanceFor = (index: number): TrainerAppearance => ({
  skinTone: TRAINER_SKIN_TONES[index % TRAINER_SKIN_TONES.length],
  hairStyle: TRAINER_HAIR_STYLES[index % TRAINER_HAIR_STYLES.length],
  hairColor: TRAINER_HAIR_COLORS[index % TRAINER_HAIR_COLORS.length],
  outfit: TRAINER_OUTFITS[index % TRAINER_OUTFITS.length],
  headwear: index % 3 === 0 ? 'cap' : index % 3 === 1 ? 'none' : 'headband',
});

/** A catalog card the trainer hopes to find. Keyed by language + id, so any printing grants it. */
export type Wish = { key: string; card: CardBrief; dexIds: number[]; addedAt: string };

export const WISHLIST_LIMIT = 200;

/**
 * `quizBest` is the trainer's best Who's That Pokémon? score, out of QUIZ_LENGTH.
 * `wishlist` is optional so trainers created by older code still type-check; parseCollection always fills it.
 */
export type Trainer = {
  id: string;
  name: string;
  color: string;
  appearance: TrainerAppearance;
  entries: Entry[];
  quizBest?: number;
  wishlist?: Wish[];
  unlockedAccessories?: TrainerAccessoryId[];
};

/** grownUpLock guards deleting cards and backups. It belongs to this device: backups never carry it. */
export type Collection = { version: 1; activeId: string; trainers: Trainer[]; grownUpLock: boolean };

export const FINISH_LABELS: Record<Finish, string> = {
  normal: 'Regular',
  holo: 'Holo',
  reverse: 'Reverse holo',
  firstEdition: '1st edition',
  firstEditionHolo: '1st edition holo',
  firstEditionReverse: '1st edition reverse',
  wPromo: 'W promo',
  unsure: 'Not sure yet',
};

export const TRAINER_COLORS = TRAINER_OUTFITS.map((outfit) => TRAINER_OUTFIT_COLORS[outfit]);

export const freshCollection = (): Collection => ({
  version: 1,
  activeId: 'trainer-1',
  grownUpLock: true,
  trainers: [
    {
      id: 'trainer-1',
      name: 'Trainer 1',
      color: TRAINER_COLORS[0],
      appearance: trainerAppearanceFor(0),
      entries: [],
      wishlist: [],
    },
  ],
});

/** Printed totals share the number's width: 001/066, and Gem Pack 17 07/07. */
export const collectorTotal = (localId: string, total: number) =>
  String(total).padStart(/^\d+$/.test(localId.split(' ').pop()!) ? localId.split(' ').pop()!.length : 1, '0');

export const collectorNumber = (card: Card) =>
  `${card.localId}/${card.set.total ? collectorTotal(card.localId, card.set.total) : '?'}`;

export const entryKey = (card: CardBrief, finish: Finish) => `${card.language}:${card.id}:${finish}`;

export const wishKey = (card: CardBrief) => `${card.language}:${card.id}`;

/** A scan photo stands in for the card art only when the catalog has none. */
export const withScanPhoto = <T extends CardBrief>(card: T, photo?: string): T =>
  !card.image && photo ? { ...card, localImage: photo } : card;

export const discoveredIds = (trainer: Trainer) => new Set(trainer.entries.flatMap((e) => pokemonIds(e.card)));

export const totalCards = (trainer: Trainer) => trainer.entries.reduce((n, e) => n + e.quantity, 0);

export const duplicateCards = (trainer: Trainer) =>
  trainer.entries.reduce((n, e) => n + Math.max(0, e.quantity - 1), 0);

export function addCard(trainer: Trainer, card: Card, finish: Finish, quantity: number): Trainer {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999)
    throw new Error('Choose a quantity from 1 to 999.');
  const key = entryKey(card, finish);
  const existing = trainer.entries.find((e) => e.key === key);

  if (existing && existing.quantity + quantity > 999) throw new Error('You can save up to 999 copies of one printing.');

  const next: Trainer = {
    ...trainer,
    entries: existing
      ? trainer.entries.map((e) =>
          e.key === key
            ? {
                ...e,
                card: { ...card, localImage: card.localImage ?? e.card.localImage },
                quantity: e.quantity + quantity,
              }
            : e,
        )
      : [{ key, card, finish, quantity, favorite: false, addedAt: new Date().toISOString() }, ...trainer.entries],
  };

  // Wish granted: any printing of a wished card takes it off the wishlist.
  if (trainer.wishlist) next.wishlist = trainer.wishlist.filter((w) => w.key !== wishKey(card));

  return awardTrainerAccessories(next);
}

/** With exactly one known printing, pick it; otherwise leave it for the collector to confirm. */
export const defaultFinish = (card: Card): Finish => (card.finishes.length === 2 ? card.finishes[0] : 'unsure');

export type Addition = { key: string; quantity: number };

/** Take back copies that were just added, keeping any other changes made since. */
export function undoAdditions(trainer: Trainer, additions: Addition[]): Trainer {
  const removed = new Map<string, number>();

  for (const a of additions) removed.set(a.key, (removed.get(a.key) ?? 0) + a.quantity);

  return {
    ...trainer,
    entries: trainer.entries.flatMap((e) => {
      const quantity = e.quantity - (removed.get(e.key) ?? 0);

      return quantity > 0 ? [{ ...e, quantity }] : [];
    }),
  };
}

export function updateQuantity(trainer: Trainer, key: string, quantity: number): Trainer {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) throw new Error('Invalid quantity.');

  return {
    ...trainer,
    entries: trainer.entries.flatMap((e) => (e.key !== key ? [e] : quantity ? [{ ...e, quantity }] : [])),
  };
}

export function changePrinting(trainer: Trainer, key: string, finish: Finish): Trainer {
  if (!Object.hasOwn(FINISH_LABELS, finish)) throw new Error('Choose a valid printing.');
  const entry = trainer.entries.find((e) => e.key === key);

  if (!entry || finish === entry.finish) return trainer;
  const nextKey = entryKey(entry.card, finish);
  const target = trainer.entries.find((e) => e.key === nextKey);
  const quantity = entry.quantity + (target?.quantity ?? 0);

  if (quantity > 999) throw new Error('You can save up to 999 copies of one printing.');

  const updated: Entry = {
    ...entry,
    key: nextKey,
    finish,
    quantity,
    favorite: entry.favorite || !!target?.favorite,
    card: { ...entry.card, finishes: [...new Set([...entry.card.finishes, finish])] },
  };

  return {
    ...trainer,
    entries: trainer.entries.flatMap((e) => (e.key === key ? [updated] : e.key === nextKey ? [] : [e])),
  };
}

/** Screens pass `completedSets` from the bundled catalog; without it, sets use the totals saved on each card. */
export function badgeProgress(
  trainer: Trainer,
  badge: Badge,
  discovered = discoveredIds(trainer),
  completedSets?: number,
): number {
  let count: number;

  switch (badge.kind) {
    case 'species':
      count = discovered.size;
      break;
    case 'species-set':
      count = badge.speciesIds.filter((id) => discovered.has(id)).length;
      break;
    case 'cards':
      count = totalCards(trainer);
      break;
    case 'languages':
      count = new Set(trainer.entries.map((e) => e.card.language)).size;
      break;
    case 'sets':
      count = completedSets ?? completedSetCount(trainer);
      break;
  }

  return Math.min(count, badge.target);
}

const QuizScore = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(QUIZ_LENGTH));

/** Keeps only a trainer's best score; a lower or equal score leaves them unchanged. */
export function recordQuizScore(trainer: Trainer, score: number): Trainer {
  if (!v.is(QuizScore, score)) throw new Error('Invalid quiz score.');

  return score > (trainer.quizBest ?? 0) ? { ...trainer, quizBest: score } : trainer;
}

const SavedDate = v.pipe(Text(), DateText);

const FinishSchema = v.picklist(FINISHES);

const briefDetails = {
  category: lenient(Text(50)),
  trainerType: lenient(Text(50)),
  energyType: lenient(Text(50)),
  tagTeam: lenient(v.boolean()),
};

const WishCard = v.pipe(
  v.object({
    id: Text(100),
    localId: Text(50),
    name: Text(),
    language: LanguageSchema,
    image: v.optional(TcgdexImage),
    ...briefDetails,
  }),
  v.transform(withoutUndefined),
);

const Wish = v.pipe(
  v.object({
    card: WishCard,
    dexIds: v.pipe(
      v.fallback(v.array(lenient(DexId)), () => []),
      v.transform((ids) => [...new Set(ids.filter((id) => id !== undefined))].slice(0, 10)),
    ),
    addedAt: SavedDate,
  }),
  v.transform(({ card, dexIds, addedAt }): Wish => ({ key: wishKey(card), card, dexIds, addedAt })),
);

/** Wishes are a nice-to-have: a bad one is dropped instead of rejecting the whole binder. */
const Wishlist = v.pipe(
  v.fallback(v.array(lenient(Wish)), () => []),
  v.transform((saved) => {
    const wishes = new Map<string, Wish>();

    for (const wish of saved) if (wish && !wishes.has(wish.key)) wishes.set(wish.key, wish);

    return [...wishes.values()].slice(0, WISHLIST_LIMIT);
  }),
);

const SavedCard = v.pipe(
  v.object({
    id: Text(100),
    localId: Text(50),
    name: Text(),
    language: LanguageSchema,
    set: v.object({ id: Text(100), name: Text(), total: v.pipe(v.number(), v.integer(), v.minValue(0)) }),
    dexIds: v.array(DexId),
    types: v.array(Text(50)),
    category: Text(),
    rarity: Text(),
    finishes: v.array(FinishSchema),
    image: v.optional(TcgdexImage),
    trainerType: briefDetails.trainerType,
    energyType: briefDetails.energyType,
    tagTeam: briefDetails.tagTeam,
    hp: lenient(v.pipe(v.number(), v.finite())),
    description: lenient(v.pipe(v.string(), v.maxLength(2999))),
    localImage: lenient(v.pipe(v.string(), v.startsWith('file://'))),
  }),
  v.transform(withoutUndefined),
);

const SavedEntry = v.pipe(
  v.object({
    key: v.string(),
    card: SavedCard,
    finish: FinishSchema,
    quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(999)),
    favorite: v.boolean(),
    addedAt: SavedDate,
  }),
  v.check((entry) => entry.key === entryKey(entry.card, entry.finish)),
);

const AppearanceSchema = v.object({
  skinTone: v.picklist(TRAINER_SKIN_TONES),
  hairStyle: v.picklist(TRAINER_HAIR_STYLES),
  hairColor: v.picklist(TRAINER_HAIR_COLORS),
  outfit: v.picklist(TRAINER_OUTFITS),
  headwear: v.picklist(TRAINER_HEADWEAR),
  // Unknown or unearned cosmetics fall back to none without blocking the collection.
  accessory: v.optional(
    v.fallback(v.picklist(['none', ...TRAINER_ACCESSORIES.map((accessory) => accessory.id)]), 'none'),
  ),
});

const SavedTrainer = v.pipe(
  v.object({
    id: Text(100),
    name: Text(32),
    color: v.pipe(Text(7), v.regex(/^#[0-9a-f]{6}$/i)),
    appearance: v.optional(v.pipe(AppearanceSchema, v.transform(withoutUndefined))),
    entries: v.pipe(
      v.array(SavedEntry),
      v.maxLength(20000),
      v.check((entries) => new Set(entries.map((e) => e.key)).size === entries.length),
    ),
    // Cosmetic history and game scores never block an otherwise valid binder.
    quizBest: lenient(QuizScore),
    wishlist: Wishlist,
    unlockedAccessories: lenient(
      v.pipe(
        v.array(v.unknown()),
        v.transform((saved) =>
          TRAINER_ACCESSORIES.flatMap((accessory) => (saved.includes(accessory.id) ? [accessory.id] : [])),
        ),
      ),
    ),
  }),
  v.transform(withoutUndefined),
);

const SavedCollection = v.pipe(
  v.object({
    version: v.literal(1),
    activeId: Text(),
    trainers: v.pipe(v.array(SavedTrainer), v.minLength(1), v.maxLength(20)),
    // Saves from before the lock existed, and every backup, open locked; only Settings can unlock.
    grownUpLock: v.optional(v.boolean(), true),
  }),
  v.transform(({ version, activeId, trainers, grownUpLock }): Collection => ({
    version,
    activeId,
    grownUpLock,
    trainers: trainers.map(({ appearance, ...trainer }, index) =>
      awardTrainerAccessories({ ...trainer, appearance: appearance ?? trainerAppearanceFor(index) }),
    ),
  })),
  v.check(
    ({ activeId, trainers }) =>
      new Set(trainers.map((t) => t.id)).size === trainers.length && trainers.some((t) => t.id === activeId),
  ),
);

/** Reject invalid backups before changing any saved data. Rebuild objects to discard unknown fields. */
export function parseCollection(raw: string): Collection {
  if (raw.length > 20_000_000) throw new Error('This backup is too large.');
  const result = v.safeParse(SavedCollection, JSON.parse(raw));

  if (!result.success) throw new Error('This file is not a valid Pocket Trainer backup.');

  return result.output;
}

const portableWishes = (t: Trainer) =>
  (t.wishlist ?? []).map((w) => ({ ...w, card: { ...w.card, localImage: undefined } }));

/** The lock stays out of backups so a shared or edited file can't carry an unlocked setting. Trainers (and their quiz scores and wishlists) travel whole. */
export function portableBackup(collection: Collection): string {
  return JSON.stringify(
    {
      version: collection.version,
      activeId: collection.activeId,
      trainers: collection.trainers.map((t) => ({
        ...t,
        entries: t.entries.map((e) => ({ ...e, card: { ...e.card, localImage: undefined } })),
        wishlist: portableWishes(t),
      })),
    },
    null,
    2,
  );
}

/** Import adds independent profiles, preserving every existing collection and this device's lock. */
export function mergeBackup(current: Collection, incoming: Collection, suffix = Date.now().toString(36)): Collection {
  if (current.trainers.length + incoming.trainers.length > 20)
    throw new Error('A device can have up to 20 trainer profiles.');
  const ids = new Set(current.trainers.map((t) => t.id));

  const trainers = incoming.trainers.map((t, i) => {
    let id = `${t.id}-import-${suffix}-${i}`;

    while (ids.has(id)) id += '-copy';
    ids.add(id);

    return {
      ...t,
      id,
      name: `${t.name.slice(0, 23)} (import)`,
      entries: t.entries.map((e) => ({ ...e, card: { ...e.card, localImage: undefined } })),
      wishlist: portableWishes(t),
    };
  });

  return { ...current, trainers: [...current.trainers, ...trainers] };
}
