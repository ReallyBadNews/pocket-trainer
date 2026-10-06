export const LANGUAGES = ['en', 'ja', 'ko', 'zh-cn', 'zh-tw'] as const;

export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  ja: '日本語 · Japanese',
  ko: '한국어 · Korean',
  'zh-cn': '简体中文 · Simplified Chinese',
  'zh-tw': '繁體中文 · Traditional Chinese',
};

export const LANGUAGE_CODES: Record<Language, string> = {
  en: 'EN',
  ja: 'JP',
  ko: 'KO',
  'zh-cn': 'ZH-CN',
  'zh-tw': 'ZH-TW',
};

/** Upstream catalogs that are still sparse offer manual entry for missing printings. */
export const PARTIAL_CATALOGS: readonly Language[] = ['ko', 'zh-cn', 'zh-tw'];

export const isLanguage = (value: unknown): value is Language => LANGUAGES.includes(value as Language);
