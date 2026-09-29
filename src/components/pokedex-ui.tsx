import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle, type TextProps } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { cardImage } from '@/lib/catalog';
import { TYPE_COLORS, typeLabel, typeTextColor, type PokemonType } from '@/lib/species-details';
import type { Card, CardBrief } from '@/lib/model';

export const C = { red: '#C93240', redDark: '#8D2431', redLight: '#E95661', screen: '#EDF3DD', paper: '#FAFCF7', ink: '#25382F', muted: '#607266', line: '#D2DDC8', blue: '#57C7E8', gold: '#EAC55A' };
export const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });
export type IconName = 'dex' | 'binder' | 'scan' | 'badge' | 'user' | 'search' | 'plus' | 'minus' | 'close' | 'back' | 'heart' | 'check' | 'download' | 'upload' | 'camera' | 'photo' | 'arrow' | 'lock' | 'tools' | 'bolt' | 'speaker' | 'note' | 'stop' | 'grid' | 'star';
// A light tick makes small toggles feel physical, like pressing a real Pokédex button.
export const tick = () => { Haptics.selectionAsync().catch(() => {}); };
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
    arrow: 'M5 12h14 M13 6l6 6-6 6', tools: 'M4 7h9 M17 7h3 M15 5v4 M4 17h3 M11 17h9 M9 15v4', bolt: 'M13 2L4 14h7l-1 8 9-12h-7z', speaker: 'M4 9h4l5-4v14l-5-4H4z M16 9a4 4 0 010 6 M18.5 6.5a8 8 0 010 11', note: 'M9 18V5l11-2v13 M9 18a3 3 0 11-6 0 3 3 0 016 0z M20 16a3 3 0 11-6 0 3 3 0 016 0z', stop: 'M7 7h10v10H7z', grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z', lock: 'M7 10V7a5 5 0 0110 0v3 M5 10h14v11H5z',
    star: 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z',
  };
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d={paths[name]} stroke={color} fill={filled && (name === 'heart' || name === 'star') ? color : 'none'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
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
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { tick(); onPress(); }} style={({ pressed }) => [ui.iconButton, pressed && { opacity: .5 }]}><Icon name={icon} color={color} filled={filled} /></Pressable>;
}
export function SearchBox({ value, onChange, placeholder = 'Search Pokémon…' }: { value: string; onChange: (text: string) => void; placeholder?: string }) {
  return <View style={ui.search}><Icon name="search" size={19} color={C.muted} /><TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.muted} autoCorrect={false} returnKeyType="search" style={ui.input} />{value ? <IconButton icon="close" label="Clear search" onPress={() => onChange('')} /> : null}</View>;
}
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { tick(); onPress(); }} style={[ui.chip, selected && ui.chipSelected]}><Txt style={{ color: selected ? C.paper : C.muted, fontWeight: '700', fontSize: 13 }}>{label}</Txt></Pressable>;
}
// Read-only pills sit inside a labeled row; pass onPress for a 44pt filter chip with its own label.
export function TypePill({ type, count, selected = false, onPress }: { type: PokemonType; count?: number; selected?: boolean; onPress?: () => void }) {
  const color = typeTextColor(type), label = typeLabel(type);
  const content = <><Txt style={{ color, fontWeight: '800', fontSize: 13, lineHeight: 18 }}>{label}</Txt>{count !== undefined && <Txt style={{ color, fontFamily: mono, fontWeight: '700', fontSize: 12, lineHeight: 18 }}>{count}</Txt>}{selected && <Icon name="check" size={15} color={color} />}</>;
  if (!onPress) return <View style={[ui.typePill, { backgroundColor: TYPE_COLORS[type] }]}>{content}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}${count !== undefined ? `, ${count} discovered` : ''}. ${selected ? `Showing only ${label} Pokémon. Tap to show all` : `Show ${label} Pokémon`}`} accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [ui.typePill, ui.typeChip, { backgroundColor: TYPE_COLORS[type] }, selected && { borderColor: C.ink }, pressed && { opacity: .75 }]}>{content}</Pressable>;
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
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28, paddingHorizontal: 12, borderRadius: 14 },
  typeChip: { minHeight: 44, borderRadius: 22, borderWidth: 3, borderColor: 'transparent' },
  cardArt: { aspectRatio: 0.716, overflow: 'hidden', borderRadius: 8, backgroundColor: '#E0E7D8' },
  artFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 10, gap: 6 },
  progress: { height: 7, borderRadius: 4, overflow: 'hidden', backgroundColor: '#D4DEC7' },
  error: { padding: 14, backgroundColor: '#FBE8E8', borderRadius: 12, marginVertical: 6 },
});
