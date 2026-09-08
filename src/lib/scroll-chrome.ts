/** Ignore overscroll and offset corrections caused by a growing viewport. */
export function scrollChromeStep(
  progress: number,
  previousOffset: number,
  offset: number,
  contentHeight: number,
  viewportHeight: number,
  fullViewportHeight: number,
  collapseDistance: number,
) {
  'worklet';
  const maxOffset = Math.max(0, contentHeight - viewportHeight);
  const nextOffset = Math.max(0, Math.min(offset, maxOffset));
  // A page must still scroll when fully expanded, so the controls can be recovered.
  if (contentHeight <= fullViewportHeight + 1 || nextOffset === 0) {
    return { offset: nextOffset, progress: 0 };
  }
  const delta = nextOffset - Math.max(0, Math.min(previousOffset, maxOffset));
  return {
    offset: nextOffset,
    progress: Math.max(0, Math.min(1, nextOffset / Math.max(1, collapseDistance), progress + delta / Math.max(1, collapseDistance))),
  };
}

export function scrollChromeSnap(progress: number, offset = Infinity, collapseDistance = 0) {
  'worklet';
  // Near the top, hiding past the leading spacer would leave a gap below the header.
  return offset < collapseDistance || progress < 0.5 ? 0 : 1;
}
