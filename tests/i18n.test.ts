import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { LANGUAGE_LABELS, LANGUAGE_SHORT, LOCALE_DEFAULT_CARD_LANGUAGE, UI_LOCALES, UI_LOCALE_NAMES, toUiLocale } from '@/lib/catalog/languages';
import { CARD_LANGUAGES } from '@/db/schema/enums';
import { LEGAL_SECTIONS } from '@/lib/legal';

/**
 * Six interface languages is enough for a missing key to slip through review
 * unnoticed and surface as a raw `nav.wishlist` in production. These tests make
 * that a build failure instead.
 */

const MESSAGES_DIR = resolve(process.cwd(), 'messages');

function loadMessages(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(MESSAGES_DIR, `${locale}.json`), 'utf8'));
}

/** Flattens to dotted paths so a nested key can be compared across locales. */
function flatten(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

/**
 * ICU argument names: `{name}` and the `count` in `{count, plural, ...}`.
 *
 * The trailing `[,}]` matters. Without it the literal text inside a plural
 * branch - `{count, plural, =0 {No sets} ...}` - is mistaken for an argument
 * called `No`, and every translated plural fails.
 */
function placeholders(value: string): Set<string> {
  return new Set([...value.matchAll(/\{\s*(\w+)\s*[,}]/g)].map((match) => match[1] as string));
}

function leafStrings(value: unknown, prefix = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[prefix, value]];
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leafStrings(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('message catalogues', () => {
  const reference = loadMessages('en');
  const referenceKeys = flatten(reference).sort();
  const referenceStrings = new Map(leafStrings(reference));

  it('has a file for every configured locale and no orphans', () => {
    const files = readdirSync(MESSAGES_DIR)
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace('.json', ''))
      .sort();
    expect(files).toEqual([...UI_LOCALES].sort());
  });

  for (const locale of UI_LOCALES) {
    describe(locale, () => {
      const messages = loadMessages(locale);

      it('has exactly the same keys as English', () => {
        expect(flatten(messages).sort()).toEqual(referenceKeys);
      });

      it('uses the same ICU placeholders as English', () => {
        for (const [key, value] of leafStrings(messages)) {
          const expected = referenceStrings.get(key);
          if (!expected) continue;
          const mine = placeholders(value);
          for (const name of placeholders(expected)) {
            expect(
              mine.has(name),
              `${locale}: "${key}" is missing the {${name}} placeholder`,
            ).toBe(true);
          }
        }
      });

      it('has no empty strings', () => {
        for (const [key, value] of leafStrings(messages)) {
          expect(value.trim().length, `${locale}: "${key}" is empty`).toBeGreaterThan(0);
        }
      });

      it('is actually translated, not a copy of English', () => {
        if (locale === 'en') return;
        const identical = leafStrings(messages).filter(
          ([key, value]) => referenceStrings.get(key) === value,
        );
        // Some strings are legitimately identical: brand names, marketplace
        // condition grades, "Holo", "Promo", "Standard". Well under a third of
        // the catalogue should match English.
        expect(identical.length).toBeLessThan(referenceKeys.length / 3);
      });
    });
  }
});

describe('language tables', () => {
  it('names every printed language in every interface language', () => {
    for (const locale of UI_LOCALES) {
      for (const language of CARD_LANGUAGES) {
        expect(LANGUAGE_LABELS[locale][language], `${locale}/${language}`).toBeTruthy();
      }
    }
  });

  it('has a short tag for every printed language', () => {
    for (const language of CARD_LANGUAGES) {
      expect(LANGUAGE_SHORT[language]).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('names every interface locale in its own language', () => {
    for (const locale of UI_LOCALES) {
      expect(UI_LOCALE_NAMES[locale]).toBeTruthy();
    }
  });

  it('defaults each interface locale to a printed language that exists', () => {
    for (const locale of UI_LOCALES) {
      expect(CARD_LANGUAGES).toContain(LOCALE_DEFAULT_CARD_LANGUAGE[locale]);
    }
  });

  it('falls back to English for an unknown locale', () => {
    expect(toUiLocale('de')).toBe('en');
    expect(toUiLocale('')).toBe('en');
    expect(toUiLocale('ja')).toBe('ja');
  });
});

/**
 * The legal pages are the ones nobody opens until a verifier does.
 *
 * Google refused branding verification for TrackMyDex because the privacy
 * policy "does not have sufficient content", so these assert the substance
 * is there in every language rather than only that the keys exist.
 */
describe('legal documents', () => {
  const required = Object.entries(LEGAL_SECTIONS).flatMap(([document, sections]) =>
    sections.flatMap((section) => [
      `legal.${document}.${section}.heading`,
      `legal.${document}.${section}.body`,
    ]),
  );

  it.each(UI_LOCALES)('%s has every section of every document', (locale) => {
    const keys = new Set(flatten(loadMessages(locale)));
    expect(required.filter((key) => !keys.has(key))).toEqual([]);
  });

  it.each(UI_LOCALES)('%s states a privacy policy in real detail', (locale) => {
    const legal = (loadMessages(locale) as { legal: Record<string, never> }).legal;
    const privacy = legal.privacy as unknown as Record<string, { body: string }>;
    const prose = LEGAL_SECTIONS.privacy.map((s) => privacy[s]?.body ?? '').join('\n');

    // A policy this short is the boilerplate Google rejects.
    expect(prose.length).toBeGreaterThan(5000);

    // The questions a reader - and a reviewer - actually needs answered.
    for (const topic of [/GDPR|RGPD/, /cookie/i, /Google/, /TCGdex/, /scrypt/]) {
      expect(prose).toMatch(topic);
    }

    // Nothing left for somebody to fill in later. Operator identity is
    // injected from configuration, so it is a parameter, not a bracket.
    expect(prose).not.toMatch(/\[/);
  });
});

/**
 * Every key the code asks for must exist.
 *
 * The parity test above compares the locale files to each other, so a key
 * missing from all six passes it happily. That is exactly what happened:
 * `collection.sort` and `collection.language` existed in no file, next-intl
 * threw MISSING_MESSAGE while rendering, and the error took the route's
 * Suspense boundary with it - the page still drew, but nothing on it worked.
 */
describe('message keys used by the code', () => {
  const SOURCE_DIR = resolve(process.cwd(), 'src');

  /** `t('a.b')` and `t(\`a.b\`)`, but not `t(\`a.${x}\`)` which is dynamic. */
  const CALL = /\bt\(\s*['"`]([A-Za-z][\w.]*)['"`]/g;

  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) return sources(path);
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
  }

  const used = new Map<string, string>();
  for (const file of sources(SOURCE_DIR)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(CALL)) {
      const key = match[1];
      if (key && key.includes('.') && !used.has(key)) used.set(key, file);
    }
  }

  it('finds the translation calls at all', () => {
    // A guard on the regex itself: if it silently stops matching, the test
    // below would pass by looking at nothing.
    expect(used.size).toBeGreaterThan(100);
  });

  it.each(UI_LOCALES)('%s defines every key the code uses', (locale) => {
    const keys = new Set(flatten(loadMessages(locale)));
    const missing = [...used.entries()]
      .filter(([key]) => !keys.has(key))
      .map(([key, file]) => `${key}  (${file.replace(SOURCE_DIR, 'src')})`);
    expect(missing).toEqual([]);
  });
});
