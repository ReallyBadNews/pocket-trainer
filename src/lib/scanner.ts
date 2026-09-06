import { requireOptionalNativeModule } from 'expo';
import type { Language } from './model';
import { recognitionWords, rerankByArtwork, cardImage, needsScanRefinement, type ScanText, type ScanCandidate } from './catalog';
import type { Crop, ScanResult } from './scan-types';
const module = requireOptionalNativeModule<{ recognize(uri: string, language: string, words: string[], crop: number[]): Promise<ScanResult>; refine(uri: string, language: string, words: string[]): Promise<ScanText>; compare(uri: string, urls: string[]): Promise<number[]> }>('CardScanner');
export const canRecognize = !!module;
export async function recognizeCard(uri: string, language: Language, crop?: Crop): Promise<ScanResult> {
  if (!module) throw new Error('Automatic matching is available in the installed iPhone/iPad app. You can still find this card by name or number.');
  return module.recognize(uri, language, recognitionWords(language), crop ?? []);
}

export async function compareCardArtwork(uri: string, candidates: ScanCandidate[]): Promise<ScanCandidate[]> {
  if (!module || candidates.length < 2 || !needsScanRefinement(candidates)) return candidates;
  const shortlist = candidates.filter(c => cardImage(c.card) && c.score >= candidates[0].score - 40).slice(0, 6);
  if (shortlist.length < 2) return candidates;
  try {
    const distances = await module.compare(uri, shortlist.map(c => cardImage(c.card)!.replace('/low.webp', '/low.png')));
    return rerankByArtwork(candidates, new Map(shortlist.map((c, i) => [c.card.id, distances[i] ?? -1])));
  } catch { return candidates; }
}

export async function refineCard(uri: string, language: Language): Promise<ScanText> {
  if (!module) throw new Error('Detailed reading is available in the installed app.');
  return module.refine(uri, language, recognitionWords(language));
}
