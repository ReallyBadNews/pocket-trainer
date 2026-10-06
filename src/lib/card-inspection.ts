import type { Card, CardBrief, Finish } from './model';

/** Values match the GPU's four finish masks. Printing wins over rarity. */
export type CardSurface = 'paper' | 'full-foil' | 'art-foil' | 'reverse-foil';

const FULL_FOIL =
  /double|ultra|illustration|hyper|secret|rainbow|radiant|ace spec|gold|^(RR|RRR|AR|SAR|SR|UR|HR|CHR|CSR|SSR|S)$/i;

export function cardSurface(card: Pick<Card, 'rarity'>, finish: Finish): CardSurface {
  if (finish === 'reverse' || finish === 'firstEditionReverse') return 'reverse-foil';

  if (finish !== 'holo' && finish !== 'firstEditionHolo') return 'paper';

  return FULL_FOIL.test(card.rarity.trim()) ? 'full-foil' : 'art-foil';
}

export const surfaceUniform = (surface: CardSurface) =>
  ({ paper: 0, 'full-foil': 1, 'art-foil': 2, 'reverse-foil': 3 })[surface];

export type CardBack = 'international' | 'japanese-modern';

/** These are standard-back previews, not photographs of a collector's copy. */
export function cardBack(card: CardBrief & Partial<Pick<Card, 'set'>>): CardBack {
  // Only catalog eras we can identify as modern. Everything else shows the generic blue back.
  if (card.language === 'ja' && /^(SV|S[1-9]|SM|XY|BW|M[1-9]|CP[1-6])/i.test(card.id)) return 'japanese-modern';

  return 'international';
}

export type CardPose = { yaw: number; pitch: number; zoom: number };

export const DEFAULT_CARD_POSE: CardPose = { yaw: -0.12, pitch: 0.07, zoom: 1 };

export const clampCardPose = (pose: CardPose): CardPose => ({
  yaw: Number.isFinite(pose.yaw) ? pose.yaw : 0,
  pitch: Number.isFinite(pose.pitch) ? Math.max(-0.85, Math.min(0.85, pose.pitch)) : 0,
  zoom: Number.isFinite(pose.zoom) ? Math.max(1, Math.min(2.5, pose.zoom)) : 1,
});

export const isCardBackVisible = (pose: CardPose) => Math.cos(pose.yaw) < 0;

/** Flip to the other face along the shortest half-turn, retaining the zoom. */
export function flippedCardPose(pose: CardPose): CardPose {
  const face = Math.round(pose.yaw / Math.PI);
  const direction = pose.yaw < face * Math.PI ? -1 : 1;

  return { yaw: (face + direction) * Math.PI, pitch: 0, zoom: pose.zoom };
}

/** The same catalog/local fallbacks used by CardArt, in full-size order. */
export function inspectionImageSources(card: CardBrief, catalogImage?: string) {
  const base = catalogImage?.replace(/\/(?:low|high)\.webp$/, '');

  return [
    ...new Set(
      [
        catalogImage,
        card.localImage,
        base ? `${base}/low.webp` : undefined,
        base ? `${base}/high.png` : undefined,
      ].filter((uri): uri is string => !!uri),
    ),
  ];
}
