/**
 * The TrackMyDex mark, as geometry.
 *
 * Kept here rather than in the component because the PWA icons are rasterised
 * by a build script that cannot render React, and the two drifting apart is
 * how an app ends up with one logo in the header and a different one on the
 * home screen.
 *
 * The design is a fanned pair of cards with a rising line on the front one:
 * a collection, and its value over time. It carries no disc, no equator and
 * no centre dot. That is deliberate and it is the whole point - the previous
 * mark was a circle split by a band, which is Nintendo's trade dress whatever
 * colour it is painted, and Google refused to verify the OAuth app over it.
 * Evoking the hobby is fine; borrowing somebody's silhouette is not.
 */

export type MarkShape =
  | {
      kind: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      rx: number;
      /** Degrees, about the rect's own centre. */
      rotate?: number;
      /** Painted with the page colour so it occludes whatever sits behind. */
      plate?: boolean;
    }
  | { kind: 'path'; d: string };

export const MARK_STROKE = 3;

export const MARK_SHAPES: readonly MarkShape[] = [
  // The card behind, tilted out of the stack.
  { kind: 'rect', x: 11, y: 9.5, w: 19, h: 26, rx: 3, rotate: -20, plate: true },
  // The card in front, upright and opaque so the fan reads as depth.
  { kind: 'rect', x: 18.5, y: 12.5, w: 21, h: 28, rx: 3.5, plate: true },
  // Its value, going up.
  { kind: 'path', d: 'M 23 32 L 28.2 25.9 L 31.8 28.7 L 36 20.5' },
];

/** The centre a rotation turns about, which SVG wants in absolute units. */
export function markRotation(shape: Extract<MarkShape, { kind: 'rect' }>) {
  return shape.rotate === undefined
    ? undefined
    : `rotate(${shape.rotate} ${shape.x + shape.w / 2} ${shape.y + shape.h / 2})`;
}

/**
 * The same shapes as a string, for the icon rasteriser.
 *
 * Takes literal colours: librsvg does not resolve CSS custom properties, so
 * the `var()` the component relies on would paint nothing here.
 */
export function markMarkup({ stroke, plate }: { stroke: string; plate: string }): string {
  return MARK_SHAPES.map((shape) => {
    if (shape.kind === 'path') {
      return `<path d="${shape.d}" fill="none" stroke="${stroke}" stroke-width="${MARK_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    const transform = markRotation(shape);
    return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="${shape.rx}"${
      transform ? ` transform="${transform}"` : ''
    } fill="${shape.plate ? plate : 'none'}" stroke="${stroke}" stroke-width="${MARK_STROKE}" stroke-linejoin="round"/>`;
  }).join('\n    ');
}
