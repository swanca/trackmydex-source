import { Archivo, IBM_Plex_Mono } from 'next/font/google';

/**
 * Type pairing.
 *
 * One superfamily, two widths. Archivo's variable `wdth` axis lets set names and
 * portfolio totals be set wide and heavy - the confident, poster-like headline
 * the reference leans on - while body copy stays at normal width, so the page
 * reads as one voice rather than two fonts negotiating.
 *
 * IBM Plex Mono handles card numbers, set codes and product ids. Those are
 * catalogue data, and a ledger face makes them scannable instead of decorative.
 */
export const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--font-archivo',
});

export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-plex-mono',
});
