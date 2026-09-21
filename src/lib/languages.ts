export const LANGUAGES = ['en', 'ja', 'zh-cn', 'zh-tw'] as const;
export type Language = typeof LANGUAGES[number];
export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English', ja: '日本語 · Japanese',
  'zh-cn': '简体中文 · Simplified Chinese', 'zh-tw': '繁體中文 · Traditional Chinese',
};
export const LANGUAGE_CODES: Record<Language, string> = { en: 'EN', ja: 'JP', 'zh-cn': 'ZH-CN', 'zh-tw': 'ZH-TW' };
export const isLanguage = (value: unknown): value is Language => LANGUAGES.includes(value as Language);
