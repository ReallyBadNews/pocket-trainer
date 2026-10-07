import { BADGES, type Badge } from './badges';
import { LANGUAGES, type Language } from './languages';
import { badgeProgress, type Trainer } from './model';
import type { SetProgress } from './set-progress';

/** Anything that isn't a known id, including a missing or repeated route param, gets the not-found page. */
export const findBadge = (id: string | undefined): Badge | undefined => BADGES.find((badge) => badge.id === id);

export type BadgeStatus = { progress: number; earned: boolean; closest?: SetProgress };

/** `sets` is setProgress with the bundled catalog, so it is already sorted closest-to-finished first. */
export function badgeStatus(
  trainer: Trainer,
  badge: Badge,
  discovered: Set<number>,
  sets: readonly SetProgress[],
): BadgeStatus {
  const progress = badgeProgress(trainer, badge, discovered, sets.filter((set) => set.complete).length);
  const earned = progress >= badge.target;

  // One finished set earns Set master, so until then its bar follows the set he is closest to finishing.
  return { progress, earned, closest: badge.kind === 'sets' && !earned ? sets[0] : undefined };
}

/** Ids of the badges earned right now, judged exactly as the Badges tab judges them. */
export const earnedBadges = (trainer: Trainer, discovered: Set<number>, sets: readonly SetProgress[]): string[] =>
  BADGES.filter((badge) => badgeStatus(trainer, badge, discovered, sets).earned).map((badge) => badge.id);

const plural = (n: number, one: string) => (n === 1 ? one : `${one}s`);

export type BadgeMeter = { value: number; total: number; label: string; left?: string };

/** The progress bar and its words, shared by the badge list and the badge page. */
export function badgeMeter(badge: Badge, { progress, earned, closest }: BadgeStatus): BadgeMeter {
  if (badge.kind === 'sets') {
    if (earned) return { value: 1, total: 1, label: 'You finished a set!' };

    if (!closest) return { value: 0, total: 1, label: 'Add a card to start your first set' };
    const left = closest.official - closest.owned;

    return {
      value: closest.owned,
      total: closest.official,
      label: `${closest.name}: ${closest.owned} of ${closest.official}`,
      left: `${left} more ${plural(left, 'card')} to finish it`,
    };
  }

  const unit = badge.kind === 'cards' ? 'cards' : badge.kind === 'languages' ? 'languages' : 'Pokémon';
  const meter = { value: progress, total: badge.target, label: `${progress} of ${badge.target} ${unit}` };

  if (earned) return meter;
  const left = badge.target - progress;

  return {
    ...meter,
    left:
      badge.kind === 'cards'
        ? `${left} more ${plural(left, 'card')} to collect`
        : badge.kind === 'languages'
          ? `Find cards in ${left} more ${plural(left, 'language')}`
          : `${left} more Pokémon to ${badge.kind === 'species' ? 'discover' : 'find'}`,
  };
}

export type SpeciesFilter = 'all' | 'todo' | 'owned';

export type SpeciesGoal = { id: number; owned: boolean };

/** The Pokémon a species-set badge asks for, in the badge's own (evolution) order. */
export const speciesGoals = (badge: Badge, discovered: ReadonlySet<number>): SpeciesGoal[] =>
  badge.kind === 'species-set' ? badge.speciesIds.map((id) => ({ id, owned: discovered.has(id) })) : [];

export const filterGoals = (goals: readonly SpeciesGoal[], filter: SpeciesFilter) =>
  goals.filter((goal) => filter === 'all' || goal.owned === (filter === 'owned'));

export function goalCounts(goals: readonly SpeciesGoal[]): Record<SpeciesFilter, number> {
  const owned = goals.filter((goal) => goal.owned).length;

  return { all: goals.length, todo: goals.length - owned, owned };
}

/** Every language the app knows, with how many cards (counting copies) he has in it. */
export const languageCards = (trainer: Trainer): { language: Language; cards: number }[] =>
  LANGUAGES.map((language) => ({
    language,
    cards: trainer.entries.reduce((n, entry) => (entry.card.language === language ? n + entry.quantity : n), 0),
  }));

/**
 * Like the Pokédex grid, but a little denser. Each column keeps about 115pt of text-scaled width so names as long as
 * Meowscarada or Charmander stay on one line instead of breaking mid-word at larger text sizes.
 */
export function speciesColumns(contentWidth: number, fontScale: number) {
  const width = contentWidth / Math.min(fontScale, 1.4);

  return width >= 620 ? 5 : width >= 480 ? 4 : width >= 350 ? 3 : 2;
}
