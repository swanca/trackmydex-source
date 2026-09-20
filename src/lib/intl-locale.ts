/**
 * A locale string `Intl` will actually accept.
 *
 * `new Intl.NumberFormat('')` throws `RangeError: Incorrect locale information
 * provided`, and an empty or malformed tag reaching a formatter took down the
 * whole server render: the home page's featured rail threw inside a `.map`,
 * the Suspense boundary around the route errored, and everything inside it
 * arrived as HTML that never hydrated. Nothing on screen looked broken - the
 * buttons simply did nothing.
 *
 * Formatting a price is not a good reason to lose a page, so a tag that
 * cannot be used is replaced rather than thrown on. `undefined` is the right
 * fallback rather than a hard-coded 'en': it tells Intl to use the runtime
 * default, which is closer to the reader than a guess would be.
 */

const checked = new Map<string, string | undefined>();

export function intlLocale(locale: string | null | undefined): string | undefined {
  if (!locale) return undefined;

  const cached = checked.get(locale);
  if (cached !== undefined || checked.has(locale)) return cached;

  let usable: string | undefined;
  try {
    // canonicalizeLocales rejects exactly what the formatters reject, and is
    // far cheaper than constructing a formatter to find out.
    usable = Intl.getCanonicalLocales(locale)[0];
  } catch {
    usable = undefined;
  }

  checked.set(locale, usable);
  return usable;
}
