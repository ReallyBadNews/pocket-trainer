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

/** What the back camera reports about its lens: focus limit in millimetres and its wide-side view angle. */
export type CameraOptics = { minimumFocusDistance: number; fieldOfView: number; aspect: number; maxZoom: number };
export const CARD_WIDTH_MM = 63;
/** Binder pockets are a little wider than the card they hold. */
export const POCKET_WIDTH_MM = 66;
const FOCUS_MARGIN = 1.15;
const MAX_FOCUS_ZOOM = 3;

/**
 * Many iPhones cannot focus closer than about 20 cm, but a card fills the guide from about 9 cm away.
 * Zoom in just enough that the subject fills `fill` of the preview's width while the phone is still
 * far enough back to focus. Returns expo-camera's 0–1 zoom, which is exponential in the zoom factor.
 */
export function closeFocusZoom(optics: CameraOptics, subjectMm: number, fill: number) {
  const { minimumFocusDistance, fieldOfView, aspect, maxZoom } = optics;
  if (!(minimumFocusDistance > 0 && fieldOfView > 0 && aspect > 0 && maxZoom > 1 && fill > 0)) return 0;
  // The portrait preview's width is the photo's short side.
  const halfWidth = Math.tan(fieldOfView * Math.PI / 360) * aspect;
  const distance = subjectMm / (2 * fill * halfWidth);
  const factor = Math.min(MAX_FOCUS_ZOOM, maxZoom, minimumFocusDistance * FOCUS_MARGIN / distance);
  return factor > 1 ? Math.log(factor) / Math.log(maxZoom) : 0;
}

export function liveHint(scan: Pick<ScanResult, 'text' | 'autoCropped'>, matches: ScanCandidate[]): LiveHint {
  const text = normalize(scan.text);
  if (text.length < 12) return 'looking';
  if (!scan.autoCropped) return 'closer';
  // A card was found and text was read, but the name or number is still unclear.
  return matches.length ? 'steady' : 'glare';
}
