import { cardCategory, isTagTeam, matchesCardFilter, scanTypeHint, trainerType, type CardFilter } from './card-kind';
import english from '../data/cards-en.json';
import japanese from '../data/cards-ja.json';
import englishSets from '../data/sets-en.json';
import japaneseSets from '../data/sets-ja.json';
import speciesData from '../data/species.json';
import imageOverrides from '../data/image-overrides.json';
const artOverrides = imageOverrides as Record<Language, Record<string, string>>;
import type { Card, CardBrief, Finish, Language } from './model';
import { fetchCardData } from './card-api';
import { DAY, parseCardPricing } from './pricing';

export const species = speciesData as { id: number; en: string; ja: string; genus: string }[];
export const speciesById = new Map(species.map(s => [s.id, s]));
export const allCards: CardBrief[] = [
  ...english.map(c => ({ ...c, image: c.image ?? artOverrides.en[c.id], language: 'en' as const })),
  ...japanese.map(c => ({ ...c, image: c.image ?? artOverrides.ja[c.id], language: 'ja' as const })),
];
type SetBrief = { id: string; name: string; cardCount: { official: number; total: number } };
const setMaps = {
  en: new Map((englishSets as SetBrief[]).map(s => [s.id, s])),
  ja: new Map((japaneseSets as SetBrief[]).map(s => [s.id, s])),
};
export const setForCard = (card: CardBrief) => setMaps[card.language].get(card.id.slice(0, card.id.lastIndexOf('-')));
export const cardImage = (card: CardBrief, high = false) => {
  const base = card.image ?? artOverrides[card.language][card.id];
  return base ? `${base}/${high ? 'high' : 'low'}.webp` : undefined;
};
export const speciesImage = (id: number) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
export const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const searchable = allCards.map(card => ({ card, name: normalize(card.name), id: normalize(card.id), number: normalize(card.localId), set: normalize(setForCard(card)?.name ?? '') }));

export function searchCards(query: string, language: Language, limit = 80, filter: CardFilter = 'all'): CardBrief[] {
  const term = normalize(query);
  if (!term) return filter === 'all' ? [] : allCards.filter(c => c.language === language && matchesCardFilter(c, filter)).sort((a, b) => Number(!!b.image) - Number(!!a.image)).slice(0, limit);
  const tokens = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  const tokenAliases = tokens.map(token => species.filter(s => normalize(s.en).includes(token) || normalize(s.ja).includes(token)).map(s => normalize(language === 'ja' ? s.ja : s.en)));
  return searchable.filter(c => c.card.language === language && matchesCardFilter(c.card, filter) && tokens.every((token, i) => c.name.includes(token) || (token === 'mega' && /^(?:M\s|Mega|メガ)/.test(c.card.name)) || c.id.includes(token) || c.set.includes(token) || tokenAliases[i].some(alias => c.name.includes(alias))))
    .sort((a, b) => Number(b.name === term) - Number(a.name === term) || Number(b.number === term) - Number(a.number === term) || Number(!!b.card.image) - Number(!!a.card.image))
    .slice(0, limit).map(c => c.card);
}

export type ScanText = { text: string; topText: string; bottomText: string };
export type ScanCandidate = { card: CardBrief; score: number; evidence: string; exactPrinting: boolean };
const scanWords = { en: [...new Set(english.map(c => c.name))], ja: [...new Set(japanese.map(c => c.name))] };
export const recognitionWords = (language: Language) => scanWords[language];
const canonicalNumber = (s: string) => s.toLowerCase().replace(/^0+(?=\d)/, '');
const numberFromOCR = (s: string) => {
  // Keep subset prefixes (TG/GG/SV); repair letter-shaped digits only in the numeric part.
  const match = s.match(/^([a-z]{0,3}?)([0-9oilsbz]+)$/i);
  if (!match || !/\d/.test(s)) return canonicalNumber(s);
  return canonicalNumber(match[1] + match[2].toLowerCase().replace(/[oilsbz]/g, c => ({ o: '0', i: '1', l: '1', s: '5', b: '8', z: '2' }[c]!)));
};
const baseName = (s: string, printed: string) => (/^M\s/.test(printed) ? s.slice(1) : s.replace(/^(?:mega|メガ)/, '')).replace(/(?:vmax|vstar|ex|gx|lvx|v)$/, '');
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + Number(a[i - 1] !== b[j - 1]));
    if (Math.min(...next) > max) return max + 1;
    row = next;
  }
  return row[b.length];
}
function fuzzyHeader(name: string, lines: string[], language: Language): boolean {
  if (name.length < (language === 'ja' ? 4 : 5) || name.length > 35) return false;
  const max = name.length >= 9 ? 2 : 1;
  return lines.some(line => {
    if ([...name].filter(c => !line.includes(c)).length > max) return false;
    for (let length = name.length - max; length <= name.length + max; length++) {
      for (let start = 0; start <= line.length - length; start++) {
        if (editDistance(name, line.slice(start, start + length), max) <= max) return true;
      }
    }
    return false;
  });
}

/** Evidence ranks suggestions, never an automatic identification or a confidence percentage. */
export function scanCandidates(scan: ScanText, language: Language, limit = 12, filter: CardFilter = 'all'): ScanCandidate[] {
  const full = normalize(scan.text);
  const hint = scanTypeHint(scan.topText);
  const meaningfulLines = scan.topText.split(/\n/).map(normalize).filter(l => !/^(?:energy|basicenergy|specialenergy|エネルギー|基本エネルギー|特殊エネルギー|trainer|trainers|supporter|item|stadium|tagteam|グッズ|スタジアム|サポート|トレーナーズ)$/.test(l));
  const top = meaningfulLines.join('');
  const headerLines = [...new Set(meaningfulLines.filter(l => l.length > 0 && l.length <= 45))].slice(0, 30);
  const fuzzyCache = new Map<string, boolean>();
  const fuzzy = (name: string) => {
    if (!fuzzyCache.has(name)) fuzzyCache.set(name, fuzzyHeader(name, headerLines, language));
    return fuzzyCache.get(name)!;
  };
  const bottom = scan.bottomText.normalize('NFKC');
  const fractions = [...`${bottom}\n${scan.text.normalize('NFKC')}`.matchAll(/([A-Za-z]{0,3}[0-9OIlSBZ]{1,4})\s*[/／]\s*([A-Za-z]{0,3}[0-9OIlSBZ]{1,4})/gi)]
    .map(f => [numberFromOCR(f[1]), numberFromOCR(f[2])]);
  const nameScores = new Map<string, number>();
  for (const name of scanWords[language]) {
    const n = normalize(name), base = baseName(n, name);
    let score = n.length >= 3 && top.includes(n) ? 110 + Math.min(n.length, 20) : 0;
    if (!score && base.length >= 3 && top.includes(base)) score = 90;
    const partners = name.split(/[&＆]/).map(part => baseName(normalize(part), part));
    if (!score && partners.length > 1 && partners.every(part => part.length >= 2 && top.includes(part))) score = 130;
    if (!score && fuzzy(n)) score = 70;
    if (!score && base !== n && fuzzy(base)) score = 60;
    if (!score && n.length >= 3 && full.includes(n)) score = 25;
    if (score >= 60 && /(?:mega|メガ)/i.test(scan.topText)) score += /^(?:M\s|Mega|メガ)/.test(name) ? 45 : -35;
    nameScores.set(n, score);
  }
  const ranked = searchable.filter(c => c.card.language === language && matchesCardFilter(c.card, filter)).map(c => {
    const nameScore = nameScores.get(c.name) ?? 0;
    const set = setForCard(c.card);
    const matchingNumbers = fractions.filter(f => f[0] === canonicalNumber(c.card.localId));
    const numberMatch = matchingNumbers.length > 0;
    const totalMatch = matchingNumbers.some(f => Number(f[1]) === set?.cardCount.official);
    const setCode = c.card.id.slice(0, c.card.id.lastIndexOf('-'));
    const codeMatch = setCode.length >= 3 && new RegExp(`(?:^|[^a-z0-9])${setCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9])`, 'i').test(bottom);
    const exactPrinting = codeMatch && numberMatch;
    const categoryBonus = hint !== 'all' ? matchesCardFilter(c.card, hint) ? 45 : -70 : 0;
    let score = categoryBonus + nameScore + (numberMatch ? totalMatch ? 150 : 65 : 0) + (exactPrinting ? 160 : 0);
    // Bare ENERGY is a category clue, not an exact card name.
    if (hint === 'energy' && !numberMatch && nameScore < 60) score = 0;
    // A clear header should beat another Pokémon mentioned in an attack or evolution line.
    if (nameScore < 60 && !numberMatch) score = 0;
    const evidence = exactPrinting ? 'Set code + card number' : nameScore >= 60 && numberMatch ? 'Name + card number' : totalMatch ? 'Card number + set size' : nameScore >= 60 ? 'Name match · check the number' : 'Card number · check the picture';
    return { card: c.card, score, evidence, exactPrinting };
  }).filter(c => c.score >= 60).sort((a, b) => b.score - a.score || Number(!!b.card.image) - Number(!!a.card.image));
  const threshold = ranked[0]?.score >= 240 ? ranked[0].score - 80 : 60;
  return ranked.filter(c => c.score >= threshold).slice(0, limit);
}
export function rankScanCandidates(scan: ScanText, language: Language, limit = 12, filter: CardFilter = 'all'): CardBrief[] {
  return scanCandidates(scan, language, limit, filter).map(c => c.card);
}

/** Picture comparison only breaks close OCR ties; exact set/number evidence stays first. */
export function rerankByArtwork(candidates: ScanCandidate[], distances: Map<string, number>): ScanCandidate[] {
  const valid = [...distances.values()].filter(d => Number.isFinite(d) && d >= 0);
  if (valid.length < 2) return candidates;
  const min = Math.min(...valid), max = Math.max(...valid);
  if (max - min < 0.08) return candidates;
  const bonus = (c: ScanCandidate) => {
    const distance = distances.get(c.card.id);
    return distance === undefined || distance < 0 || !Number.isFinite(distance) ? 0 : 40 * (max - distance) / (max - min);
  };
  return [...candidates].sort((a, b) => Number(b.exactPrinting) - Number(a.exactPrinting) || (b.score + bonus(b)) - (a.score + bonus(a)));
}

export const ENERGY_SEARCHES = [
  { label: 'Grass', en: 'Grass Energy', ja: '草エネルギー' },
  { label: 'Fire', en: 'Fire Energy', ja: '炎エネルギー' },
  { label: 'Water', en: 'Water Energy', ja: '水エネルギー' },
  { label: 'Lightning', en: 'Lightning Energy', ja: '雷エネルギー' },
  { label: 'Psychic', en: 'Psychic Energy', ja: '超エネルギー' },
  { label: 'Fighting', en: 'Fighting Energy', ja: '闘エネルギー' },
  { label: 'Darkness', en: 'Darkness Energy', ja: '悪エネルギー' },
  { label: 'Metal', en: 'Metal Energy', ja: '鋼エネルギー' },
  { label: 'Fairy', en: 'Fairy Energy', ja: 'フェアリーエネルギー' },
];
export function needsScanRefinement(candidates: ScanCandidate[]): boolean {
  const best = candidates[0];
  return !best || !(best.exactPrinting || (best.evidence === 'Name + card number' && best.score >= 230 && best.score - (candidates[1]?.score ?? 0) >= 60));
}

const detailCache = new Map<string, { card: Card; at: number }>();
export async function fetchCard(brief: CardBrief): Promise<Card> {
  const key = `${brief.language}:${brief.id}`;
  const cached = detailCache.get(key);
  if (cached && Date.now() - cached.at < DAY) return cached.card;
  const data = await fetchCardData(brief);
  if (typeof data.id !== 'string' || !data.set || !Array.isArray(data.dexId ?? [])) throw new Error('This card has incomplete catalog data. Please try another printing.');
  const available = (['normal', 'holo', 'reverse'] as Finish[]).filter(f => data.variants?.[f] === true);
  if (data.variants?.firstEdition) {
    if (available.includes('normal')) available.push('firstEdition');
    if (available.includes('holo')) available.push('firstEditionHolo');
    if (available.includes('reverse')) available.push('firstEditionReverse');
  }
  if (data.variants?.wPromo) available.push('wPromo');
  for (const finish of parseCardPricing(brief, data).finishes) if (!available.includes(finish)) available.push(finish);
  const card: Card = {
    ...brief, id: data.id, name: data.name, localId: data.localId,
    image: typeof data.image === 'string' && data.image.startsWith('https://assets.tcgdex.net/') ? data.image : brief.image ?? artOverrides[brief.language][brief.id],
    set: { id: data.set.id, name: data.set.name, total: data.set.cardCount?.official ?? 0 },
    dexIds: (data.category === 'Pokemon' ? data.dexId ?? [] : []).filter((id: unknown) => Number.isInteger(id) && Number(id) > 0),
    types: data.types ?? [], category: data.category ?? cardCategory(brief),
    trainerType: data.trainerType ?? trainerType(brief), energyType: data.energyType,
    tagTeam: data.suffix === 'TAG TEAM-GX' || isTagTeam(brief), rarity: data.rarity ?? 'Unknown',
    hp: data.hp, description: data.description ?? data.effect, finishes: [...available, 'unsure'],
  };
  detailCache.set(key, { card, at: Date.now() });
  return card;
}
