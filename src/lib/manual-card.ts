import type { Card, Language } from './model';

export function makeManualCard(input: { language: Language; name: string; setCode: string; number: string; category: string; dexIds: number[]; photoUri?: string }): Card {
  const name = input.name.trim();
  const setCode = input.setCode.normalize('NFKC').trim().toUpperCase();
  const number = input.number.normalize('NFKC').trim().match(/^(\d{1,4}(?:\s+\d{2})?)\s*\/\s*(\d{1,4})$/);
  if (!name || name.length > 100) throw new Error('Enter the name printed on the card.');
  if (!/^[A-Z0-9][A-Z0-9.-]{1,29}$/.test(setCode)) throw new Error('Enter the set code printed at the bottom, such as CBB4C.');
  if (!number || Number(number[2]) < 1) throw new Error('Enter the full card number, such as 001/078 or 17 07/07.');
  if (!['Pokemon', 'Trainer', 'Energy'].includes(input.category)) throw new Error('Choose a card type.');
  if (!input.dexIds.every(id => Number.isInteger(id) && id > 0 && id < 10000)) throw new Error('Choose a valid Pokémon.');
  const localId = number[1].replace(/\s+/g, ' ');
  return {
    id: `manual-${setCode}-${localId.replace(/\s/g, '')}-${Number(number[2])}`, language: input.language,
    name, localId, set: { id: setCode, name: setCode, total: Number(number[2]) }, category: input.category,
    dexIds: input.category === 'Pokemon' ? [...new Set(input.dexIds)] : [], types: [], rarity: 'Unknown',
    finishes: ['normal', 'holo', 'reverse', 'unsure'],
    ...(input.photoUri?.startsWith('file://') ? { localImage: input.photoUri } : {}),
  };
}
