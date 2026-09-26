import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button, C, Chip, ErrorNotice, Txt, ui } from './pokedex-ui';
import { normalize, species } from '@/lib/catalog';
import { LANGUAGES } from '@/lib/languages';
import { makeManualCard } from '@/lib/manual-card';
import type { Card, Language } from '@/lib/model';

// Placeholders show a real printing in the selected language.
const EXAMPLES: Partial<Record<Language, { name: string; set: string; number: string; script: string }>> = {
  ko: { name: '야나프', set: 'SV4K', number: '001/066', script: 'Korean' },
};
const CHINESE_EXAMPLE = { name: '四季鹿', set: 'CBB4C', number: '17 07/07', script: 'Chinese' };

export function ManualCardForm({ language, photoUri, onReview }: { language: Language; photoUri?: string; onReview: (card: Card) => void }) {
  const [name, setName] = useState('');
  const [setCode, setSetCode] = useState('');
  const [number, setNumber] = useState('');
  const [category, setCategory] = useState('Pokemon');
  const [pokemonQuery, setPokemonQuery] = useState('');
  const [dexIds, setDexIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const example = EXAMPLES[language] ?? CHINESE_EXAMPLE;
  const term = normalize(pokemonQuery || name);
  const choices = species.filter(s => dexIds.includes(s.id) || (term && (String(s.id) === term || LANGUAGES.some(lang => normalize(s[lang] ?? '').includes(term))))).slice(0, 12);
  const field = (label: string, value: string, change: (text: string) => void, placeholder: string) => <View style={{ gap: 3 }}><Txt style={{ fontSize: 12, fontWeight: '700' }}>{label}</Txt><TextInput accessibilityLabel={label} value={value} onChangeText={change} placeholder={placeholder} placeholderTextColor={C.muted} autoCorrect={false} style={{ color: C.ink, backgroundColor: C.paper, padding: 12, borderRadius: 8, fontSize: 14 }} /></View>;
  return <View style={{ gap: 12, marginTop: 12 }}>
    {field('Printed name', name, setName, example.name)}
    {field('Set code', setCode, setSetCode, example.set)}
    {field('Full card number', number, setNumber, example.number)}
    <View style={[ui.row, { flexWrap: 'wrap' }]}>{['Pokemon', 'Trainer', 'Energy'].map(type => <Chip key={type} label={type === 'Pokemon' ? 'Pokémon' : type} selected={category === type} onPress={() => setCategory(type)} />)}</View>
    {category === 'Pokemon' && <>
      {field('Link Pokémon (optional)', pokemonQuery, setPokemonQuery, `English / ${example.script} name or Pokédex number`)}
      <Txt muted style={{ fontSize: 12 }}>Select each Pokémon on this card to unlock its Pokédex entry.</Txt>
      <View style={[ui.row, { flexWrap: 'wrap' }]}>{choices.map(s => <Chip key={s.id} label={`${s.en} · ${s[language]}`} selected={dexIds.includes(s.id)} onPress={() => setDexIds(ids => ids.includes(s.id) ? ids.filter(id => id !== s.id) : [...ids, s.id])} />)}</View>
    </>}
    <Txt muted style={{ fontSize: 12 }}>Saved using the details you enter. Market prices are unavailable for manual entries.</Txt>
    <ErrorNotice text={error} />
    <Button title="Review card" onPress={() => {
      try { const card = makeManualCard({ language, name, setCode, number, category, dexIds, photoUri }); setError(null); onReview(card); }
      catch (e) { setError(e instanceof Error ? e.message : 'Check the card details.'); }
    }} />
  </View>;
}
