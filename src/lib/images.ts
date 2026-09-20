/**
 * Card and set imagery.
 *
 * Assets stay on the provider CDN: we store a base URL and append quality plus
 * extension at render time. That respects the image licence (we are not
 * redistributing artwork), costs a self-hoster nothing in storage or bandwidth,
 * and lets the grid pull 15 kB WebP thumbnails while the detail view pulls the
 * full-resolution PNG.
 */

export type ImageQuality = 'low' | 'high';

/**
 * Where images are served from.
 *
 * Empty (the default) means straight from the provider CDN. Set
 * NEXT_PUBLIC_ASSET_BASE_URL after running `npm run mirror:assets` to serve a
 * local mirror instead - only needed for offline or air-gapped deployments.
 */
const LOCAL_ASSET_BASE = process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? '';

/**
 * A TCGplayer product image, whose size lives in the filename.
 *
 * `.../product/272493_200w.jpg` is the thumbnail; the same product is also
 * published at `_400w` and `_in_1000x1000`. Captured so the stem can be
 * re-sized rather than the whole URL re-derived.
 */
const SIZED_TCGPLAYER_IMAGE =
  /^(https:\/\/tcgplayer-cdn\.tcgplayer\.com\/product\/\d+)_[a-z0-9_]+\.(jpe?g|png)$/i;

export function cardImage(
  baseUrl: string | null | undefined,
  quality: ImageQuality = 'low',
  cardId?: string,
  language = 'en',
): string | null {
  if (LOCAL_ASSET_BASE && cardId) {
    const extension = quality === 'low' ? 'webp' : 'png';
    return `${LOCAL_ASSET_BASE.replace(/\/$/, '')}/${language}/${cardId}.${extension}`;
  }
  if (!baseUrl) return null;

  /**
   * TCGplayer fallbacks carry their size in the filename, so honour quality.
   *
   * These were being returned untouched, which meant a detail page asking for
   * `high` still got the 200px thumbnail the grid uses - the artwork looked
   * soft for every one of the ~5,700 cards TCGdex has no image for, and no
   * amount of shrinking the display would have fixed it, because the pixels
   * were never fetched.
   *
   * The grid keeps the 200px file deliberately: it is ~25 kB, it is already
   * the right size, and `unoptimized` sends it straight from the CDN with no
   * server round trip. Only the detail view pays for the large one.
   */
  const sized = baseUrl.match(SIZED_TCGPLAYER_IMAGE);
  if (sized) {
    const [, stem, extension] = sized;
    return `${stem}_${quality === 'low' ? '200w' : 'in_1000x1000'}.${extension}`;
  }

  /**
   * Any other complete image URL is returned untouched.
   *
   * TCGdex has no artwork for 10,089 of the 33,114 cards we carry, so those
   * fall back to a finished URL rather than a base to append a quality and
   * extension to. Recognising that here means the fallback can simply be
   * coalesced into the same column in SQL and every call site keeps working.
   */
  if (/^https?:\/\/.+\.(jpe?g|png|webp|avif)(\?.*)?$/i.test(baseUrl)) return baseUrl;

  const extension = quality === 'low' ? 'webp' : 'png';
  return `${baseUrl}/${quality}.${extension}`;
}

export function setLogo(baseUrl: string | null | undefined): string | null {
  return baseUrl ? `${baseUrl}.png` : null;
}

/**
 * Set symbols are unreliable upstream: the provider's `univ` asset bucket was
 * returning HTTP 400 for every symbol at the time of writing. Callers must be
 * able to fall back, so this returns null-able and the UI renders a monogram.
 */
export function setSymbol(baseUrl: string | null | undefined): string | null {
  return baseUrl ? `${baseUrl}.png` : null;
}

/** Standard trading-card proportions, used for every image box in the app. */
export const CARD_ASPECT = 63 / 88;

/**
 * `sizes` for the responsive card grid. Getting this right is the single
 * biggest lever on mobile data use: without it the browser downloads the
 * desktop-width image on a phone.
 */
export const GRID_IMAGE_SIZES =
  '(min-width: 1280px) 18vw, (min-width: 1024px) 22vw, (min-width: 640px) 30vw, 44vw';

export const DETAIL_IMAGE_SIZES = '(min-width: 1024px) 420px, 88vw';
