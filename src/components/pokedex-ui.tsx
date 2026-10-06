import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Children, createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActionSheetIOS, ActivityIndicator, findNodeHandle, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type PressableStateCallbackType, type StyleProp, type ViewStyle, type TextProps, type TextStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { cardImage } from '@/lib/catalog';
import { TYPE_COLORS, typeLabel, typeTextColor, type PokemonType } from '@/lib/species-details';
import type { Card, CardBrief } from '@/lib/model';

export const C = { red: '#C93240', redDark: '#8D2431', redLight: '#E95661', screen: '#EDF3DD', paper: '#FAFCF7', ink: '#25382F', muted: '#607266', line: '#D2DDC8', blue: '#57C7E8', gold: '#EAC55A' };
export const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });
/** One spacing and corner scale for the whole app: screens pad `xl`, sections sit `lg` apart, rows use `sm`/`md`. */
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;
export const R = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
/** Text roles keep controls, card identity and supporting copy in a predictable hierarchy. */
export const typeStyles = StyleSheet.create({
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -.5 },
  subtitle: { fontSize: 18, lineHeight: 24, fontWeight: '600', letterSpacing: -.2 },
  cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18 },
  control: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  readout: { fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
});
/** Every tappable thing dims a little while held, so it feels like it heard the finger. */
export const pressFx = ({ pressed }: PressableStateCallbackType): StyleProp<ViewStyle> => pressed ? { opacity: .7 } : null;
const ButtonRowContext = createContext(false);
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
export function Txt({ children, style, variant = 'body', muted = false, maxFontSizeMultiplier = 1.4, ...props }: TextProps & { muted?: boolean; variant?: keyof typeof typeStyles }) {
  // Small text would otherwise inherit the 22pt body line height and look double spaced.
  const own = StyleSheet.flatten(style) as TextStyle | undefined;
  const leading = own?.fontSize && own.lineHeight === undefined ? { lineHeight: Math.round(own.fontSize * 1.3) } : null;
  return <Text maxFontSizeMultiplier={maxFontSizeMultiplier} {...props} style={[ui.text, typeStyles[variant], muted && { color: C.muted }, style, leading]}>{children}</Text>;
}
/** One filled action leads a task; secondary actions keep the same targets without another surface. */
export function Button({ title, onPress, icon, secondary = false, disabled = false, busy = false, selected, accessibilityHint, size = 'large', style }: { title: string; onPress: () => void; icon?: IconName; secondary?: boolean; disabled?: boolean; busy?: boolean; selected?: boolean; accessibilityHint?: string; size?: 'large' | 'medium'; style?: StyleProp<ViewStyle> }) {
  const color = secondary ? C.ink : 'white', large = size === 'large';
  const grouped = useContext(ButtonRowContext);
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={accessibilityHint} accessibilityState={{ disabled: disabled || busy, selected }} disabled={disabled || busy} onPress={() => { tick(); onPress(); }} style={({ pressed }) => [ui.button, grouped && { flexGrow: 1 }, !large && ui.buttonMedium, secondary && ui.secondary, style, (disabled || busy) && { opacity: .45 }, pressed && { opacity: .85, transform: [{ translateY: 2 }] }]}>
    {busy ? <ActivityIndicator color={color} /> : icon && <Icon name={icon} color={color} size={large ? 22 : 19} />}
    <Txt variant="control" style={{ flexShrink: 1, color, fontSize: large ? 16 : 15, textAlign: 'center' }}>{title}</Txt>
  </Pressable>;
}
/** Buttons side by side when they fit, stacked full width when they don't. */
export function ButtonRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { fontScale } = useWindowDimensions();
  return <ButtonRowContext.Provider value><View style={[ui.buttonRow, style]}>{Children.map(children, child => child ? <View style={[ui.buttonSlot, { flexBasis: 144 * Math.min(fontScale, 1.4) }]}>{child}</View> : null)}</View></ButtonRowContext.Provider>;
}
/** A quiet text action (like "Clear filters") that is still easy to hit. */
export function LinkButton({ title, onPress, color = C.ink, style }: { title: string; onPress: () => void; color?: string; style?: StyleProp<ViewStyle> }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} hitSlop={4} onPress={() => { tick(); onPress(); }} style={state => [ui.link, style, pressFx(state)]}><Txt variant="label" style={{ color }}>{title}</Txt></Pressable>;
}
/** Secondary destinations stay readable and tappable without looking like another content card. */
export function ToolbarAction({ title, icon, onPress, color = C.ink, style }: { title: string; icon?: IconName; onPress: () => void; color?: string; style?: StyleProp<ViewStyle> }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={() => { tick(); onPress(); }} style={state => [ui.toolbarAction, style, pressFx(state)]}>{icon && <Icon name={icon} size={18} color={color} />}<Txt variant="caption" style={{ color, fontWeight: '600', flexShrink: 1 }}>{title}</Txt></Pressable>;
}
/** A standard settings/navigation row, using alignment and a separator rather than nested cards. */
export function ActionRow({ title, value, detail, icon, onPress, disabled = false, destructive = false }: { title: string; value?: string; detail?: string; icon?: IconName; onPress: () => void; disabled?: boolean; destructive?: boolean }) {
  const color = destructive ? C.redDark : C.ink;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}${value ? `, ${value}` : ''}`} accessibilityHint={detail} accessibilityState={{ disabled }} disabled={disabled} onPress={() => { tick(); onPress(); }} style={state => [ui.actionRow, disabled && { opacity: .45 }, pressFx(state)]}>
    {icon && <Icon name={icon} size={20} color={color} />}<View style={{ flex: 1, minWidth: 0, gap: 2 }}><Txt style={{ color, fontWeight: '500' }}>{title}</Txt>{detail && <Txt variant="caption" muted>{detail}</Txt>}</View>{value && <Txt variant="caption" muted style={{ flexShrink: 1, maxWidth: '55%', textAlign: 'right' }}>{value}</Txt>}<View style={{ transform: [{ rotate: '180deg' }] }}><Icon name="back" size={16} color={C.muted} /></View>
  </Pressable>;
}
/** Compact choices use the native iOS picker sheet; other platforms get the same checked options. */
export function ChoiceMenu<T extends string>({ label, options, value, onChange, compact = false, triggerTitle, disabled = false, icon, style }: { label: string; options: readonly { id: T; label: string }[]; value: T; onChange: (value: T) => void; compact?: boolean; triggerTitle?: string; disabled?: boolean; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<View>(null);
  const selected = options.find(option => option.id === value);
  const choose = (index: number) => { const option = options[index]; if (option && option.id !== value) { tick(); onChange(option.id); } };
  const show = () => {
    if (disabled) return;
    tick();
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ title: label, options: [...options.map(option => `${option.label}${option.id === value ? ' ✓' : ''}`), 'Cancel'], cancelButtonIndex: options.length, tintColor: C.ink, anchor: findNodeHandle(trigger.current) ?? undefined }, choose);
    else setOpen(true);
  };
  return <>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`${label}, ${selected?.label ?? value}`} accessibilityHint="Opens choices" accessibilityState={{ disabled }} disabled={disabled} onPress={show} style={state => [compact ? ui.toolbarAction : ui.actionRow, style, disabled && { opacity: .45 }, pressFx(state)]}>
      {icon && <Icon name={icon} size={18} />}<Txt variant={compact ? 'caption' : 'body'} style={{ flex: 1, minWidth: 0, fontWeight: compact ? '600' : '500' }}>{compact ? triggerTitle ?? selected?.label : label}</Txt>{!compact && <Txt variant="caption" muted style={{ flexShrink: 1, maxWidth: '67%', textAlign: 'right' }}>{selected?.label}</Txt>}<View style={{ transform: [{ rotate: compact ? '-90deg' : '180deg' }] }}><Icon name="back" size={14} color={C.muted} /></View>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}><View style={ui.menuOverlay}><Pressable accessibilityRole="button" accessibilityLabel="Close choices" onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} /><View accessibilityViewIsModal style={ui.menuSheet}><SheetHeader title={label} onClose={() => setOpen(false)} /><ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: S.lg }}><View accessibilityRole="radiogroup" accessibilityLabel={label}>{options.map((option, index) => <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: option.id === value }} aria-checked={option.id === value} onPress={() => { setOpen(false); choose(index); }} style={state => [ui.actionRow, pressFx(state)]}><Txt style={{ flex: 1, fontWeight: option.id === value ? '600' : '400' }}>{option.label}</Txt>{option.id === value && <Icon name="check" size={18} />}</Pressable>)}</View></ScrollView></View></View></Modal>
  </>;
}
/** Two to four choices where exactly one is on, like Grid / Pages. `dark` is for the camera. */
export function Segmented<T extends string>({ options, value, onChange, dark = false, label, style }: { options: readonly { id: T; label: string; icon?: IconName }[]; value: T; onChange: (value: T) => void; dark?: boolean; label?: string; style?: StyleProp<ViewStyle> }) {
  return <View accessibilityRole="tablist" accessibilityLabel={label} style={[ui.segmented, dark && ui.segmentedDark, style]}>{options.map(option => {
    const selected = option.id === value, color = selected ? (dark ? C.ink : C.paper) : dark ? 'white' : C.ink;
    return <Pressable key={option.id} accessibilityRole="tab" accessibilityLabel={option.label} accessibilityState={{ selected }} onPress={() => { if (!selected) { tick(); onChange(option.id); } }} style={state => [ui.segment, selected && (dark ? ui.segmentSelectedDark : ui.segmentSelected), !selected && pressFx(state)]}>
      {option.icon && <Icon name={option.icon} size={18} color={color} />}
      <Txt variant="control" style={{ flexShrink: 1, color, textAlign: 'center' }}>{option.label}</Txt>
    </Pressable>;
  })}</View>;
}
/** `round` gives the icon a soft circle, used for every close and back button so they all look alike. */
export function IconButton({ icon, label, onPress, color = C.ink, filled = false, round = false, dark = false, disabled = false }: { icon: IconName; label: string; onPress: () => void; color?: string; filled?: boolean; round?: boolean; dark?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} hitSlop={round ? 4 : 0} onPress={() => { tick(); onPress(); }} style={({ pressed }) => [ui.iconButton, round && ui.iconRound, round && dark && ui.iconRoundDark, disabled && { opacity: .4 }, pressed && { opacity: .6 }]}><Icon name={icon} color={dark ? 'white' : color} filled={filled} size={round ? 22 : 24} /></Pressable>;
}
/** Sheet titles wrap, while navigation stays in the same position during saving. */
export function SheetHeader({ title, onClose, onBack, busy = false, closeLabel = 'Close', icon }: { title: string; onClose: () => void; onBack?: () => void; busy?: boolean; closeLabel?: string; icon?: IconName }) {
  return <View style={ui.sheetHeader}>{onBack ? <IconButton round icon="back" label="Back" onPress={onBack} disabled={busy} /> : icon ? <Icon name={icon} size={22} /> : null}<Txt accessibilityRole="header" variant="subtitle" style={{ flex: 1, minWidth: 0 }}>{title}</Txt><IconButton round icon="close" label={closeLabel} onPress={onClose} disabled={busy} /></View>;
}
/** Card identity gets the first line of emphasis; sets and printed numbers stay readable. */
export function CardCaption({ name, setName, detail }: { name: string; setName?: string; detail?: string }) {
  return <View style={ui.cardCaption}><Txt variant="cardTitle">{name}</Txt>{(setName || detail) && <Txt variant="caption" muted>{[setName, detail].filter(Boolean).join(' · ')}</Txt>}</View>;
}
export function SearchBox({ value, onChange, placeholder = 'Search Pokémon…' }: { value: string; onChange: (text: string) => void; placeholder?: string }) {
  return <View style={ui.search}><Icon name="search" size={19} color={C.muted} /><TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.muted} autoCorrect={false} returnKeyType="search" maxFontSizeMultiplier={1.4} style={ui.input} />{value ? <IconButton icon="close" label="Clear search" onPress={() => onChange('')} /> : null}</View>;
}
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={() => { tick(); onPress(); }} style={state => [ui.chip, selected && ui.chipSelected, !selected && pressFx(state)]}><Txt variant="label" style={{ color: selected ? C.paper : C.ink, flexShrink: 1 }}>{label}</Txt></Pressable>;
}
// Read-only pills sit inside a labeled row; pass onPress for a 44pt filter chip with its own label.
export function TypePill({ type, count, selected = false, onPress }: { type: PokemonType; count?: number; selected?: boolean; onPress?: () => void }) {
  const color = typeTextColor(type), label = typeLabel(type);
  const content = <><Txt style={{ color, fontWeight: '800', fontSize: 13, lineHeight: 18 }}>{label}</Txt>{count !== undefined && <Txt style={{ color, fontFamily: mono, fontWeight: '700', fontSize: 12, lineHeight: 18 }}>{count}</Txt>}{selected && <Icon name="check" size={15} color={color} />}</>;
  if (!onPress) return <View style={[ui.typePill, { backgroundColor: TYPE_COLORS[type] }]}>{content}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}${count !== undefined ? `, ${count} discovered` : ''}. ${selected ? `Showing only ${label} Pokémon. Tap to show all` : `Show ${label} Pokémon`}`} accessibilityState={{ selected }} onPress={() => { tick(); onPress(); }} style={({ pressed }) => [ui.typePill, ui.typeChip, { backgroundColor: TYPE_COLORS[type] }, selected && { borderColor: C.ink }, pressed && { opacity: .75 }]}>{content}</Pressable>;
}
export function CardArt({ card, style, high = false }: { card: CardBrief | Card; style?: StyleProp<ViewStyle>; high?: boolean }) {
  const local = 'localImage' in card ? card.localImage : undefined;
  const base = cardImage(card, high)?.replace(/\/(?:low|high)\.webp$/, '');
  const sources = [...new Set([...(high ? [cardImage(card, true), local] : [local, cardImage(card)]), base ? `${base}/${high ? 'low' : 'high'}.webp` : undefined, base ? `${base}/high.png` : undefined].filter((uri): uri is string => !!uri))];
  return <CardArtImage key={`${card.language}:${card.id}:${sources.join('|')}`} name={card.name} sources={sources} style={style} />;
}
// A set checklist starts dozens of downloads at once, and on a phone one dropped connection fails them together.
// Pause between tries so a blip doesn't use up every fallback, and go round the list again before showing "No artwork".
const ART_RETRY_MS = [400, 2000, 6000];
function CardArtImage({ name, sources, style }: { name: string; sources: string[]; style?: StyleProp<ViewStyle> }) {
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(65);
  const retry = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(retry.current), []);
  const round = Math.floor(attempt / sources.length);
  const uri = round < ART_RETRY_MS.length ? sources[attempt % sources.length] : undefined;
  const failed = () => {
    const next = attempt + 1;
    if (next >= sources.length * ART_RETRY_MS.length) setAttempt(next);
    else retry.current = setTimeout(() => setAttempt(next), ART_RETRY_MS[round]);
  };
  return <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={[ui.cardArt, style]}>{uri
    ? <Image key={attempt} accessibilityLabel={`${name} card`} source={uri} style={{ width: '100%', height: '100%' }} contentFit="contain" cachePolicy="memory-disk" onError={failed} />
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
  title: typeStyles.title,
  subtitle: typeStyles.subtitle,
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  button: { minHeight: 50, borderRadius: R.md, backgroundColor: C.red, paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.sm },
  buttonMedium: { minHeight: 44, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 9, gap: S.sm },
  secondary: { backgroundColor: 'transparent' },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, alignItems: 'stretch' },
  buttonSlot: { flexGrow: 1, flexShrink: 0, maxWidth: '100%', justifyContent: 'center' },
  link: { minHeight: 44, justifyContent: 'center' },
  toolbarAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: S.sm, paddingVertical: S.sm },
  actionRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingVertical: S.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  menuOverlay: { flex: 1, backgroundColor: '#14201C99', justifyContent: 'center', padding: S.xl },
  menuSheet: { width: '100%', maxWidth: 440, maxHeight: '85%', alignSelf: 'center', borderRadius: R.lg, backgroundColor: C.screen, overflow: 'hidden', paddingBottom: S.sm },
  segmented: { flexDirection: 'row', padding: 3, gap: 2, borderRadius: R.md, backgroundColor: '#DDE6D0' },
  segmentedDark: { backgroundColor: '#FFFFFF1F', borderColor: '#FFFFFF33' },
  segment: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: R.sm, paddingHorizontal: S.sm, paddingVertical: S.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.sm },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingHorizontal: S.lg, paddingVertical: S.sm, minHeight: 64, borderBottomWidth: 1, borderColor: C.line, backgroundColor: '#DFE8D4' },
  cardCaption: { gap: 2, marginTop: S.sm },
  segmentSelected: { backgroundColor: C.ink },
  segmentSelectedDark: { backgroundColor: 'white' },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  iconRound: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#CFDCC2' },
  iconRoundDark: { backgroundColor: '#FFFFFF2E' },
  search: { flexDirection: 'row', alignItems: 'center', paddingLeft: 15, paddingRight: 4, minHeight: 48, backgroundColor: '#FFFFFFA8', borderWidth: 1, borderColor: C.line, borderRadius: 12, gap: 10 },
  input: { flex: 1, minWidth: 0, minHeight: 48, color: C.ink, fontSize: 15 },
  chip: { minHeight: 44, maxWidth: '100%', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: S.sm, borderRadius: R.pill, borderWidth: 1, borderColor: C.line },
  chipSelected: { backgroundColor: C.ink, borderColor: C.ink },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28, paddingHorizontal: 12, borderRadius: 14 },
  typeChip: { minHeight: 44, borderRadius: 22, borderWidth: 3, borderColor: 'transparent' },
  cardArt: { aspectRatio: 0.716, overflow: 'hidden', borderRadius: 8, backgroundColor: '#E0E7D8' },
  artFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 10, gap: 6 },
  progress: { height: 7, borderRadius: 4, overflow: 'hidden', backgroundColor: '#D4DEC7' },
  error: { padding: 14, backgroundColor: '#FBE8E8', borderRadius: 12, marginVertical: 6 },
});
