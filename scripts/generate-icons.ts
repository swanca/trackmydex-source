/**
 * Renders the app icons from the same mark the UI draws.
 *
 * The geometry is imported rather than re-typed, so the header and the home
 * screen cannot drift apart.
 *
 * The tile is the brand colour, not the app background.
 *
 * It used to be the mark stroked in gradient on near-black. On a phone home
 * screen and in a browser tab that sits on a dark chrome, near-black on
 * near-black reads as nothing at all: only the thin outline survives, which
 * is exactly what it looked like. Painting the gradient as the tile and the
 * mark in white gives it something to stand on at 16px.
 *
 * Three shapes of output. `any` fills the tile edge to edge; `maskable` keeps
 * everything important inside the middle 80% because Android may crop it to a
 * circle; and `oauth` is the square Google asks for on the consent screen,
 * which must be the real mark - they refuse a logo that does not identify the
 * brand it claims to be.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { markMarkup } from '../src/lib/logo-mark';

const VIOLET = '#8b5cf6';
const AZURE = '#38bdf8';
const INK = '#0b0f1a';

function markSvg(
  size: number,
  inset: number,
  { tile, stroke, plate }: { tile: string; stroke: string; plate: string },
) {
  const s = 48;
  const scale = 1 - inset * 2;
  const pad = (s * inset).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${s}" y2="${s}">
      <stop offset="0" stop-color="${VIOLET}"/><stop offset="1" stop-color="${AZURE}"/>
    </linearGradient>
  </defs>
  <rect width="${s}" height="${s}" fill="${tile}"/>
  <g transform="translate(${pad},${pad}) scale(${scale.toFixed(4)})">
    ${markMarkup({ stroke, plate })}
  </g>
</svg>`;
}

/** The mark in white on the brand gradient. */
const ON_BRAND = { tile: 'url(#g)', stroke: '#ffffff', plate: INK };
/** Inverted for Google's consent screen, which sits the logo on white paper. */
const ON_WHITE = { tile: '#ffffff', stroke: 'url(#g)', plate: '#ffffff' };

const out = 'public/icons';
await mkdir(out, { recursive: true });

type Palette = { tile: string; stroke: string; plate: string };
const jobs: Array<[string, number, number, Palette]> = [
  // A dedicated small size: browsers downscaling a 512 tile lose the trend
  // line to aliasing, and the tab icon is where most people meet the brand.
  ['favicon-32.png', 32, 0.12, ON_BRAND],
  ['icon-192.png', 192, 0.16, ON_BRAND],
  ['icon-512.png', 512, 0.16, ON_BRAND],
  // Maskable keeps a fat safe zone: Android may crop to a circle.
  ['maskable-512.png', 512, 0.24, ON_BRAND],
  ['apple-touch-icon.png', 180, 0.16, ON_BRAND],
  // Google's consent screen shows the logo on a white sheet.
  ['oauth-logo-120.png', 120, 0.14, ON_WHITE],
];

for (const [name, size, inset, palette] of jobs) {
  await sharp(Buffer.from(markSvg(size, inset, palette))).png().toFile(`${out}/${name}`);
  console.log(`  ${name}  ${size}x${size}  marge ${Math.round(inset * 100)}%`);
}
console.log('icones generees');
