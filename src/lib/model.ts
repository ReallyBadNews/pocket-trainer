import { pokemonIds } from './card-kind';
import { isLanguage, type Language } from './languages';
import type { Badge } from './badges';
import { QUIZ_LENGTH } from './quiz';
import { completedSetCount } from './set-progress';
import {
  awardTrainerAccessories,
  TRAINER_ACCESSORIES,
  type TrainerAccessoryId,
  type TrainerAccessorySelection,
} from './trainer-accessories';

export { BADGES } from './badges';

export type { Language } from './languages';

export type Finish =
  | 'normal'
  | 'holo'
  | 'reverse'
  | 'firstEdition'
  | 'firstEditionHolo'
  | 'firstEditionReverse'
  | 'wPromo'
  | 'unsure';

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
  // Wish granted: any printing of a wished card takes it off the wishlist.
  const wishlist = trainer.wishlist?.filter((w) => w.key !== wishKey(card));

  return awardTrainerAccessories({
    ...trainer,
    ...(wishlist ? { wishlist } : {}),
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
  });
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

const isQuizScore = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= QUIZ_LENGTH;

/** Keeps only a trainer's best score; a lower or equal score leaves them unchanged. */
export function recordQuizScore(trainer: Trainer, score: number): Trainer {
  if (!isQuizScore(score)) throw new Error('Invalid quiz score.');

  return score > (trainer.quizBest ?? 0) ? { ...trainer, quizBest: score } : trainer;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const str = (v: unknown, max = 300): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

const safeImage = (v: unknown): v is string =>
  typeof v === 'string' && /^https:\/\/assets\.tcgdex\.net\//.test(v) && v.length < 500;

/** Wishes are a nice-to-have: a bad one is dropped instead of rejecting the whole binder. */
function parseWishlist(value: unknown): Wish[] {
  if (!Array.isArray(value)) return [];
  const wishes = new Map<string, Wish>();

  for (const w of value) {
    if (wishes.size >= WISHLIST_LIMIT) break;

    if (!isRecord(w) || !isRecord(w.card) || !str(w.addedAt) || !Number.isFinite(Date.parse(w.addedAt))) continue;
    const c = w.card;

    if (
      !str(c.id, 100) ||
      !str(c.localId, 50) ||
      !str(c.name) ||
      !isLanguage(c.language) ||
      (c.image !== undefined && !safeImage(c.image))
    )
      continue;

    const card: CardBrief = {
      id: c.id,
      localId: c.localId,
      name: c.name,
      language: c.language,
      ...(safeImage(c.image) ? { image: c.image } : {}),
      ...(str(c.category, 50) ? { category: c.category } : {}),
      ...(str(c.trainerType, 50) ? { trainerType: c.trainerType } : {}),
      ...(str(c.energyType, 50) ? { energyType: c.energyType } : {}),
      ...(typeof c.tagTeam === 'boolean' ? { tagTeam: c.tagTeam } : {}),
    };

    const dexIds = Array.isArray(w.dexIds)
      ? [...new Set(w.dexIds.filter((n): n is number => Number.isInteger(n) && n > 0 && n < 10000))].slice(0, 10)
      : [];

    const key = wishKey(card);

    if (!wishes.has(key)) wishes.set(key, { key, card, dexIds, addedAt: w.addedAt });
  }

  return [...wishes.values()];
}

/** Reject invalid backups before changing any saved data. Rebuild objects to discard unknown fields. */
export function parseCollection(raw: string): Collection {
  if (raw.length > 20_000_000) throw new Error('This backup is too large.');
  const data: unknown = JSON.parse(raw);

  const invalid = () => {
    throw new Error('This file is not a valid Pocket Trainer backup.');
  };

  if (
    !isRecord(data) ||
    data.version !== 1 ||
    !Array.isArray(data.trainers) ||
    !data.trainers.length ||
    data.trainers.length > 20 ||
    !str(data.activeId)
  )
    return invalid();

  if (data.grownUpLock !== undefined && typeof data.grownUpLock !== 'boolean') return invalid();

  const trainers: Trainer[] = data.trainers.map((t: unknown, trainerIndex) => {
    if (
      !isRecord(t) ||
      !str(t.id, 100) ||
      !str(t.name, 32) ||
      !str(t.color, 7) ||
      !/^#[0-9a-f]{6}$/i.test(t.color) ||
      !Array.isArray(t.entries) ||
      t.entries.length > 20000
    )
      return invalid();
    const fallbackAppearance = trainerAppearanceFor(trainerIndex);
    let appearance = fallbackAppearance;

    if (t.appearance !== undefined) {
      if (
        !isRecord(t.appearance) ||
        !TRAINER_SKIN_TONES.includes(t.appearance.skinTone as TrainerAppearance['skinTone']) ||
        !TRAINER_HAIR_STYLES.includes(t.appearance.hairStyle as TrainerAppearance['hairStyle']) ||
        !TRAINER_HAIR_COLORS.includes(t.appearance.hairColor as TrainerAppearance['hairColor']) ||
        !TRAINER_OUTFITS.includes(t.appearance.outfit as TrainerAppearance['outfit']) ||
        !TRAINER_HEADWEAR.includes(t.appearance.headwear as TrainerAppearance['headwear'])
      )
        return invalid();
      appearance = {
        skinTone: t.appearance.skinTone as TrainerAppearance['skinTone'],
        hairStyle: t.appearance.hairStyle as TrainerAppearance['hairStyle'],
        hairColor: t.appearance.hairColor as TrainerAppearance['hairColor'],
        outfit: t.appearance.outfit as TrainerAppearance['outfit'],
        headwear: t.appearance.headwear as TrainerAppearance['headwear'],
        ...(t.appearance.accessory !== undefined
          ? { accessory: t.appearance.accessory as TrainerAccessorySelection }
          : {}),
      };
    }

    const entries: Entry[] = t.entries.map((e: unknown) => {
      if (
        !isRecord(e) ||
        !isRecord(e.card) ||
        !str(e.finish) ||
        !Object.hasOwn(FINISH_LABELS, e.finish) ||
        typeof e.quantity !== 'number' ||
        !Number.isInteger(e.quantity) ||
        e.quantity < 1 ||
        e.quantity > 999 ||
        typeof e.favorite !== 'boolean' ||
        !str(e.addedAt) ||
        !Number.isFinite(Date.parse(e.addedAt))
      )
        return invalid();
      const c = e.card;

      if (
        !str(c.id, 100) ||
        !str(c.localId, 50) ||
        !str(c.name) ||
        !isLanguage(c.language) ||
        !isRecord(c.set) ||
        !str(c.set.id, 100) ||
        !str(c.set.name) ||
        typeof c.set.total !== 'number' ||
        !Number.isInteger(c.set.total) ||
        c.set.total < 0 ||
        !Array.isArray(c.dexIds) ||
        !c.dexIds.every((n) => Number.isInteger(n) && n > 0 && n < 10000) ||
        !Array.isArray(c.types) ||
        !c.types.every((v) => str(v, 50)) ||
        !str(c.category) ||
        !str(c.rarity) ||
        !Array.isArray(c.finishes) ||
        !c.finishes.every((v) => typeof v === 'string' && Object.hasOwn(FINISH_LABELS, v)) ||
        (c.image !== undefined && !safeImage(c.image))
      )
        return invalid();

      const card: Card = {
        id: c.id,
        localId: c.localId,
        name: c.name,
        language: c.language as Language,
        set: { id: c.set.id, name: c.set.name, total: c.set.total },
        dexIds: c.dexIds as number[],
        types: c.types as string[],
        category: c.category,
        rarity: c.rarity,
        finishes: c.finishes as Finish[],
        ...(str(c.trainerType, 50) ? { trainerType: c.trainerType } : {}),
        ...(str(c.energyType, 50) ? { energyType: c.energyType } : {}),
        ...(typeof c.tagTeam === 'boolean' ? { tagTeam: c.tagTeam } : {}),
        ...(safeImage(c.image) ? { image: c.image } : {}),
        ...(typeof c.hp === 'number' && Number.isFinite(c.hp) ? { hp: c.hp } : {}),
        ...(typeof c.description === 'string' && c.description.length < 3000 ? { description: c.description } : {}),
        ...(typeof c.localImage === 'string' && /^file:\/\//.test(c.localImage) ? { localImage: c.localImage } : {}),
      };

      const finish = e.finish as Finish;

      if (e.key !== entryKey(card, finish)) return invalid();

      return { key: e.key as string, card, finish, quantity: e.quantity, favorite: e.favorite, addedAt: e.addedAt };
    });

    if (new Set(entries.map((e) => e.key)).size !== entries.length) return invalid();
    // Cosmetic history and game scores never block an otherwise valid binder.
    const savedAccessories = Array.isArray(t.unlockedAccessories) ? t.unlockedAccessories : [];

    const unlockedAccessories = TRAINER_ACCESSORIES.filter((accessory) => savedAccessories.includes(accessory.id)).map(
      (accessory) => accessory.id,
    );

    return awardTrainerAccessories({
      id: t.id,
      name: t.name,
      color: t.color,
      appearance,
      entries,
      ...(isQuizScore(t.quizBest) ? { quizBest: t.quizBest } : {}),
      wishlist: parseWishlist(t.wishlist),
      ...(Array.isArray(t.unlockedAccessories) ? { unlockedAccessories } : {}),
    });
  });

  if (new Set(trainers.map((t) => t.id)).size !== trainers.length || !trainers.some((t) => t.id === data.activeId))
    return invalid();

  // Saves from before the lock existed, and every backup, open locked; only Settings can unlock.
  return { version: 1, activeId: data.activeId as string, trainers, grownUpLock: data.grownUpLock ?? true };
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
