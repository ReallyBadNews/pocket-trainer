import { requireOptionalNativeModule } from 'expo';
import type { Language } from './model';
import type { ScanLanguage } from './language-detect';
import { recognitionWords, rerankByArtwork, cardImage, needsScanRefinement, type ScanText, type ScanCandidate } from './catalog';
import type { Crop, ScanResult } from './scan-types';
import type { CameraOptics } from './live-capture';
const module = requireOptionalNativeModule<{ backCameraOptics(): Partial<CameraOptics>; recognize(uri: string, language: string, words: string[], crop: number[]): Promise<ScanResult>; refine(uri: string, language: string, words: string[]): Promise<ScanText>; compare(uri: string, urls: string[]): Promise<number[]> }>('CardScanner');
export const canRecognize = !!module;
/** Read once the camera is running, so the lens reports the format it is actually using. */
export function backCameraOptics(): CameraOptics | null {
  try {
    const optics = module?.backCameraOptics();
    return optics?.minimumFocusDistance !== undefined ? optics as CameraOptics : null;
  } catch { return null; }
}
export async function recognizeCard(uri: string, language: ScanLanguage, crop?: Crop): Promise<ScanResult> {
  if (!module) throw new Error('Automatic matching is available in the installed iPhone/iPad app. You can still find this card by name or number.');
  // Auto-detect reads without a vocabulary; the follow-up pass uses the detected language's names.
  return module.recognize(uri, language, language === 'auto' ? [] : recognitionWords(language), crop ?? []);
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
