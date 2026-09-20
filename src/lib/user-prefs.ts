import type { CardLanguage, Currency } from '@/db/schema/enums';
import { CARD_LANGUAGES } from '@/db/schema/enums';
import { env } from './env';
import { LOCALE_DEFAULT_CARD_LANGUAGE, toUiLocale } from './catalog/languages';
import type { AuthUser } from './auth';

/**
 * Resolves the three preferences that shape every page.
 *
 * UI locale, printed card language and display currency are three separate
 * decisions, and conflating them is the mistake this product must not make: a
 * French UI does not imply French cards, and neither implies euros. A signed-out
 * visitor gets a sensible default derived from the UI locale, which is a guess -
 * so it is only ever a default, never persisted on their behalf.
 */
export interface Preferences {
  /**
   * The printed language of the cards this person collects.
   *
   * Decides what a scan files a card as and what a new collection entry
   * defaults to. It is a fact about their shelf, not about their reading.
   */
  cardLanguage: CardLanguage;

  /**
   * The language names are shown in, always following the interface.
   *
   * These were the same value, which meant a French interface showed English
   * set and card names to anyone whose collecting language was English - the
   * two are simply different questions. What language do you read in, and
   * what language are your cards printed in.
   */
  displayLanguage: CardLanguage;

  displayCurrency: Currency;
  locale: string;
}

export function resolvePreferences(
  user: AuthUser | null | undefined,
  locale: string,
): Preferences {
  const fromUser = user?.defaultCardLanguage;
  const cardLanguage =
    typeof fromUser === 'string' && (CARD_LANGUAGES as readonly string[]).includes(fromUser)
      ? (fromUser as CardLanguage)
      : LOCALE_DEFAULT_CARD_LANGUAGE[toUiLocale(locale)];

  const currency = user?.displayCurrency;
  const displayCurrency: Currency =
    currency === 'EUR' || currency === 'USD' ? currency : env.DEFAULT_CURRENCY;

  return {
    cardLanguage,
    displayLanguage: LOCALE_DEFAULT_CARD_LANGUAGE[toUiLocale(locale)],
    displayCurrency,
    locale,
  };
}
