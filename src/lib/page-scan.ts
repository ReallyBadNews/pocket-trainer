import { needsScanRefinement, normalize, type ScanCandidate } from './catalog';
import type { CardBrief } from './model';
import type { Crop } from './scan-types';

export type PageLayout = { id: '9' | '4' | '12'; label: string; columns: number; rows: number };
export const PAGE_LAYOUTS: PageLayout[] = [
  { id: '9', label: '9 pockets', columns: 3, rows: 3 },
  { id: '4', label: '4 pockets', columns: 2, rows: 2 },
  { id: '12', label: '12 pockets', columns: 3, rows: 4 },
];

/** Pocket rectangles in reading order, dividing the page region (the whole photo by default) evenly. */
export function pocketCrops(layout: PageLayout, region: Crop = [0, 0, 1, 1]): Crop[] {
  const [x, y, w, h] = region;
  const crops: Crop[] = [];
  for (let row = 0; row < layout.rows; row++) for (let column = 0; column < layout.columns; column++) {
    crops.push([x + column * w / layout.columns, y + row * h / layout.rows, w / layout.columns, h / layout.rows]);
  }
  return crops;
}

export type PocketStatus = 'waiting' | 'reading' | 'match' | 'check' | 'empty' | 'unreadable';
export type Pocket = { status: PocketStatus; matches: ScanCandidate[]; choice: CardBrief | null; confirmed: boolean; skipped: boolean; photoUri?: string };
export const waitingPocket = (): Pocket => ({ status: 'waiting', matches: [], choice: null, confirmed: false, skipped: false });

/** A clear match is ready to add. Anything uncertain waits for the collector to check it. */
export function pocketStatus(text: string, matches: ScanCandidate[]): PocketStatus {
  if (matches.length) return needsScanRefinement(matches) ? 'check' : 'match';
  // Sleeves, binder rings and card backs produce a few stray characters at most.
  return normalize(text).length < 12 ? 'empty' : 'unreadable';
}

export const pocketIncluded = (pocket: Pocket) => !!pocket.choice && !pocket.skipped && (pocket.status === 'match' || pocket.confirmed);
export function pageSummary(pockets: Pocket[]) {
  return {
    ready: pockets.filter(pocketIncluded).length,
    toCheck: pockets.filter(p => !p.skipped && !pocketIncluded(p) && (p.status === 'check' || p.status === 'unreadable')).length,
    reading: pockets.filter(p => p.status === 'waiting' || p.status === 'reading').length,
  };
}
