import { needsScanRefinement, scanCandidates, type ScanCandidate, type ScanText } from './catalog';
import type { Crop, ScanResult } from './scan-types';
import type { Language } from './model';
import type { CardFilter } from './card-kind';
export type ScanStage = 'refining' | 'comparing' | 'done';
type Engine = {
  recognize(uri: string, language: Language, crop?: Crop): Promise<ScanResult>;
  refine(uri: string, language: Language): Promise<ScanText>;
  compare(uri: string, candidates: ScanCandidate[]): Promise<ScanCandidate[]>;
};
/** Publish usable text matches before optional work. A new scan can cancel stale publications. */
export async function identifyProgressively(engine: Engine, input: { uri: string; language: Language; crop?: Crop; filter: CardFilter },
  publish: (scan: ScanResult, matches: ScanCandidate[], stage: ScanStage) => void, isCurrent: () => boolean) {
  let scan = await engine.recognize(input.uri, input.language, input.crop);
  if (!isCurrent()) return;
  let matches = scanCandidates(scan, input.language, 12, input.filter);
  const refine = needsScanRefinement(matches);
  publish(scan, matches, refine ? 'refining' : 'done');
  if (!refine || !isCurrent()) return;
  try {
    const extra = await engine.refine(scan.photoUri, input.language);
    if (!isCurrent()) return;
    scan = { ...scan, text: `${scan.text}\n${extra.text}`, topText: `${scan.topText}\n${extra.topText}`, bottomText: `${scan.bottomText}\n${extra.bottomText}` };
    matches = scanCandidates(scan, input.language, 12, input.filter);
  } catch { /* Initial matches remain useful if the optional pass fails. */ }
  if (!isCurrent()) return;
  const compare = needsScanRefinement(matches) && matches.length > 1;
  publish(scan, matches, compare ? 'comparing' : 'done');
  if (!compare || !isCurrent()) return;
  try { matches = await engine.compare(scan.photoUri, matches); } catch { /* Keep text matches offline. */ }
  if (isCurrent()) publish(scan, matches, 'done');
}
