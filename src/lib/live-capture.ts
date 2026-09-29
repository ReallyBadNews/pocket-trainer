import { needsScanRefinement, normalize, type ScanCandidate } from './catalog';
import type { ScanResult } from './scan-types';

/** Frames are sampled about once a second; each one is read on the device and then deleted. */
export const LIVE_FRAME_GAP_MS = 350;

export type LiveHint = 'looking' | 'closer' | 'steady' | 'glare';
export const LIVE_HINTS: Record<LiveHint, string> = {
  looking: 'Put one card inside the frame',
  closer: 'Move a little closer so the card fills the frame',
  steady: 'Hold still… reading the name and number',
  glare: 'Tilt the card a little to get rid of shine',
};

/** Only a clear match is taken automatically; anything uncertain keeps the camera open. */
export const acceptLiveFrame = (matches: ScanCandidate[]) => matches.length > 0 && !needsScanRefinement(matches);

export function liveHint(scan: Pick<ScanResult, 'text' | 'autoCropped'>, matches: ScanCandidate[]): LiveHint {
  const text = normalize(scan.text);
  if (text.length < 12) return 'looking';
  if (!scan.autoCropped) return 'closer';
  // A card was found and text was read, but the name or number is still unclear.
  return matches.length ? 'steady' : 'glare';
}
