import { Image } from 'expo-image';
import type { BadgeEmblem } from '@/lib/badges';

const ART = {
  medal: require('../../assets/crafted/badges/medal-front.webp'),
  starters: require('../../assets/crafted/badges/starters-front.webp'),
  eevee: require('../../assets/crafted/badges/eevee-front.webp'),
  birds: require('../../assets/crafted/badges/birds-front.webp'),
  fossil: require('../../assets/crafted/badges/fossil-front.webp'),
  dex: require('../../assets/crafted/badges/dex-front.webp'),
  binder: require('../../assets/crafted/badges/binder-front.webp'),
};

/** The same Blender object as the inspector, rendered flat for lists and fallback. */
export function BadgeArtwork({
  emblem,
  earned = true,
  size = 64,
}: {
  emblem: BadgeEmblem;
  earned?: boolean;
  size?: number;
}) {
  return (
    <Image
      source={ART[emblem]}
      style={{ width: size, height: size, opacity: earned ? 1 : 0.45 }}
      contentFit="contain"
    />
  );
}
