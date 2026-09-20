import { cn } from '@/lib/cn';
import { setLogo } from '@/lib/images';

/**
 * A set's visual identity, with a guaranteed fallback.
 *
 * TCGdex has no logo for 242 of the 388 sets we carry, almost all of them
 * Japanese, and the asset does not exist under any locale - it is missing
 * upstream, not mis-addressed. Official set logos could be taken from
 * elsewhere, but they are copyrighted artwork and rehosting them is not
 * something to do quietly.
 *
 * So a set without a logo gets a typographic badge built from what we do
 * have: its official abbreviation, or failing that the start of its id. Every
 * set then has something recognisable and the grid never shows a hole, which
 * was the actual problem.
 */
export function SetMark({
  logoUrl,
  symbolUrl,
  code,
  setId,
  name,
  className,
}: {
  logoUrl: string | null;
  symbolUrl?: string | null;
  code?: string | null;
  setId: string;
  name: string;
  className?: string;
}) {
  // The catalogue stores a base URL with no extension - passing it straight
  // to an img tag 404s, and the browser then paints the alt text, which is
  // how a set logo slot ended up showing a wrapped, clipped set name.
  const image = setLogo(logoUrl) ?? setLogo(symbolUrl) ?? null;

  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- provider CDN, and
      // these are already small transparent PNGs served with a long cache.
      <img
        src={image}
        // Decorative: the set name is always adjacent. An alt here would be
        // read twice by a screen reader and, worse, drawn as text if the
        // image ever fails.
        alt=""
        loading="lazy"
        className={cn('max-h-full max-w-full object-contain', className)}
      />
    );
  }

  // Abbreviations run to three or four characters; an id can be much longer,
  // so it is trimmed to what stays legible in a 40px square.
  const label = (code ?? setId).slice(0, 4).toUpperCase();

  return (
    <span
      aria-label={name}
      role="img"
      className={cn(
        'flex size-full items-center justify-center rounded-lg',
        'border border-hairline bg-[rgb(148_163_208/0.08)]',
        'font-display text-[0.625rem] font-bold tracking-tight text-muted',
        className,
      )}
    >
      {label}
    </span>
  );
}
