import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, C, Txt, ui } from '@/components/pokedex-ui';

export function AboutScreen({ onBack }: { onBack: () => void }) {
  const version = Application.nativeApplicationVersion ?? (Platform.OS === 'web' ? Constants.expoConfig?.version : null) ?? 'Unavailable';
  const build = Application.nativeBuildVersion ?? (Platform.OS === 'web' ? 'Browser preview' : 'Unavailable');

  return <ScrollView contentContainerStyle={s.content}>
    <Txt style={ui.title}>Pocket Pokédex</Txt>
    <Txt muted>Your Pokémon cards, collected in one place.</Txt>
    <View style={s.details}>
      <View style={s.row}><Txt muted>Version</Txt><Txt selectable style={s.value}>{version}</Txt></View>
      <View style={s.row}><Txt muted>Build number</Txt><Txt selectable style={s.value}>{build}</Txt></View>
    </View>
    <Txt muted style={{ fontSize: 13 }}>Use these numbers to check which app is installed when testing an update.</Txt>
    <Button title="Back to settings" secondary onPress={onBack} />
  </ScrollView>;
}

const s = StyleSheet.create({
  content: { padding: 20, paddingBottom: 26, gap: 16 },
  details: { backgroundColor: '#FAFCF6', borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 16, gap: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  value: { fontWeight: '800' },
});
