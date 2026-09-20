import Image from 'next/image';
import { cn } from '@/lib/cn';
import { CARD_ASPECT, cardImage, GRID_IMAGE_SIZES, type ImageQuality } from '@/lib/images';

/**
 * Card artwork, or the empty sleeve when it is missing.
 *
 * This is the product's signature device. A card you do not own is not a grey
 * placeholder with a cross through it - it is a pocket in a binder, recessed
 * into the page, still carrying its number so the grid keeps reading as a
 * complete set. Missing cards stay legible without shouting, which is exactly
 * what the brief asks for.
 */
export function CardArt({
  imageBaseUrl,
  alt,
  number,
  owned = true,
  quality = 'low',
  priority = false,
  sizes = GRID_IMAGE_SIZES,
  className,
}: {
  imageBaseUrl: string | null;
  alt: string;
  number?: string;
  owned?: boolean;
  quality?: ImageQuality;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  const source = cardImage(imageBaseUrl, quality);

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-[var(--radius-tile)]',
        owned && source ? 'bg-ink-soft' : 'sleeve',
        className,
      )}
      style={{ aspectRatio: String(CARD_ASPECT) }}
    >
      {source ? (
        <Image
          src={source}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : 'lazy'}
          /**
           * Thumbnails are served as-is.
           *
           * The provider already hands us a ~15 kB WebP at this size, so
           * routing it through the image optimiser buys nothing and costs a
           * server round trip per card - which on a page showing three rails
           * of twelve is 36 of them before anything appears. Full-resolution
           * art still goes through the optimiser, where the saving is real.
           */
          unoptimized={quality === 'low'}
          // Every card is shown at full strength, owned or not. Dimming the
          // ones you lack turns a set page into mostly grey rectangles, which
          // is the opposite of what a card shop should look like - ownership is
          // already signalled by the quantity badge and the stepper below.
          className="object-cover transition-opacity duration-300"
        />
      ) : null}

      {!owned && number ? (
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center font-mono text-[1.375rem] font-500 tracking-[0.02em] text-[rgb(148_163_208/0.35)] [text-shadow:0_1px_0_rgb(0_0_0/0.8)]"
        >
          {number}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The fanned trio used in era headers.
 *
 * Replaces the reference's row of Pokemon sprites with what this product is
 * actually about: cards. Three overlapping, slightly rotated pieces of art read
 * as a hand held out, and they come from the user's own most valuable cards in
 * that era, so the header is personal rather than stock decoration.
 */
export function CardFan({
  images,
  className,
}: {
  images: Array<{ url: string | null; alt: string }>;
  className?: string;
}) {
  const visible = images.filter((image) => image.url).slice(0, 3);
  if (visible.length === 0) return null;

  return (
    <div aria-hidden className={cn('pointer-events-none relative h-full w-[132px]', className)}>
      {visible.map((image, index) => (
        <div
          key={`${image.url}-${index}`}
          className="absolute bottom-[-14%] h-[112%] overflow-hidden rounded-lg border border-[rgb(148_163_208/0.18)] shadow-[0_10px_24px_-10px_rgb(0_0_0/0.9)]"
          style={{
            left: `${index * 34}px`,
            aspectRatio: String(CARD_ASPECT),
            transform: `rotate(${(index - 1) * 7}deg)`,
            zIndex: index,
          }}
        >
          <Image
            src={cardImage(image.url, 'low') ?? ''}
            alt=""
            fill
            sizes="90px"
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}
