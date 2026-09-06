import type { ScanText } from './catalog';
export type Crop = [number, number, number, number];
export type ScanResult = ScanText & { photoUri: string; crop: Crop; autoCropped: boolean };
export const fullCrop: Crop = [0, 0, 1, 1];
export function resizeCrop(crop: Crop, corner: number, dx: number, dy: number): Crop {
  const [x, y, w, h] = crop;
  const left = corner % 2 === 0, upper = corner < 2;
  const nx = left ? Math.max(0, Math.min(x + w - .12, x + dx)) : x;
  const ny = upper ? Math.max(0, Math.min(y + h - .12, y + dy)) : y;
  const right = left ? x + w : Math.max(x + .12, Math.min(1, x + w + dx));
  const bottom = upper ? y + h : Math.max(y + .12, Math.min(1, y + h + dy));
  return [nx, ny, right - nx, bottom - ny];
}
