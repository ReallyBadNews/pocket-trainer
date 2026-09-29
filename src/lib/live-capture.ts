import { needsScanRefinement, normalize, type ScanCandidate } from './catalog';
import type { Crop, ScanResult } from './scan-types';

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

type Box = { x: number; y: number; width: number; height: number };
/**
 * The preview fills the screen, so it shows only the middle of the captured photo. Map the on-screen
 * guide back to the part of the photo it covered, as a normalized crop.
 */
export function guideRegion(guide: Box, view: { width: number; height: number }, photo: { width: number; height: number }): Crop {
  const scale = Math.max(view.width / photo.width, view.height / photo.height);
  const shownWidth = photo.width * scale, shownHeight = photo.height * scale;
  const left = (guide.x + (shownWidth - view.width) / 2) / shownWidth;
  const top = (guide.y + (shownHeight - view.height) / 2) / shownHeight;
  const x = Math.min(1, Math.max(0, left)), y = Math.min(1, Math.max(0, top));
  return [x, y, Math.min(1 - x, guide.width / shownWidth), Math.min(1 - y, guide.height / shownHeight)];
}

export function liveHint(scan: Pick<ScanResult, 'text' | 'autoCropped'>, matches: ScanCandidate[]): LiveHint {
  const text = normalize(scan.text);
  if (text.length < 12) return 'looking';
  if (!scan.autoCropped) return 'closer';
  // A card was found and text was read, but the name or number is still unclear.
  return matches.length ? 'steady' : 'glare';
}
