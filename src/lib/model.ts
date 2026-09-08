import { pokemonIds } from './card-kind';
export type Language = 'en' | 'ja';
export type Finish = 'normal' | 'holo' | 'reverse' | 'firstEdition' | 'firstEditionHolo' | 'firstEditionReverse' | 'wPromo' | 'unsure';
export type CardBrief = { id: string; localId: string; name: string; image?: string; language: Language; category?: string; trainerType?: string; energyType?: string; tagTeam?: boolean };
export type Card = CardBrief & {
  set: { id: string; name: string; total: number };
  dexIds: number[]; types: string[]; category: string; rarity: string;
  hp?: number; description?: string; finishes: Finish[]; localImage?: string;
};
export type Entry = { key: string; card: Card; finish: Finish; quantity: number; favorite: boolean; addedAt: string };
export const TRAINER_SKIN_TONES = ['porcelain', 'peach', 'golden', 'brown', 'deep'] as const;
export const TRAINER_HAIR_STYLES = ['short', 'spiky', 'bob', 'ponytail'] as const;
export const TRAINER_HAIR_COLORS = ['ink', 'chestnut', 'auburn', 'gold', 'blue'] as const;
export const TRAINER_OUTFITS = ['red', 'blue', 'green', 'violet', 'gold'] as const;
export const TRAINER_HEADWEAR = ['none', 'cap', 'headband'] as const;
export type TrainerAppearance = {
  skinTone: typeof TRAINER_SKIN_TONES[number];
  hairStyle: typeof TRAINER_HAIR_STYLES[number];
  hairColor: typeof TRAINER_HAIR_COLORS[number];
  outfit: typeof TRAINER_OUTFITS[number];
  headwear: typeof TRAINER_HEADWEAR[number];
};
export const TRAINER_OUTFIT_COLORS: Record<TrainerAppearance['outfit'], string> = {
  red: '#C93240', blue: '#377DD1', green: '#519269', violet: '#8561A8', gold: '#CB8437',
};
export const trainerAppearanceFor = (index: number): TrainerAppearance => ({
  skinTone: TRAINER_SKIN_TONES[index % TRAINER_SKIN_TONES.length],
  hairStyle: TRAINER_HAIR_STYLES[index % TRAINER_HAIR_STYLES.length],
  hairColor: TRAINER_HAIR_COLORS[index % TRAINER_HAIR_COLORS.length],
  outfit: TRAINER_OUTFITS[index % TRAINER_OUTFITS.length],
  headwear: index % 3 === 0 ? 'cap' : index % 3 === 1 ? 'none' : 'headband',
});
export type Trainer = { id: string; name: string; color: string; appearance: TrainerAppearance; entries: Entry[] };
export type Collection = { version: 1; activeId: string; trainers: Trainer[] };

export const FINISH_LABELS: Record<Finish, string> = {
  normal: 'Regular', holo: 'Holo', reverse: 'Reverse holo', firstEdition: '1st edition', firstEditionHolo: '1st edition holo', firstEditionReverse: '1st edition reverse', wPromo: 'W promo', unsure: 'Not sure yet',
};
export const TRAINER_COLORS = TRAINER_OUTFITS.map(outfit => TRAINER_OUTFIT_COLORS[outfit]);
export const freshCollection = (): Collection => ({ version: 1, activeId: 'trainer-1', trainers: [{ id: 'trainer-1', name: 'Trainer 1', color: TRAINER_COLORS[0], appearance: trainerAppearanceFor(0), entries: [] }] });
export const entryKey = (card: CardBrief, finish: Finish) => `${card.language}:${card.id}:${finish}`;
export const discoveredIds = (trainer: Trainer) => new Set(trainer.entries.flatMap(e => pokemonIds(e.card)));
export const totalCards = (trainer: Trainer) => trainer.entries.reduce((n, e) => n + e.quantity, 0);
export const duplicateCards = (trainer: Trainer) => trainer.entries.reduce((n, e) => n + Math.max(0, e.quantity - 1), 0);

export function addCard(trainer: Trainer, card: Card, finish: Finish, quantity: number): Trainer {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error('Choose a quantity from 1 to 999.');
  const key = entryKey(card, finish);
  const existing = trainer.entries.find(e => e.key === key);
  if (existing && existing.quantity + quantity > 999) throw new Error('You can save up to 999 copies of one printing.');
  return { ...trainer, entries: existing
    ? trainer.entries.map(e => e.key === key ? { ...e, card: { ...card, localImage: card.localImage ?? e.card.localImage }, quantity: e.quantity + quantity } : e)
    : [{ key, card, finish, quantity, favorite: false, addedAt: new Date().toISOString() }, ...trainer.entries] };
}

export function updateQuantity(trainer: Trainer, key: string, quantity: number): Trainer {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) throw new Error('Invalid quantity.');
  return { ...trainer, entries: trainer.entries.flatMap(e => e.key !== key ? [e] : quantity ? [{ ...e, quantity }] : []) };
}

export function changePrinting(trainer: Trainer, key: string, finish: Finish): Trainer {
  if (!Object.hasOwn(FINISH_LABELS, finish)) throw new Error('Choose a valid printing.');
  const entry = trainer.entries.find(e => e.key === key);
  if (!entry || finish === entry.finish) return trainer;
  const nextKey = entryKey(entry.card, finish);
  const target = trainer.entries.find(e => e.key === nextKey);
  const quantity = entry.quantity + (target?.quantity ?? 0);
  if (quantity > 999) throw new Error('You can save up to 999 copies of one printing.');
  const updated: Entry = { ...entry, key: nextKey, finish, quantity, favorite: entry.favorite || !!target?.favorite,
    card: { ...entry.card, finishes: [...new Set([...entry.card.finishes, finish])] } };
  return { ...trainer, entries: trainer.entries.flatMap(e => e.key === key ? [updated] : e.key === nextKey ? [] : [e]) };
}

export const BADGES = [
  { id: 'first', name: 'First discovery', description: 'Discover your first Pokémon', target: 1, kind: 'species' },
  { id: 'ten', name: 'Field researcher', description: 'Discover 10 Pokémon', target: 10, kind: 'species' },
  { id: 'fifty', name: 'Pokémon explorer', description: 'Discover 50 Pokémon', target: 50, kind: 'species' },
  { id: 'hundred', name: 'Binder builder', description: 'Collect 100 cards', target: 100, kind: 'cards' },
  { id: 'world', name: 'World collector', description: 'Collect English and Japanese cards', target: 2, kind: 'languages' },
  { id: 'sixhundred', name: 'Collection champion', description: 'Collect 600 cards', target: 600, kind: 'cards' },
] as const;
export function badgeProgress(trainer: Trainer, badge: typeof BADGES[number]): number {
  const count = badge.kind === 'species' ? discoveredIds(trainer).size : badge.kind === 'cards' ? totalCards(trainer) : new Set(trainer.entries.map(e => e.card.language)).size;
  return Math.min(count, badge.target);
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const str = (v: unknown, max = 300): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const safeImage = (v: unknown): v is string => typeof v === 'string' && /^https:\/\/assets\.tcgdex\.net\//.test(v) && v.length < 500;

/** Reject invalid backups before changing any saved data. Rebuild objects to discard unknown fields. */
export function parseCollection(raw: string): Collection {
  if (raw.length > 20_000_000) throw new Error('This backup is too large.');
  const data: unknown = JSON.parse(raw);
  const invalid = () => { throw new Error('This file is not a valid Pocket Trainer backup.'); };
  if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.trainers) || !data.trainers.length || data.trainers.length > 20 || !str(data.activeId)) return invalid();
  const trainers: Trainer[] = data.trainers.map((t: unknown, trainerIndex) => {
    if (!isRecord(t) || !str(t.id, 100) || !str(t.name, 32) || !str(t.color, 7) || !/^#[0-9a-f]{6}$/i.test(t.color) || !Array.isArray(t.entries) || t.entries.length > 20000) return invalid();
    const fallbackAppearance = trainerAppearanceFor(trainerIndex);
    let appearance = fallbackAppearance;
    if (t.appearance !== undefined) {
      if (!isRecord(t.appearance)
        || !TRAINER_SKIN_TONES.includes(t.appearance.skinTone as TrainerAppearance['skinTone'])
        || !TRAINER_HAIR_STYLES.includes(t.appearance.hairStyle as TrainerAppearance['hairStyle'])
        || !TRAINER_HAIR_COLORS.includes(t.appearance.hairColor as TrainerAppearance['hairColor'])
        || !TRAINER_OUTFITS.includes(t.appearance.outfit as TrainerAppearance['outfit'])
        || !TRAINER_HEADWEAR.includes(t.appearance.headwear as TrainerAppearance['headwear'])) return invalid();
      appearance = {
        skinTone: t.appearance.skinTone as TrainerAppearance['skinTone'],
        hairStyle: t.appearance.hairStyle as TrainerAppearance['hairStyle'],
        hairColor: t.appearance.hairColor as TrainerAppearance['hairColor'],
        outfit: t.appearance.outfit as TrainerAppearance['outfit'],
        headwear: t.appearance.headwear as TrainerAppearance['headwear'],
      };
    }
    const entries: Entry[] = t.entries.map((e: unknown) => {
      if (!isRecord(e) || !isRecord(e.card) || !str(e.finish) || !Object.hasOwn(FINISH_LABELS, e.finish) || typeof e.quantity !== 'number' || !Number.isInteger(e.quantity) || e.quantity < 1 || e.quantity > 999 || typeof e.favorite !== 'boolean' || !str(e.addedAt) || !Number.isFinite(Date.parse(e.addedAt))) return invalid();
      const c = e.card;
      if (!str(c.id, 100) || !str(c.localId, 50) || !str(c.name) || !['en', 'ja'].includes(String(c.language)) || !isRecord(c.set) || !str(c.set.id, 100) || !str(c.set.name) || typeof c.set.total !== 'number' || !Number.isInteger(c.set.total) || c.set.total < 0 || !Array.isArray(c.dexIds) || !c.dexIds.every(n => Number.isInteger(n) && n > 0 && n < 10000) || !Array.isArray(c.types) || !c.types.every(v => str(v, 50)) || !str(c.category) || !str(c.rarity) || !Array.isArray(c.finishes) || !c.finishes.every(v => typeof v === 'string' && Object.hasOwn(FINISH_LABELS, v)) || (c.image !== undefined && !safeImage(c.image))) return invalid();
      const card: Card = {
        id: c.id, localId: c.localId, name: c.name, language: c.language as Language,
        set: { id: c.set.id, name: c.set.name, total: c.set.total }, dexIds: c.dexIds as number[], types: c.types as string[],
        category: c.category, rarity: c.rarity, finishes: c.finishes as Finish[],
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
    if (new Set(entries.map(e => e.key)).size !== entries.length) return invalid();
    return { id: t.id, name: t.name, color: t.color, appearance, entries };
  });
  if (new Set(trainers.map(t => t.id)).size !== trainers.length || !trainers.some(t => t.id === data.activeId)) return invalid();
  return { version: 1, activeId: data.activeId as string, trainers };
}

export function portableBackup(collection: Collection): string {
  return JSON.stringify({ ...collection, trainers: collection.trainers.map(t => ({ ...t, entries: t.entries.map(e => ({ ...e, card: { ...e.card, localImage: undefined } })) })) }, null, 2);
}

/** Import adds independent profiles, preserving every existing collection. */
export function mergeBackup(current: Collection, incoming: Collection, suffix = Date.now().toString(36)): Collection {
  if (current.trainers.length + incoming.trainers.length > 20) throw new Error('A device can have up to 20 trainer profiles.');
  const ids = new Set(current.trainers.map(t => t.id));
  const trainers = incoming.trainers.map((t, i) => {
    let id = `${t.id}-import-${suffix}-${i}`;
    while (ids.has(id)) id += '-copy';
    ids.add(id);
    return { ...t, id, name: `${t.name.slice(0, 23)} (import)`, entries: t.entries.map(e => ({ ...e, card: { ...e.card, localImage: undefined } })) };
  });
  return { ...current, trainers: [...current.trainers, ...trainers] };
}
