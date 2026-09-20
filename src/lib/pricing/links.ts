/**
 * Marketplace deep links.
 *
 * The brief forbids fabricating keyword-search URLs when an exact product mapping
 * exists. Every link below is addressed by the marketplace's own product id,
 * which the catalog provider supplies per printing, so the destination is a
 * specific product page and not a guess.
 *
 * Cardmarket's public URL shape is not covered by a published contract and the
 * site blocks automated verification, so the template is overridable via
 * `CARDMARKET_PRODUCT_URL_TEMPLATE` for self-hosters if Cardmarket ever changes
 * it. `{id}` and `{locale}` are the substitutions.
 */

/**
 * Cardmarket has no id-addressable product URL.
 *
 * Their product pages are slug-based - `/Singles/151/Pikachu-V2-MEW173` - and
 * the slug is not derivable from anything we hold. It carries Cardmarket's own
 * set naming (their "SV Black Star Promos" against our "SVP Black Star
 * Promos"), and a version suffix whose rule is not name collision: the 151 set
 * numbers its second Pikachu `-V2`, while Ascended Heroes leaves its second
 * `Pikachu ex` unsuffixed. Both spellings were checked against real URLs and
 * both guesses 404.
 *
 * `?idProduct=` on the Singles path, which this used to build, is not a
 * redirect either: it lands on the generic Singles listing.
 *
 * So Cardmarket gets a search scoped to the card, which always resolves to a
 * real page, and TCGplayer - whose `/product/{id}` form is exact and stable -
 * is what the UI offers as the precise link.
 */
const CARDMARKET_SEARCH_TEMPLATE =
  'https://www.cardmarket.com/{locale}/Pokemon/Products/Search?searchString={query}';

const CARDMARKET_LOCALES: Record<string, string> = {
  en: 'en',
  fr: 'fr',
  de: 'de',
  es: 'es',
  it: 'it',
};

/**
 * Cardmarket's search is fussy, and these rules come from testing it.
 *
 * Two things break a naive "name + number" query:
 *
 *  - The suffix. "Mewtwo EX XY107" returns nothing; "Mewtwo XY107" finds the
 *    card. Cardmarket writes the suffix joined to the name, so a loose `EX`
 *    token matches no product.
 *  - A bare number. "Mewtwo 10" returns nothing; "Mewtwo BS 10" finds the Base
 *    Set one. A plain collector number is ambiguous across 30 years of sets,
 *    so the set abbreviation has to disambiguate it.
 *
 * The abbreviation is only added when the number needs it. A promo number like
 * `XY107` already names its own set, and "Mewtwo XYP XY107" is worse than
 * "Mewtwo XY107".
 */
const NAME_SUFFIX =
  /[\s-]+(ex|gx|v|vmax|vstar|v-?union|break|prime|legend|lv\s*\.?\s*x|δ|☆|★)$/i;

/** The name Cardmarket indexes the product under. */
export function cardmarketQueryName(cardName: string): string {
  return cardName.replace(NAME_SUFFIX, '').trim() || cardName;
}

export function cardmarketSearchUrl(
  cardName: string,
  localId?: string | null,
  setCode?: string | null,
  uiLocale = 'en',
): string {
  const template = process.env.CARDMARKET_SEARCH_URL_TEMPLATE || CARDMARKET_SEARCH_TEMPLATE;
  const locale = CARDMARKET_LOCALES[uiLocale] ?? 'en';

  const number = localId?.trim() || '';
  // A number that carries letters already identifies its set.
  const needsSetCode = number !== '' && /^\d+$/.test(number);

  const query = encodeURIComponent(
    [cardmarketQueryName(cardName), needsSetCode ? setCode : null, number]
      .filter(Boolean)
      .join(' '),
  );
  return template.replace('{query}', query).replace('{locale}', locale);
}

export function tcgplayerProductUrl(productId: number | string): string {
  return `https://www.tcgplayer.com/product/${productId}`;
}

/**
 * True when we can link to a real product page. When false the UI shows the card
 * without a market link rather than sending the user to a search results page
 * that may well match the wrong printing.
 */
export function hasExactMarketMapping(variant: {
  cardmarketProductId: number | null;
  tcgplayerProductId: number | null;
}): boolean {
  return variant.cardmarketProductId !== null || variant.tcgplayerProductId !== null;
}
