import type { Trainer } from './model';

/**
 * A sidekick Pokémon stands with the trainer's portrait. Four are ready from the start; every badge earns one more.
 * Listed easiest to hardest, so the next sidekick to earn sits near the top of the picker.
 */
export const SIDEKICKS = [
  { id: 'pikachu', dexId: 25, name: 'Pikachu' },
  { id: 'bulbasaur', dexId: 1, name: 'Bulbasaur' },
  { id: 'charmander', dexId: 4, name: 'Charmander' },
  { id: 'squirtle', dexId: 7, name: 'Squirtle' },
  { id: 'pichu', dexId: 172, name: 'Pichu', badge: 'first' },
  { id: 'growlithe', dexId: 58, name: 'Growlithe', badge: 'ten' },
  { id: 'lapras', dexId: 131, name: 'Lapras', badge: 'world' },
  { id: 'lucario', dexId: 448, name: 'Lucario', badge: 'fifty' },
  { id: 'snorlax', dexId: 143, name: 'Snorlax', badge: 'hundred' },
  { id: 'mewtwo', dexId: 150, name: 'Mewtwo', badge: 'hundred-species' },
  { id: 'dragonite', dexId: 149, name: 'Dragonite', badge: 'sixhundred' },
  { id: 'gengar', dexId: 94, name: 'Gengar', badge: 'set-master' },
  { id: 'zapdos', dexId: 145, name: 'Zapdos', badge: 'legendary-birds' },
  { id: 'aerodactyl', dexId: 142, name: 'Aerodactyl', badge: 'kanto-fossils' },
  { id: 'eevee', dexId: 133, name: 'Eevee', badge: 'eevee-family' },
  { id: 'mew', dexId: 151, name: 'Mew', badge: 'kanto-complete' },
  { id: 'togepi', dexId: 175, name: 'Togepi', badge: 'first-partners' },
  { id: 'charizard', dexId: 6, name: 'Charizard', badge: 'starters-kanto' },
  { id: 'feraligatr', dexId: 160, name: 'Feraligatr', badge: 'starters-johto' },
  { id: 'sceptile', dexId: 254, name: 'Sceptile', badge: 'starters-hoenn' },
  { id: 'infernape', dexId: 392, name: 'Infernape', badge: 'starters-sinnoh' },
  { id: 'samurott', dexId: 503, name: 'Samurott', badge: 'starters-unova' },
  { id: 'greninja', dexId: 658, name: 'Greninja', badge: 'starters-kalos' },
  { id: 'decidueye', dexId: 724, name: 'Decidueye', badge: 'starters-alola' },
  { id: 'cinderace', dexId: 815, name: 'Cinderace', badge: 'starters-galar' },
  { id: 'meowscarada', dexId: 908, name: 'Meowscarada', badge: 'starters-paldea' },
  { id: 'rayquaza', dexId: 384, name: 'Rayquaza', badge: 'starter-master' },
] as const;

export type Sidekick = (typeof SIDEKICKS)[number];

export type SidekickId = Sidekick['id'];

export type SidekickSelection = 'none' | SidekickId;

export const SIDEKICK_IDS: readonly SidekickId[] = SIDEKICKS.map((sidekick) => sidekick.id);

export const findSidekick = (id: string | undefined): Sidekick | undefined =>
  SIDEKICKS.find((sidekick) => sidekick.id === id);

/** The sidekick a badge earns, if any. */
export const sidekickForBadge = (badgeId: string): Sidekick | undefined =>
  SIDEKICKS.find((sidekick) => 'badge' in sidekick && sidekick.badge === badgeId);

export const isStarterSidekick = (sidekick: Sidekick) => !('badge' in sidekick);

/**
 * Starters, the permanent ledger, and badges earned right now. Callers pass the earned badge ids so screens can use
 * the bundled catalog for set progress, as the Badges tab does.
 */
export function unlockedSidekicks(trainer: Trainer, earnedBadges: Iterable<string>): SidekickId[] {
  const saved = Array.isArray(trainer.unlockedSidekicks) ? trainer.unlockedSidekicks : [];
  const earned = new Set(earnedBadges);

  return SIDEKICKS.flatMap((sidekick) =>
    !('badge' in sidekick) || saved.includes(sidekick.id) || earned.has(sidekick.badge) ? [sidekick.id] : [],
  );
}

export function canChooseSidekick(
  trainer: Trainer,
  selection: SidekickSelection,
  earnedBadges: Iterable<string>,
): boolean {
  return selection === 'none' || unlockedSidekicks(trainer, earnedBadges).includes(selection);
}

/**
 * Badge sidekicks stay earned when cards are removed, traded, or an addition is undone. Starters are never written to
 * the ledger, so a trainer without badges keeps the field absent. An unknown or unearned choice falls back to none.
 */
export function awardSidekicks(trainer: Trainer, earnedBadges: Iterable<string>): Trainer {
  const unlocked = unlockedSidekicks(trainer, earnedBadges);

  const earned = SIDEKICKS.flatMap((sidekick) =>
    'badge' in sidekick && unlocked.includes(sidekick.id) ? [sidekick.id] : [],
  );

  let next = trainer;

  if (earned.length || trainer.unlockedSidekicks !== undefined) {
    const saved = trainer.unlockedSidekicks;
    const same = Array.isArray(saved) && saved.length === earned.length && saved.every((id, i) => id === earned[i]);

    if (!same) next = { ...trainer, unlockedSidekicks: earned };
  }

  const selected = next.appearance.sidekick;

  if (selected !== undefined && selected !== 'none' && !unlocked.includes(selected))
    next = { ...next, appearance: { ...next.appearance, sidekick: 'none' } };

  return next;
}

/** Sidekicks this change earned, in roster order, for the celebration. */
export function newSidekicks(before: Trainer, after: Trainer): Sidekick[] {
  const had = new Set(before.unlockedSidekicks ?? []);

  return SIDEKICKS.filter((sidekick) => (after.unlockedSidekicks ?? []).includes(sidekick.id) && !had.has(sidekick.id));
}
