import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { C, R, S, Txt } from '@/components/pokedex-ui';

/** Shown inside the Settings sheet; the sheet's back arrow returns to Settings. */
export function AboutScreen() {
  const version = Application.nativeApplicationVersion ?? (Platform.OS === 'web' ? Constants.expoConfig?.version : null) ?? 'Unavailable';
  const build = Application.nativeBuildVersion ?? (Platform.OS === 'web' ? 'Browser preview' : 'Unavailable');

  return <ScrollView contentContainerStyle={s.content}>
    <Txt accessibilityRole="header" variant="title">Pocket Pokédex</Txt>
    <Txt muted>Your Pokémon cards, collected in one place.</Txt>
    <View style={s.details}>
      <View style={s.row}><Txt muted variant="label">Version</Txt><Txt selectable variant="readout" style={s.value}>{version}</Txt></View>
      <View style={s.row}><Txt muted variant="label">Build number</Txt><Txt selectable variant="readout" style={s.value}>{build}</Txt></View>
    </View>
    <Txt muted variant="caption">Use these numbers to check which app is installed when testing an update.</Txt>
  </ScrollView>;
}

const s = StyleSheet.create({
  content: { padding: S.xl, paddingBottom: 26, gap: S.lg },
  details: { backgroundColor: '#FAFCF6', borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: S.lg, gap: S.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: S.md },
  value: { fontWeight: '600', flexShrink: 1 },
});
