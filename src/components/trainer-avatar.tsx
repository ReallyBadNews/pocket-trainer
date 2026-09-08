import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import {
  TRAINER_OUTFIT_COLORS,
  type TrainerAppearance,
} from '@/lib/model';

export const TRAINER_SKIN_COLORS: Record<TrainerAppearance['skinTone'], string> = {
  porcelain: '#F6D5C2',
  peach: '#E9B894',
  golden: '#C98F62',
  brown: '#98613F',
  deep: '#5F382B',
};

export const TRAINER_HAIR_COLOR_VALUES: Record<TrainerAppearance['hairColor'], string> = {
  ink: '#22262A',
  chestnut: '#5B3428',
  auburn: '#963F2C',
  gold: '#D5A642',
  blue: '#315F86',
};

export const TRAINER_APPEARANCE_LABELS = {
  skinTone: { porcelain: 'Porcelain', peach: 'Peach', golden: 'Golden', brown: 'Brown', deep: 'Deep' },
  hairStyle: { short: 'Short', spiky: 'Spiky', bob: 'Bob', ponytail: 'Ponytail' },
  hairColor: { ink: 'Ink', chestnut: 'Chestnut', auburn: 'Auburn', gold: 'Gold', blue: 'Indigo' },
  outfit: { red: 'Pokédex red', blue: 'Water blue', green: 'Field green', violet: 'Violet', gold: 'Badge gold' },
  headwear: { none: 'No headwear', cap: 'Field cap', headband: 'Headband' },
} as const;

// Metro requires literal asset paths. These aligned transparent renders were
// produced from assets/blender/trainer-avatar.blend and are composited at runtime.
const FACE_IMAGES = {
  'porcelain-short-ink': require('../../assets/crafted/trainers/trainer-face-porcelain-short-ink.webp'),
  'porcelain-short-chestnut': require('../../assets/crafted/trainers/trainer-face-porcelain-short-chestnut.webp'),
  'porcelain-short-auburn': require('../../assets/crafted/trainers/trainer-face-porcelain-short-auburn.webp'),
  'porcelain-short-gold': require('../../assets/crafted/trainers/trainer-face-porcelain-short-gold.webp'),
  'porcelain-short-blue': require('../../assets/crafted/trainers/trainer-face-porcelain-short-blue.webp'),
  'porcelain-spiky-ink': require('../../assets/crafted/trainers/trainer-face-porcelain-spiky-ink.webp'),
  'porcelain-spiky-chestnut': require('../../assets/crafted/trainers/trainer-face-porcelain-spiky-chestnut.webp'),
  'porcelain-spiky-auburn': require('../../assets/crafted/trainers/trainer-face-porcelain-spiky-auburn.webp'),
  'porcelain-spiky-gold': require('../../assets/crafted/trainers/trainer-face-porcelain-spiky-gold.webp'),
  'porcelain-spiky-blue': require('../../assets/crafted/trainers/trainer-face-porcelain-spiky-blue.webp'),
  'porcelain-bob-ink': require('../../assets/crafted/trainers/trainer-face-porcelain-bob-ink.webp'),
  'porcelain-bob-chestnut': require('../../assets/crafted/trainers/trainer-face-porcelain-bob-chestnut.webp'),
  'porcelain-bob-auburn': require('../../assets/crafted/trainers/trainer-face-porcelain-bob-auburn.webp'),
  'porcelain-bob-gold': require('../../assets/crafted/trainers/trainer-face-porcelain-bob-gold.webp'),
  'porcelain-bob-blue': require('../../assets/crafted/trainers/trainer-face-porcelain-bob-blue.webp'),
  'porcelain-ponytail-ink': require('../../assets/crafted/trainers/trainer-face-porcelain-ponytail-ink.webp'),
  'porcelain-ponytail-chestnut': require('../../assets/crafted/trainers/trainer-face-porcelain-ponytail-chestnut.webp'),
  'porcelain-ponytail-auburn': require('../../assets/crafted/trainers/trainer-face-porcelain-ponytail-auburn.webp'),
  'porcelain-ponytail-gold': require('../../assets/crafted/trainers/trainer-face-porcelain-ponytail-gold.webp'),
  'porcelain-ponytail-blue': require('../../assets/crafted/trainers/trainer-face-porcelain-ponytail-blue.webp'),
  'peach-short-ink': require('../../assets/crafted/trainers/trainer-face-peach-short-ink.webp'),
  'peach-short-chestnut': require('../../assets/crafted/trainers/trainer-face-peach-short-chestnut.webp'),
  'peach-short-auburn': require('../../assets/crafted/trainers/trainer-face-peach-short-auburn.webp'),
  'peach-short-gold': require('../../assets/crafted/trainers/trainer-face-peach-short-gold.webp'),
  'peach-short-blue': require('../../assets/crafted/trainers/trainer-face-peach-short-blue.webp'),
  'peach-spiky-ink': require('../../assets/crafted/trainers/trainer-face-peach-spiky-ink.webp'),
  'peach-spiky-chestnut': require('../../assets/crafted/trainers/trainer-face-peach-spiky-chestnut.webp'),
  'peach-spiky-auburn': require('../../assets/crafted/trainers/trainer-face-peach-spiky-auburn.webp'),
  'peach-spiky-gold': require('../../assets/crafted/trainers/trainer-face-peach-spiky-gold.webp'),
  'peach-spiky-blue': require('../../assets/crafted/trainers/trainer-face-peach-spiky-blue.webp'),
  'peach-bob-ink': require('../../assets/crafted/trainers/trainer-face-peach-bob-ink.webp'),
  'peach-bob-chestnut': require('../../assets/crafted/trainers/trainer-face-peach-bob-chestnut.webp'),
  'peach-bob-auburn': require('../../assets/crafted/trainers/trainer-face-peach-bob-auburn.webp'),
  'peach-bob-gold': require('../../assets/crafted/trainers/trainer-face-peach-bob-gold.webp'),
  'peach-bob-blue': require('../../assets/crafted/trainers/trainer-face-peach-bob-blue.webp'),
  'peach-ponytail-ink': require('../../assets/crafted/trainers/trainer-face-peach-ponytail-ink.webp'),
  'peach-ponytail-chestnut': require('../../assets/crafted/trainers/trainer-face-peach-ponytail-chestnut.webp'),
  'peach-ponytail-auburn': require('../../assets/crafted/trainers/trainer-face-peach-ponytail-auburn.webp'),
  'peach-ponytail-gold': require('../../assets/crafted/trainers/trainer-face-peach-ponytail-gold.webp'),
  'peach-ponytail-blue': require('../../assets/crafted/trainers/trainer-face-peach-ponytail-blue.webp'),
  'golden-short-ink': require('../../assets/crafted/trainers/trainer-face-golden-short-ink.webp'),
  'golden-short-chestnut': require('../../assets/crafted/trainers/trainer-face-golden-short-chestnut.webp'),
  'golden-short-auburn': require('../../assets/crafted/trainers/trainer-face-golden-short-auburn.webp'),
  'golden-short-gold': require('../../assets/crafted/trainers/trainer-face-golden-short-gold.webp'),
  'golden-short-blue': require('../../assets/crafted/trainers/trainer-face-golden-short-blue.webp'),
  'golden-spiky-ink': require('../../assets/crafted/trainers/trainer-face-golden-spiky-ink.webp'),
  'golden-spiky-chestnut': require('../../assets/crafted/trainers/trainer-face-golden-spiky-chestnut.webp'),
  'golden-spiky-auburn': require('../../assets/crafted/trainers/trainer-face-golden-spiky-auburn.webp'),
  'golden-spiky-gold': require('../../assets/crafted/trainers/trainer-face-golden-spiky-gold.webp'),
  'golden-spiky-blue': require('../../assets/crafted/trainers/trainer-face-golden-spiky-blue.webp'),
  'golden-bob-ink': require('../../assets/crafted/trainers/trainer-face-golden-bob-ink.webp'),
  'golden-bob-chestnut': require('../../assets/crafted/trainers/trainer-face-golden-bob-chestnut.webp'),
  'golden-bob-auburn': require('../../assets/crafted/trainers/trainer-face-golden-bob-auburn.webp'),
  'golden-bob-gold': require('../../assets/crafted/trainers/trainer-face-golden-bob-gold.webp'),
  'golden-bob-blue': require('../../assets/crafted/trainers/trainer-face-golden-bob-blue.webp'),
  'golden-ponytail-ink': require('../../assets/crafted/trainers/trainer-face-golden-ponytail-ink.webp'),
  'golden-ponytail-chestnut': require('../../assets/crafted/trainers/trainer-face-golden-ponytail-chestnut.webp'),
  'golden-ponytail-auburn': require('../../assets/crafted/trainers/trainer-face-golden-ponytail-auburn.webp'),
  'golden-ponytail-gold': require('../../assets/crafted/trainers/trainer-face-golden-ponytail-gold.webp'),
  'golden-ponytail-blue': require('../../assets/crafted/trainers/trainer-face-golden-ponytail-blue.webp'),
  'brown-short-ink': require('../../assets/crafted/trainers/trainer-face-brown-short-ink.webp'),
  'brown-short-chestnut': require('../../assets/crafted/trainers/trainer-face-brown-short-chestnut.webp'),
  'brown-short-auburn': require('../../assets/crafted/trainers/trainer-face-brown-short-auburn.webp'),
  'brown-short-gold': require('../../assets/crafted/trainers/trainer-face-brown-short-gold.webp'),
  'brown-short-blue': require('../../assets/crafted/trainers/trainer-face-brown-short-blue.webp'),
  'brown-spiky-ink': require('../../assets/crafted/trainers/trainer-face-brown-spiky-ink.webp'),
  'brown-spiky-chestnut': require('../../assets/crafted/trainers/trainer-face-brown-spiky-chestnut.webp'),
  'brown-spiky-auburn': require('../../assets/crafted/trainers/trainer-face-brown-spiky-auburn.webp'),
  'brown-spiky-gold': require('../../assets/crafted/trainers/trainer-face-brown-spiky-gold.webp'),
  'brown-spiky-blue': require('../../assets/crafted/trainers/trainer-face-brown-spiky-blue.webp'),
  'brown-bob-ink': require('../../assets/crafted/trainers/trainer-face-brown-bob-ink.webp'),
  'brown-bob-chestnut': require('../../assets/crafted/trainers/trainer-face-brown-bob-chestnut.webp'),
  'brown-bob-auburn': require('../../assets/crafted/trainers/trainer-face-brown-bob-auburn.webp'),
  'brown-bob-gold': require('../../assets/crafted/trainers/trainer-face-brown-bob-gold.webp'),
  'brown-bob-blue': require('../../assets/crafted/trainers/trainer-face-brown-bob-blue.webp'),
  'brown-ponytail-ink': require('../../assets/crafted/trainers/trainer-face-brown-ponytail-ink.webp'),
  'brown-ponytail-chestnut': require('../../assets/crafted/trainers/trainer-face-brown-ponytail-chestnut.webp'),
  'brown-ponytail-auburn': require('../../assets/crafted/trainers/trainer-face-brown-ponytail-auburn.webp'),
  'brown-ponytail-gold': require('../../assets/crafted/trainers/trainer-face-brown-ponytail-gold.webp'),
  'brown-ponytail-blue': require('../../assets/crafted/trainers/trainer-face-brown-ponytail-blue.webp'),
  'deep-short-ink': require('../../assets/crafted/trainers/trainer-face-deep-short-ink.webp'),
  'deep-short-chestnut': require('../../assets/crafted/trainers/trainer-face-deep-short-chestnut.webp'),
  'deep-short-auburn': require('../../assets/crafted/trainers/trainer-face-deep-short-auburn.webp'),
  'deep-short-gold': require('../../assets/crafted/trainers/trainer-face-deep-short-gold.webp'),
  'deep-short-blue': require('../../assets/crafted/trainers/trainer-face-deep-short-blue.webp'),
  'deep-spiky-ink': require('../../assets/crafted/trainers/trainer-face-deep-spiky-ink.webp'),
  'deep-spiky-chestnut': require('../../assets/crafted/trainers/trainer-face-deep-spiky-chestnut.webp'),
  'deep-spiky-auburn': require('../../assets/crafted/trainers/trainer-face-deep-spiky-auburn.webp'),
  'deep-spiky-gold': require('../../assets/crafted/trainers/trainer-face-deep-spiky-gold.webp'),
  'deep-spiky-blue': require('../../assets/crafted/trainers/trainer-face-deep-spiky-blue.webp'),
  'deep-bob-ink': require('../../assets/crafted/trainers/trainer-face-deep-bob-ink.webp'),
  'deep-bob-chestnut': require('../../assets/crafted/trainers/trainer-face-deep-bob-chestnut.webp'),
  'deep-bob-auburn': require('../../assets/crafted/trainers/trainer-face-deep-bob-auburn.webp'),
  'deep-bob-gold': require('../../assets/crafted/trainers/trainer-face-deep-bob-gold.webp'),
  'deep-bob-blue': require('../../assets/crafted/trainers/trainer-face-deep-bob-blue.webp'),
  'deep-ponytail-ink': require('../../assets/crafted/trainers/trainer-face-deep-ponytail-ink.webp'),
  'deep-ponytail-chestnut': require('../../assets/crafted/trainers/trainer-face-deep-ponytail-chestnut.webp'),
  'deep-ponytail-auburn': require('../../assets/crafted/trainers/trainer-face-deep-ponytail-auburn.webp'),
  'deep-ponytail-gold': require('../../assets/crafted/trainers/trainer-face-deep-ponytail-gold.webp'),
  'deep-ponytail-blue': require('../../assets/crafted/trainers/trainer-face-deep-ponytail-blue.webp'),
} as const;

const OUTFIT_IMAGES = {
  red: require('../../assets/crafted/trainers/trainer-outfit-red.webp'),
  blue: require('../../assets/crafted/trainers/trainer-outfit-blue.webp'),
  green: require('../../assets/crafted/trainers/trainer-outfit-green.webp'),
  violet: require('../../assets/crafted/trainers/trainer-outfit-violet.webp'),
  gold: require('../../assets/crafted/trainers/trainer-outfit-gold.webp'),
} as const;

const HEADWEAR_IMAGES = {
  'cap-red': require('../../assets/crafted/trainers/trainer-headwear-cap-red.webp'),
  'cap-blue': require('../../assets/crafted/trainers/trainer-headwear-cap-blue.webp'),
  'cap-green': require('../../assets/crafted/trainers/trainer-headwear-cap-green.webp'),
  'cap-violet': require('../../assets/crafted/trainers/trainer-headwear-cap-violet.webp'),
  'cap-gold': require('../../assets/crafted/trainers/trainer-headwear-cap-gold.webp'),
  'headband-red': require('../../assets/crafted/trainers/trainer-headwear-headband-red.webp'),
  'headband-blue': require('../../assets/crafted/trainers/trainer-headwear-headband-blue.webp'),
  'headband-green': require('../../assets/crafted/trainers/trainer-headwear-headband-green.webp'),
  'headband-violet': require('../../assets/crafted/trainers/trainer-headwear-headband-violet.webp'),
  'headband-gold': require('../../assets/crafted/trainers/trainer-headwear-headband-gold.webp'),
} as const;

export function TrainerAvatar({ appearance, size = 48 }: { appearance: TrainerAppearance; size?: number }) {
  const faceKey = `${appearance.skinTone}-${appearance.hairStyle}-${appearance.hairColor}` as keyof typeof FACE_IMAGES;
  const headwearKey = appearance.headwear === 'none'
    ? null
    : `${appearance.headwear}-${appearance.outfit}` as keyof typeof HEADWEAR_IMAGES;
  const layerStyle = [StyleSheet.absoluteFill, { width: size, height: size }];

  return <View style={[s.avatar, {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: Math.max(2, size * .025),
    borderColor: TRAINER_OUTFIT_COLORS[appearance.outfit],
  }]}>
    <Image source={OUTFIT_IMAGES[appearance.outfit]} style={layerStyle} contentFit="contain" cachePolicy="memory-disk" />
    <Image source={FACE_IMAGES[faceKey]} style={layerStyle} contentFit="contain" cachePolicy="memory-disk" />
    {headwearKey && <Image source={HEADWEAR_IMAGES[headwearKey]} style={layerStyle} contentFit="contain" cachePolicy="memory-disk" />}
  </View>;
}

const s = StyleSheet.create({
  avatar: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#DCE8D2',
  },
});
