import { pokemonIds } from './card-kind';
import type { Trainer } from './model';

export const TRAINER_ACCESSORIES = [
  { id: 'fieldPin', name: 'Field pin', description: 'A brass compass for your first discovery.', target: 1 },
  { id: 'explorerScarf', name: 'Explorer scarf', description: 'A woven scarf for your next adventure.', target: 10 },
  { id: 'expeditionSatchel', name: 'Expedition satchel', description: 'A canvas bag for a growing Pokédex.', target: 25 },
] as const;
export type TrainerAccessoryId = typeof TRAINER_ACCESSORIES[number]['id'];
export type TrainerAccessorySelection = 'none' | TrainerAccessoryId;

/** Current milestones supplement the permanent ledger, including older saves. */
export function unlockedTrainerAccessories(trainer: Trainer): TrainerAccessoryId[] {
  const saved = Array.isArray(trainer.unlockedAccessories) ? trainer.unlockedAccessories : [];
  const discovered = new Set(trainer.entries.flatMap(entry => pokemonIds(entry.card))).size;
  return TRAINER_ACCESSORIES.filter(accessory => saved.includes(accessory.id) || discovered >= accessory.target)
    .map(accessory => accessory.id);
}

export function canEquipTrainerAccessory(trainer: Trainer, selection: TrainerAccessorySelection): boolean {
  return selection === 'none' || unlockedTrainerAccessories(trainer).includes(selection);
}

/** Awards stay earned when cards are removed, traded, or an addition is undone. */
export function awardTrainerAccessories(trainer: Trainer): Trainer {
  const unlocked = unlockedTrainerAccessories(trainer);
  const saved = trainer.unlockedAccessories;
  const hadValidLedger = Array.isArray(saved) && (saved.length === 0 || saved.some(id => unlocked.includes(id)));
  let next = trainer;
  if (unlocked.length || hadValidLedger) next = { ...trainer, unlockedAccessories: unlocked };
  else if (saved !== undefined) {
    const { unlockedAccessories: discarded, ...rest } = trainer;
    next = rest;
  }
  // A missing field keeps legacy appearance objects unchanged. Unknown or
  // unearned cosmetics fall back to none without blocking the collection.
  const selected = next.appearance.accessory;
  if (selected !== undefined && selected !== 'none' && !unlocked.includes(selected)) {
    next = { ...next, appearance: { ...next.appearance, accessory: 'none' } };
  }
  return next;
}
