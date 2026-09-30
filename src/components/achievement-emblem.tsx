import { Image } from 'expo-image';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import type { BadgeEmblem } from '@/lib/badges';

// Drawn on a 76×84 grid and shown a little smaller so badge names get more room.
const SIZE = { width: 64, height: 71 };
const COLORS = { starters: '#4B8756', eevee: '#A56D40', birds: '#477D9E', fossil: '#927744', dex: '#B7464F', binder: '#4F6CA6' };

export function AchievementEmblem({ emblem, earned }: { emblem: BadgeEmblem; earned: boolean }) {
  if (emblem === 'medal') return <Image source={require('../../assets/crafted/badge.png')} style={{ ...SIZE, opacity: earned ? 1 : .4 }} contentFit="contain" />;
  const color = earned ? COLORS[emblem] : '#879781';
  return <Svg {...SIZE} viewBox="0 0 76 84" accessible={false}>
    <Path d="M22 55L16 81 30 75 38 82 42 57M38 57L46 82 55 75 66 79 55 53" fill={color} opacity={earned ? .85 : .3} />
    <Path d="M38 3L49 8 61 10 66 22 72 33 66 45 62 57 49 61 38 67 26 61 14 57 10 45 4 33 10 21 14 10 27 8Z" fill={earned ? '#EAC55A' : '#D6DECB'} stroke={earned ? '#A98428' : '#A9B59C'} strokeWidth={2} />
    <Circle cx={38} cy={35} r={24} fill={earned ? '#FFF9E6' : '#F0F4E8'} stroke={color} strokeWidth={2} />
    {emblem === 'starters' ? <G opacity={earned ? 1 : .6}>
      <Path d="M37 18C24 17 18 22 21 30 28 35 35 29 37 18Z" fill={earned ? '#4B8756' : color} />
      <Path d="M23 30L32 22" stroke="#F0F4E8" strokeWidth={1.5} />
      <Path d="M46 18C47 24 40 26 41 32 43 40 55 37 54 30 54 25 49 23 46 18Z" fill={earned ? '#CC6642' : color} />
      <Path d="M36 33C33 39 28 43 29 47 30 55 43 55 44 47 45 42 39 38 36 33Z" fill={earned ? '#3B83AD' : color} />
    </G> : <G stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none">
      {emblem === 'eevee' && <>
        <Path d="M25 34L22 17 34 29M42 29L54 17 51 35M25 34L30 46 38 51 47 46 51 35 43 29 33 29Z" />
        <Circle cx={32} cy={37} r={1.5} fill={color} /><Circle cx={44} cy={37} r={1.5} fill={color} />
        <Path d="M36 43L38 45 40 43" />
      </>}
      {emblem === 'birds' && <Path d="M20 24L27 40 38 48 49 40 56 24 43 31 38 22 33 31ZM27 40L24 32M49 40L52 32M38 34V48" />}
      {emblem === 'fossil' && <Path d="M49 48C29 59 18 38 26 26 35 12 55 24 51 38 48 49 32 47 31 37 30 29 40 26 44 33 47 38 39 42 37 36M27 27L32 31M23 36L31 37M28 46L34 43M38 51L39 45" />}
      {emblem === 'dex' && <><Circle cx={38} cy={35} r={17} /><Path d="M21 35H32M44 35H55" /><Circle cx={38} cy={35} r={6} /></>}
      {/* A full 9-pocket binder page. */}
      {emblem === 'binder' && [0, 1, 2].flatMap(row => [0, 1, 2].map(col => <Rect key={`${row}${col}`} x={25.5 + col * 9} y={21.5 + row * 9.5} width={7} height={8} rx={1.5} strokeWidth={1.8} fill={color} fillOpacity={earned ? .35 : .15} />))}
    </G>}
  </Svg>;
}
