import { env } from './env';
import { UI_LOCALES, toUiLocale } from './catalog/languages';

const origin = (process.env.NEXT_PUBLIC_APP_URL ?? env.APP_URL).replace(/\/$/, '');

function cleanPath(path: string): string {
  if (!path || path === '/') return '';
  return `/${path.replace(/^\/+|\/+$/g, '')}`;
}

export function localizedAlternates(locale: string, path = '') {
  const suffix = cleanPath(path);
  const languages = Object.fromEntries(
    UI_LOCALES.map((candidate) => [candidate, `${origin}/${candidate}${suffix}`]),
  );

  return {
    canonical: `${origin}/${toUiLocale(locale)}${suffix}`,
    languages: { ...languages, 'x-default': `${origin}/en${suffix}` },
  };
}

export function sitemapAlternates(path = '') {
  return localizedAlternates('en', path).languages;
}

export const APP_ORIGIN = origin;
