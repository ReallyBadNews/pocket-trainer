import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle, type TextProps } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { cardImage } from '@/lib/catalog';
import type { Card, CardBrief } from '@/lib/model';

export const C = { red: '#C93240', redDark: '#8D2431', redLight: '#E95661', screen: '#EDF3DD', paper: '#FAFCF7', ink: '#25382F', muted: '#607266', line: '#D2DDC8', blue: '#57C7E8', gold: '#EAC55A' };
export const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });
export type IconName = 'dex' | 'binder' | 'scan' | 'badge' | 'user' | 'search' | 'plus' | 'minus' | 'close' | 'back' | 'heart' | 'check' | 'download' | 'upload' | 'camera' | 'photo' | 'arrow' | 'lock';
export function Icon({ name, size = 24, color = C.ink, filled = false }: { name: IconName; size?: number; color?: string; filled?: boolean }) {
  const paths: Partial<Record<IconName, string>> = {
    dex: 'M5 3h14v18H5z M8 8h8v7H8z M8 18h3', binder: 'M5 3h14v18H5z M9 3v18 M3 7h4 M3 12h4 M3 17h4',
    scan: 'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5 M7 12h10',
    badge: 'M12 2l3 3 4 1 1 4 2 2-2 3-1 4-4 1-3 2-3-2-4-1-1-4-2-3 2-2 1-4 4-1z M8 12l3 3 5-6',
    user: 'M4 21v-2a8 8 0 0116 0v2 M8 7a4 4 0 108 0 4 4 0 00-8 0', search: 'M21 21l-5-5 M18 10a8 8 0 11-16 0 8 8 0 0116 0',
    plus: 'M12 5v14 M5 12h14', minus: 'M5 12h14', close: 'M6 6l12 12 M18 6L6 18', back: 'M15 5l-7 7 7 7',
    heart: 'M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 00-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 000-7.8z',
    check: 'M5 12l4 4L20 5', download: 'M12 3v12 M7 10l5 5 5-5 M3 16v5h18v-5', upload: 'M12 16V4 M7 9l5-5 5 5 M3 16v5h18v-5',
    camera: 'M3 6h4l2-3h6l2 3h4v15H3z M8 13a4 4 0 108 0 4 4 0 00-8 0', photo: 'M3 3h18v18H3z M3 17l6-6 5 5 3-3 4 4',
    arrow: 'M5 12h14 M13 6l6 6-6 6', lock: 'M7 10V7a5 5 0 0110 0v3 M5 10h14v11H5z',
  };
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d={paths[name]} stroke={color} fill={filled && name === 'heart' ? color : 'none'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
export function Txt({ children, style, muted = false, ...props }: TextProps & { muted?: boolean }) {
  return <Text {...props} style={[ui.text, muted && { color: C.muted }, style]}>{children}</Text>;
}
export function Button({ title, onPress, icon, secondary = false, disabled = false, busy = false, style }: { title: string; onPress: () => void; icon?: IconName; secondary?: boolean; disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle> }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: disabled || busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [ui.button, secondary && ui.secondary, style, (disabled || busy) && { opacity: .5 }, pressed && { opacity: .75, transform: [{ translateY: 1 }] }]}>
    {busy ? <ActivityIndicator color={secondary ? C.ink : 'white'} /> : icon && <Icon name={icon} color={secondary ? C.ink : 'white'} size={20} />}
    <Txt style={{ color: secondary ? C.ink : 'white', fontWeight: '800', fontSize: 15 }}>{title}</Txt>
  </Pressable>;
}
export function IconButton({ icon, label, onPress, color = C.ink, filled = false }: { icon: IconName; label: string; onPress: () => void; color?: string; filled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [ui.iconButton, pressed && { opacity: .5 }]}><Icon name={icon} color={color} filled={filled} /></Pressable>;
}
export function SearchBox({ value, onChange, placeholder = 'Search Pokémon…' }: { value: string; onChange: (text: string) => void; placeholder?: string }) {
  return <View style={ui.search}><Icon name="search" size={19} color={C.muted} /><TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.muted} autoCorrect={false} returnKeyType="search" style={ui.input} />{value ? <IconButton icon="close" label="Clear search" onPress={() => onChange('')} /> : null}</View>;
}
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[ui.chip, selected && ui.chipSelected]}><Txt style={{ color: selected ? C.paper : C.muted, fontWeight: '700', fontSize: 13 }}>{label}</Txt></Pressable>;
}
export function CardArt({ card, style, high = false }: { card: CardBrief | Card; style?: StyleProp<ViewStyle>; high?: boolean }) {
  const local = 'localImage' in card ? card.localImage : undefined;
  const base = cardImage(card, high)?.replace(/\/(?:low|high)\.webp$/, '');
  const sources = [...new Set([...(high ? [cardImage(card, true), local] : [local, cardImage(card)]), base ? `${base}/${high ? 'low' : 'high'}.webp` : undefined, base ? `${base}/high.png` : undefined].filter((uri): uri is string => !!uri))];
  return <CardArtImage key={`${card.language}:${card.id}:${sources.join('|')}`} name={card.name} sources={sources} style={style} />;
}
function CardArtImage({ name, sources, style }: { name: string; sources: string[]; style?: StyleProp<ViewStyle> }) {
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(65);
  const uri = sources[attempt];
  return <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={[ui.cardArt, style]}>{uri
    ? <Image key={uri} accessibilityLabel={`${name} card`} source={uri} style={{ width: '100%', height: '100%' }} contentFit="contain" cachePolicy="memory-disk" onError={() => setAttempt(current => current + 1)} />
    : <View accessibilityLabel={`Artwork unavailable for ${name}`} style={[ui.artFallback, { padding: width < 90 ? 4 : 10, gap: 3 }]}><Icon name="binder" size={width < 90 ? 22 : 30} color={C.muted} />{width >= 90 && <Txt numberOfLines={2} style={{ textAlign: 'center', fontSize: 12, lineHeight: 16 }}>{name}</Txt>}<Txt muted numberOfLines={2} style={{ fontSize: width < 90 ? 9 : 11, lineHeight: 13, textAlign: 'center' }}>No artwork</Txt></View>}</View>;
}
export function Progress({ value, total, color = C.ink }: { value: number; total: number; color?: string }) {
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: value }} style={ui.progress}><View style={{ height: '100%', width: `${Math.min(100, value / Math.max(1, total) * 100)}%`, backgroundColor: color, borderRadius: 4 }} /></View>;
}
export function ErrorNotice({ text }: { text: string | null }) {
  return text ? <View accessibilityRole="alert" style={ui.error}><Txt style={{ color: C.redDark, fontSize: 14 }}>{text}</Txt></View> : null;
}
export const ui = StyleSheet.create({
  text: { color: C.ink, fontSize: 15, lineHeight: 22, fontFamily: Platform.OS === 'ios' ? 'System' : undefined },
  title: { fontSize: 29, lineHeight: 35, fontWeight: '900', letterSpacing: -.8 },
  subtitle: { fontSize: 19, lineHeight: 25, fontWeight: '800', letterSpacing: -.3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  button: { minHeight: 50, borderRadius: 14, backgroundColor: C.red, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderBottomWidth: 3, borderBottomColor: C.redDark },
  secondary: { backgroundColor: '#E3EAD9', borderBottomColor: '#C7D2BB' },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', paddingLeft: 15, paddingRight: 4, minHeight: 48, backgroundColor: '#FFFFFFA8', borderWidth: 1, borderColor: C.line, borderRadius: 12, gap: 10 },
  input: { flex: 1, minWidth: 0, minHeight: 48, color: C.ink, fontSize: 15 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 15, borderRadius: 22, borderWidth: 1, borderColor: C.line },
  chipSelected: { backgroundColor: C.ink, borderColor: C.ink },
  cardArt: { aspectRatio: 0.716, overflow: 'hidden', borderRadius: 8, backgroundColor: '#E0E7D8' },
  artFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 10, gap: 6 },
  progress: { height: 7, borderRadius: 4, overflow: 'hidden', backgroundColor: '#D4DEC7' },
  error: { padding: 14, backgroundColor: '#FBE8E8', borderRadius: 12, marginVertical: 6 },
});
