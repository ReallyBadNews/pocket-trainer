import { needsScanRefinement, normalize, type ScanCandidate } from './catalog';
import type { CardBrief } from './model';
import type { Crop } from './scan-types';

export type PageLayout = { id: '9' | '4' | '12'; label: string; columns: number; rows: number };

export const PAGE_LAYOUTS: PageLayout[] = [
  { id: '9', label: '9 cards', columns: 3, rows: 3 },
  { id: '4', label: '4 cards', columns: 2, rows: 2 },
  { id: '12', label: '12 cards', columns: 3, rows: 4 },
];

/** Pocket rectangles in reading order, dividing the page region (the whole photo by default) evenly. */
export function pocketCrops(layout: PageLayout, region: Crop = [0, 0, 1, 1]): Crop[] {
  const [x, y, w, h] = region;
  const crops: Crop[] = [];

  for (let row = 0; row < layout.rows; row++)
    for (let column = 0; column < layout.columns; column++) {
      crops.push([x + (column * w) / layout.columns, y + (row * h) / layout.rows, w / layout.columns, h / layout.rows]);
    }

  return crops;
}

export type PocketStatus = 'waiting' | 'reading' | 'match' | 'check' | 'empty' | 'unreadable';

export type Pocket = {
  status: PocketStatus;
  matches: ScanCandidate[];
  choice: CardBrief | null;
  confirmed: boolean;
  skipped: boolean;
  photoUri?: string;
};

export const waitingPocket = (): Pocket => ({
  status: 'waiting',
  matches: [],
  choice: null,
  confirmed: false,
  skipped: false,
});

/** A clear match is ready to add. Anything uncertain waits for the collector to check it. */
export function pocketStatus(text: string, matches: ScanCandidate[]): PocketStatus {
  if (matches.length) return needsScanRefinement(matches) ? 'check' : 'match';

  // Sleeves, binder rings and card backs produce a few stray characters at most.
  return normalize(text).length < 12 ? 'empty' : 'unreadable';
}

export const pocketIncluded = (pocket: Pocket) =>
  !!pocket.choice && !pocket.skipped && (pocket.status === 'match' || pocket.confirmed);

/** Uncertain or unread pockets wait for the collector until they're confirmed, chosen or skipped. Empty ones don't. */
export const pocketNeedsCheck = (pocket: Pocket) =>
  !pocket.skipped && !pocketIncluded(pocket) && (pocket.status === 'check' || pocket.status === 'unreadable');

export function pageSummary(pockets: Pocket[]) {
  return {
    ready: pockets.filter(pocketIncluded).length,
    toCheck: pockets.filter(pocketNeedsCheck).length,
    reading: pockets.filter((p) => p.status === 'waiting' || p.status === 'reading').length,
  };
}

/** The next other pocket still needing a check, going forward and wrapping round the page; null when none is left. */
export function nextToCheck(pockets: Pocket[], from: number): number | null {
  for (let step = 1; step < pockets.length; step++) {
    const index = (from + step) % pockets.length;

    if (pocketNeedsCheck(pockets[index])) return index;
  }

  return null;
}

export type PocketReviewState = 'reading' | 'ready' | 'check' | 'skipped' | 'empty' | 'unreadable';

/** What the pocket review tells the collector about one pocket. */
export function pocketReviewState(pocket: Pocket): PocketReviewState {
  if (pocket.status === 'waiting' || pocket.status === 'reading') return 'reading';

  if (pocket.skipped) return 'skipped';

  if (pocketIncluded(pocket)) return 'ready';

  if (pocket.choice) return 'check';

  return pocket.status === 'empty' ? 'empty' : 'unreadable';
}

/** One line of page progress, so jumping between pockets never loses track of what's left. */
export function reviewProgress(pockets: Pocket[]) {
  const { ready, toCheck, reading } = pageSummary(pockets);

  if (toCheck) return `${toCheck} left to check · ${ready} ready`;

  if (reading) return `Still reading… ${ready} ready so far`;

  return ready
    ? `All checked! ${ready} ${ready === 1 ? 'card' : 'cards'} ready to add`
    : 'All checked! No cards ready yet';
}
