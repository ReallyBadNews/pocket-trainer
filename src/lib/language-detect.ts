import type { CardFilter } from './card-kind';
import { scanCandidates, searchCards, species, type ScanText } from './catalog';
import { LANGUAGES, type Language } from './languages';
import type { CardBrief } from './model';

/** A scan can name its language, or ask the scanner to work it out from the card text. */
export type ScanLanguage = Language | 'auto';

// Characters that differ between the Simplified and Traditional spellings of
// Pokémon names and common card words (基础/基礎, 宝可梦/寶可夢, 图鉴/圖鑑).
const CARD_WORDS = [
  ['基础', '基礎'], ['宝可梦', '寶可夢'], ['图鉴', '圖鑑'], ['训练家', '訓練家'], ['进化', '進化'], ['弱点', '弱點'],
  ['伤害', '傷害'], ['对手', '對手'], ['选择', '選擇'], ['这只', '這隻'], ['状态', '狀態'], ['场上', '場上'], ['弃牌区', '棄牌區'],
  ['体重', '體重'], ['国', '國'], ['张', '張'], ['个', '個'], ['从', '從'], ['时', '時'], ['将', '將'], ['击', '擊'], ['战', '戰'],
  ['备', '備'], ['发', '發'], ['会', '會'], ['为', '為'], ['让', '讓'], ['数', '數'], ['还', '還'], ['术', '術'], ['属', '屬'],
];
const variants = (() => {
  const simplified = new Set<string>(), traditional = new Set<string>();
  const cnNames = new Set(species.flatMap(s => [...s['zh-cn'] ?? ''])), twNames = new Set(species.flatMap(s => [...s['zh-tw'] ?? '']));
  for (const [a, b] of [...CARD_WORDS, ...species.map(s => [s['zh-cn'] ?? '', s['zh-tw'] ?? ''])]) {
    const left = [...a], right = [...b];
    if (left.length !== right.length) continue;
    left.forEach((c, i) => { if (c !== right[i] && /^\p{Script=Han}{2}$/u.test(c + right[i])) { simplified.add(c); traditional.add(right[i]); } });
  }
  // Some name pairs are different translations, not script variants (暴/爆). A
  // character that the other script also uses in any Pokémon name is not evidence.
  for (const c of simplified) if (twNames.has(c)) simplified.delete(c);
  for (const c of traditional) if (cnNames.has(c)) traditional.delete(c);
  return { simplified, traditional };
})();

const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;
/** Positive for Simplified evidence, negative for Traditional, zero when unclear. */
const chineseLean = (text: string) => [...text].reduce((n, c) => n + Number(variants.simplified.has(c)) - Number(variants.traditional.has(c)), 0);

/** Guess the language of typed or recognized text from its script alone. */
export function textLanguage(text: string): Language {
  const value = text.normalize('NFKC');
  const hangul = count(value, /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g);
  // Exclude the prolonged sound mark and middle dot, which Chinese text can also contain.
  const kana = count(value, /[\u3041-\u3096\u30A1-\u30FA]/g);
  const han = count(value, /[\u4E00-\u9FFF\u3400-\u4DBF]/g);
  const cjk = hangul + kana + han;
  if (!cjk) return 'en';
  if (hangul >= Math.max(1, cjk * 0.3)) return 'ko';
  if (kana >= Math.max(1, cjk * 0.08)) return 'ja';
  if (!han) return 'en';
  // Traditional has the far larger catalog, so unclear text starts there.
  return chineseLean(value) > 0 ? 'zh-cn' : 'zh-tw';
}

/**
 * Identify a photographed card's language. Script decides between English, Japanese,
 * Korean and Chinese. For Chinese, an exact set/number printing outranks character
 * evidence, which outranks a name-only catalog match. Both scripts share many names
 * (四季鹿), and mainland coverage is thin, so a name match alone never flips the script.
 */
export function detectCardLanguage(scan: ScanText): Language {
  // The footer is always read with the English model, so only the card body counts.
  const body = `${scan.topText}\n${scan.text}`;
  const hangul = count(body, /[\uAC00-\uD7AF]/g), kana = count(body, /[\u3041-\u3096\u30A1-\u30FA]/g), han = count(body, /[\u4E00-\u9FFF]/g);
  // A few stray CJK glyphs from artwork or glare do not make an English card foreign.
  if (hangul + kana + han < 3) return 'en';
  const guess = textLanguage(body);
  if (guess !== 'zh-cn' && guess !== 'zh-tw') return guess;
  const [cn] = scanCandidates(scan, 'zh-cn', 1), [tw] = scanCandidates(scan, 'zh-tw', 1);
  if (!!cn?.exactPrinting !== !!tw?.exactPrinting) return cn?.exactPrinting ? 'zh-cn' : 'zh-tw';
  if (chineseLean(body) !== 0) return guess;
  return (cn?.score ?? 0) > (tw?.score ?? 0) ? 'zh-cn' : 'zh-tw';
}

/**
 * Search the likeliest language first. Otherwise show every catalog with a match:
 * Japanese, Korean and Traditional Chinese share set codes, so SV4K 001/066 names three printings.
 */
export function searchAnyLanguage(query: string, preferred: Language | null, limit = 80, filter: CardFilter = 'all'): CardBrief[] {
  const guess = textLanguage(query);
  for (const language of new Set([preferred ?? guess, guess])) {
    const found = searchCards(query, language, limit, filter);
    if (found.length) return found;
  }
  return LANGUAGES.flatMap(language => searchCards(query, language, limit, filter)).slice(0, limit);
}
