import type { Language } from './model';
import type { Crop, ScanResult } from './scan-types';

export const canRecognize = false;

export const backCameraOptics = () => null;

export const warmUpRecognition = (_language: string) => {};

export async function recognizeCard(
  _uri: string,
  _language: Language,
  _crop?: Crop,
  _fromCamera?: boolean,
): Promise<ScanResult> {
  throw new Error('Automatic matching is available in the installed iPhone/iPad app. Search by name or number below.');
}

export async function compareCardArtwork(_uri: string, candidates: import('./catalog').ScanCandidate[]) {
  return candidates;
}

export async function refineCard(_uri: string, _language: Language): Promise<import('./catalog').ScanText> {
  throw new Error('Detailed reading is available in the installed app.');
}
