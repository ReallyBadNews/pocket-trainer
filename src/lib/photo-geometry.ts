export function fitPhoto(width: number, height: number, aspectRatio: number) {
  // Keep an unloaded photo centered until its intrinsic dimensions are available.
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return { width: 0, height: 0 };
  const fittedWidth = Math.min(width, height * aspectRatio);
  return { width: fittedWidth, height: fittedWidth / aspectRatio };
}

export function boundPhotoOffset(value: number, fittedExtent: number, viewportExtent: number, zoom: number) {
  'worklet';
  const limit = Math.max(0, (fittedExtent * zoom - viewportExtent) / 2);
  return Math.max(-limit, Math.min(limit, value));
}
