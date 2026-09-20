import type { CardLanguage } from '@/db/schema/enums';

/**
 * Printed-language naming.
 *
 * Split out from `eras.ts` because it now covers six interface languages times
 * sixteen printed languages, and that table deserves its own file rather than
 * being buried next to era definitions.
 *
 * The distinction this file exists to preserve: a *UI locale* is the language
 * the reader wants the interface in; a *card language* is the language a piece
 * of cardboard was printed in. They are chosen separately and stored
 * separately, so a Spanish-speaking collector of Japanese cards is a first-class
 * case rather than an awkward one.
 */

export const UI_LOCALES = ['en', 'fr', 'es', 'pt', 'it', 'ja'] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

/** Endonyms: a language picker should read in the language it offers. */
export const UI_LOCALE_NAMES: Record<UiLocale, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  pt: 'Português',
  it: 'Italiano',
  ja: '日本語',
};

export function toUiLocale(locale: string): UiLocale {
  return (UI_LOCALES as readonly string[]).includes(locale) ? (locale as UiLocale) : 'en';
}

export const LANGUAGE_LABELS: Record<UiLocale, Record<CardLanguage, string>> = {
  en: {
    en: 'English',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
    it: 'Italian',
    pt: 'Portuguese',
    'pt-br': 'Portuguese (BR)',
    ja: 'Japanese',
    ko: 'Korean',
    'zh-tw': 'Chinese (Traditional)',
    'zh-cn': 'Chinese (Simplified)',
    id: 'Indonesian',
    th: 'Thai',
    nl: 'Dutch',
    pl: 'Polish',
    ru: 'Russian',
  },
  fr: {
    en: 'Anglais',
    fr: 'Français',
    de: 'Allemand',
    es: 'Espagnol',
    it: 'Italien',
    pt: 'Portugais',
    'pt-br': 'Portugais (BR)',
    ja: 'Japonais',
    ko: 'Coréen',
    'zh-tw': 'Chinois (traditionnel)',
    'zh-cn': 'Chinois (simplifié)',
    id: 'Indonésien',
    th: 'Thaï',
    nl: 'Néerlandais',
    pl: 'Polonais',
    ru: 'Russe',
  },
  es: {
    en: 'Inglés',
    fr: 'Francés',
    de: 'Alemán',
    es: 'Español',
    it: 'Italiano',
    pt: 'Portugués',
    'pt-br': 'Portugués (BR)',
    ja: 'Japonés',
    ko: 'Coreano',
    'zh-tw': 'Chino (tradicional)',
    'zh-cn': 'Chino (simplificado)',
    id: 'Indonesio',
    th: 'Tailandés',
    nl: 'Neerlandés',
    pl: 'Polaco',
    ru: 'Ruso',
  },
  pt: {
    en: 'Inglês',
    fr: 'Francês',
    de: 'Alemão',
    es: 'Espanhol',
    it: 'Italiano',
    pt: 'Português',
    'pt-br': 'Português (BR)',
    ja: 'Japonês',
    ko: 'Coreano',
    'zh-tw': 'Chinês (tradicional)',
    'zh-cn': 'Chinês (simplificado)',
    id: 'Indonésio',
    th: 'Tailandês',
    nl: 'Neerlandês',
    pl: 'Polaco',
    ru: 'Russo',
  },
  it: {
    en: 'Inglese',
    fr: 'Francese',
    de: 'Tedesco',
    es: 'Spagnolo',
    it: 'Italiano',
    pt: 'Portoghese',
    'pt-br': 'Portoghese (BR)',
    ja: 'Giapponese',
    ko: 'Coreano',
    'zh-tw': 'Cinese (tradizionale)',
    'zh-cn': 'Cinese (semplificato)',
    id: 'Indonesiano',
    th: 'Thailandese',
    nl: 'Olandese',
    pl: 'Polacco',
    ru: 'Russo',
  },
  ja: {
    en: '英語',
    fr: 'フランス語',
    de: 'ドイツ語',
    es: 'スペイン語',
    it: 'イタリア語',
    pt: 'ポルトガル語',
    'pt-br': 'ポルトガル語 (BR)',
    ja: '日本語',
    ko: '韓国語',
    'zh-tw': '中国語 (繁体字)',
    'zh-cn': '中国語 (簡体字)',
    id: 'インドネシア語',
    th: 'タイ語',
    nl: 'オランダ語',
    pl: 'ポーランド語',
    ru: 'ロシア語',
  },
};

/** Two-letter tag shown on compact language chips. */
export const LANGUAGE_SHORT: Record<CardLanguage, string> = {
  en: 'EN',
  fr: 'FR',
  de: 'DE',
  es: 'ES',
  it: 'IT',
  pt: 'PT',
  'pt-br': 'BR',
  ja: 'JP',
  ko: 'KR',
  'zh-tw': 'TW',
  'zh-cn': 'CN',
  id: 'ID',
  th: 'TH',
  nl: 'NL',
  pl: 'PL',
  ru: 'RU',
};

/**
 * The printed language a UI locale most likely wants by default.
 *
 * Only ever a starting point for a signed-out visitor: a signed-in user's own
 * `defaultCardLanguage` always wins, and nothing is persisted on a guess.
 */
export const LOCALE_DEFAULT_CARD_LANGUAGE: Record<UiLocale, CardLanguage> = {
  en: 'en',
  fr: 'fr',
  es: 'es',
  pt: 'pt',
  it: 'it',
  ja: 'ja',
};
