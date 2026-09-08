import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { View } from 'react-native';
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

function HairBack({ appearance, color }: { appearance: TrainerAppearance; color: string }) {
  if (appearance.hairStyle === 'bob') return <Path d="M32 48c0-25 12-36 29-36s29 12 29 37v30H31z" fill={color} />;
  if (appearance.hairStyle === 'ponytail') return <><Circle cx="91" cy="52" r="17" fill={color} /><Path d="M82 43c10 7 15 18 13 34-5-9-12-15-21-18z" fill={color} /></>;
  return null;
}

function HairFront({ appearance, color }: { appearance: TrainerAppearance; color: string }) {
  if (appearance.hairStyle === 'spiky') return <Path d="M33 43l5-22 8 7 7-17 8 14 12-17 2 18 15-7-6 27-8-11-8 7-9-12-9 11-8-7z" fill={color} />;
  if (appearance.hairStyle === 'bob') return <Path d="M34 45c1-21 11-31 27-31 15 0 25 10 28 29l-13-8-8 8-10-11-8 10-9-5z" fill={color} />;
  if (appearance.hairStyle === 'ponytail') return <Path d="M34 43c2-20 12-29 28-29 14 0 24 8 27 26-11 1-19-3-27-12-7 10-16 15-28 15z" fill={color} />;
  return <Path d="M34 43c2-20 12-29 28-29 14 0 24 9 27 27l-12-7-7 8-10-11-8 9-9-5z" fill={color} />;
}

export function TrainerAvatar({ appearance, size = 48 }: { appearance: TrainerAppearance; size?: number }) {
  const skin = TRAINER_SKIN_COLORS[appearance.skinTone];
  const hair = TRAINER_HAIR_COLOR_VALUES[appearance.hairColor];
  const outfit = TRAINER_OUTFIT_COLORS[appearance.outfit];
  return <View style={{ width: size, height: size }}><Svg width={size} height={size} viewBox="0 0 120 120">
    <Circle cx="60" cy="60" r="58" fill="#DCE8D2" stroke={outfit} strokeWidth="4" />
    <G>
      <HairBack appearance={appearance} color={hair} />
      <Path d="M12 120c3-28 20-41 48-41s45 13 48 41z" fill={outfit} />
      <Path d="M35 87l14-8h22l14 8-12 33H47z" fill="#F8F5E8" />
      <Path d="M35 86l15 10-5 24H12c3-20 10-29 23-34zM85 86L70 96l5 24h33c-3-20-10-29-23-34z" fill={outfit} />
      <Rect x="50" y="71" width="20" height="22" rx="9" fill={skin} />
      <Circle cx="34" cy="54" r="7" fill={skin} />
      <Circle cx="86" cy="54" r="7" fill={skin} />
      <Ellipse cx="60" cy="53" rx="27" ry="32" fill={skin} />
      <HairFront appearance={appearance} color={hair} />
      <Path d="M44 51c3-2 7-2 10 0M66 51c3-2 7-2 10 0" fill="none" stroke={hair} strokeWidth="2.4" strokeLinecap="round" />
      <Ellipse cx="49" cy="57" rx="2.4" ry="3" fill="#26362F" />
      <Ellipse cx="71" cy="57" rx="2.4" ry="3" fill="#26362F" />
      <Path d="M57 65c2 1 4 1 6 0M51 72c6 5 13 5 19 0" fill="none" stroke="#7E4039" strokeWidth="2" strokeLinecap="round" />
      <Path d="M60 95v25" stroke="#CDD5C6" strokeWidth="2" />
      <Circle cx="82" cy="100" r="7" fill="#F8F5E8" stroke="#26362F" strokeWidth="2" />
      <Path d="M75 100h14" stroke="#26362F" strokeWidth="2" />
      {appearance.headwear === 'cap' && <>
        <Path d="M31 31c4-19 16-28 31-28 18 0 29 11 31 30-21 5-42 5-62-2z" fill={outfit} stroke="#26362F" strokeWidth="2" />
        <Path d="M56 5c9-1 19 4 24 10H55z" fill="#F8F5E8" opacity={0.9} />
        <Path d="M58 32c15-1 27 1 37 6-14 3-27 2-39-1z" fill="#26362F" />
      </>}
      {appearance.headwear === 'headband' && <Path d="M34 35c17 5 34 5 52 0" fill="none" stroke={outfit} strokeWidth="7" strokeLinecap="round" />}
    </G>
  </Svg></View>;
}
