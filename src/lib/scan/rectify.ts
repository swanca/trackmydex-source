import type { Point } from './detect';
import type { Rgba } from './phash';
export type { Point } from './detect';

/** Inverse projective sampling. Pixels stay on-device; the stored hash format is unchanged. */
export function rectifyCard(image: Rgba, corners: readonly [Point, Point, Point, Point], width = 252, height = 352): Rgba {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 2 || image.height < 2 || image.data.length < image.width * image.height * 4) {
    throw new Error('Invalid source image');
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width * height > 4_000_000) {
    throw new Error('Invalid rectified image size');
  }
  if (corners.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x >= image.width || point.y >= image.height)) {
    throw new Error('Card corners must lie inside the image');
  }
  for (let i = 0; i < 4; i++) {
    const p = corners[i]!, q = corners[(i + 1) % 4]!, r = corners[(i + 2) % 4]!;
    if ((q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x) < 1) {
      throw new Error('Card corners must form a clockwise convex quadrilateral');
    }
  }
  const [a, b, c, d] = corners;
  const dx = a.x - b.x + c.x - d.x;
  const dy = a.y - b.y + c.y - d.y;
  const denominator = (b.x - c.x) * (d.y - c.y) - (d.x - c.x) * (b.y - c.y);
  const g = Math.abs(denominator) < 1e-9 ? 0 : (dx * (d.y - c.y) - (d.x - c.x) * dy) / denominator;
  const h = Math.abs(denominator) < 1e-9 ? 0 : ((b.x - c.x) * dy - dx * (b.y - c.y)) / denominator;
  if ([1, 1 + g, 1 + h, 1 + g + h].some((value) => !Number.isFinite(value) || value < 1e-9)) {
    throw new Error('Singular card perspective');
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const divisor = g * u + h * v + 1;
      const sx = Math.max(0, Math.min(image.width - 1, ((b.x - a.x + g * b.x) * u + (d.x - a.x + h * d.x) * v + a.x) / divisor));
      const sy = Math.max(0, Math.min(image.height - 1, ((b.y - a.y + g * b.y) * u + (d.y - a.y + h * d.y) * v + a.y) / divisor));
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(image.width - 1, x0 + 1), y1 = Math.min(image.height - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0;
      for (let channel = 0; channel < 4; channel++) {
        const pixel = (px: number, py: number) => image.data[(py * image.width + px) * 4 + channel] ?? 0;
        data[(y * width + x) * 4 + channel] = (1 - fy) * ((1 - fx) * pixel(x0, y0) + fx * pixel(x1, y0)) + fy * ((1 - fx) * pixel(x0, y1) + fx * pixel(x1, y1));
      }
    }
  }
  return { data, width, height };
}
