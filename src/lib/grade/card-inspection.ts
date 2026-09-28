export type CardSide = 'front' | 'back';
export interface CardInspectionInput { rgb: Uint8Array; width: number; height: number; side: CardSide }
export interface WhiteMarkCandidate {
  kind: 'white-mark-candidate'; region: 'corner' | 'edge';
  assessment: 'needs-review';
  /** Bounding box normalized to the rectified card, not the original photograph. */
  x: number; y: number; width: number; height: number; pixels: number;
}
export interface CardInspection {
  quality: { accepted: boolean; reasons: string[] };
  centering: {
    status: 'measured' | 'unassessable'; reason?: string;
    bordersPx?: { left: number; right: number; top: number; bottom: number };
    horizontal?: [number, number]; vertical?: [number, number];
    psa10CenteringTolerance?: { maximumPercent: number; withinTolerance: boolean; uncertaintyPercent: number; source: string };
  };
  anomalies: WhiteMarkCandidate[];
  surface: { status: 'unassessable'; reason: string };
}

/**
 * Bounded image measurements, not a trained grading model or authentication tool.
 * Input must be upright, tightly cropped to the card and perspective rectified.
 * A background margin, sleeve, glare or inaccurate crop invalidates measurements.
 * Uniform printed borders only: full-art and textured borders deliberately abstain.
 * White marks can also be dust, glare or print; they do not establish damage/tears.
 */
export function inspectCardPixels({ rgb, width, height, side }: CardInspectionInput): CardInspection {
  const reasons: string[] = [];
  const result: CardInspection = {
    quality: { accepted: false, reasons },
    centering: { status: 'unassessable', reason: 'Photo quality or crop is insufficient.' },
    anomalies: [],
    surface: { status: 'unassessable', reason: 'Scratches, dents and tears require visual review and additional angled lighting photographs.' },
  };
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 120 || height < 160 || width > 4096 || height > 4096 || rgb.length !== width * height * 3) {
    reasons.push('Invalid RGB buffer or insufficient resolution (minimum 120 × 160).'); return result;
  }
  if (width / height < 0.65 || width / height > 0.8) reasons.push('Crop aspect ratio does not resemble an upright card.');
  type RGB = [number, number, number];
  const pixel = (x: number, y: number): RGB => { const i = (y * width + x) * 3; return [rgb[i]!, rgb[i + 1]!, rgb[i + 2]!]; };
  const distance = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  let min = 255, max = 0, dark = 0, glare = 0, count = 0;
  for (let y = 0; y < height; y += 3) for (let x = 0; x < width; x += 3) {
    const p = pixel(x, y); const l = (p[0] + p[1] + p[2]) / 3;
    min = Math.min(min, ...p); max = Math.max(max, ...p); dark += l < 18 ? 1 : 0;
    glare += p.every(v => v > 248) ? 1 : 0; count++;
  }
  if (max - min < 35) reasons.push('Insufficient image contrast.');
  if (dark / count > 0.45) reasons.push('Most of the card is too dark.');
  if (glare / count > 0.2) reasons.push('Large clipped white area: exposure or glare prevents inspection.');
  // Evaluate edges at approximately the same card-relative scale across resolutions.
  // Absence of sharp transitions prevents reliable border/white-mark localization.
  const focusStep = Math.max(1, Math.floor(width / 210));
  let sharpTransitions = 0;
  for (let y = 0; y < height - focusStep; y += focusStep) for (let x = 0; x < width - focusStep; x += focusStep) {
    const p = pixel(x, y);
    if (Math.max(distance(p, pixel(x + focusStep, y)), distance(p, pixel(x, y + focusStep))) > 35) sharpTransitions++;
  }
  if (sharpTransitions < 8) reasons.push('No sufficiently sharp transitions; blur or featureless image prevents inspection.');
  if (reasons.length) return result;
  result.quality.accepted = true;
  const depths: number[][] = [];
  // Nine independent transects per edge avoid rounded corners and isolated marks.
  for (let edge = 0; edge < 4; edge++) {
    const values: number[] = [];
    for (let line = 0; line < 9; line++) {
      const along = 0.25 + line / 16;
      const limit = Math.floor((edge < 2 ? width : height) * 0.16);
      const point = (d: number) => edge === 0 ? pixel(d, Math.floor(height * along)) : edge === 1 ? pixel(width - 1 - d, Math.floor(height * along)) : edge === 2 ? pixel(Math.floor(width * along), d) : pixel(Math.floor(width * along), height - 1 - d);
      const reference = point(2); let boundary = -1;
      for (let d = 3; d < limit - 2; d++) {
        if (distance(point(d), reference) > 55 && distance(point(d + 1), reference) > 55 && distance(point(d + 2), reference) > 55) { boundary = d; break; }
        // Texture within the candidate border makes the reference unreliable.
        if (distance(point(d), reference) > 30) break;
      }
      if (boundary >= 4) values.push(boundary);
    }
    depths.push(values);
  }
  if (depths.some(values => values.length < 8 || Math.max(...values) - Math.min(...values) > 2)) {
    result.centering = { status: 'unassessable', reason: 'No consistent uniform border detected; full-art, texture, crop or glare may prevent measurement.' };
  } else {
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
    const left = median(depths[0]!), right = median(depths[1]!), top = median(depths[2]!), bottom = median(depths[3]!);
    result.centering = { status: 'measured', bordersPx: { left, right, top, bottom }, horizontal: [100 * left / (left + right), 100 * right / (left + right)], vertical: [100 * top / (top + bottom), 100 * bottom / (top + bottom)] };
  }
  if (result.centering.status === 'measured') {
    const maximumPercent = side === 'front' ? 55 : 75;
    const borders = result.centering.bordersPx!;
    // Each boundary is uncertain by at least one pixel, including crop placement.
    const uncertaintyPercent = Math.max(100 / (borders.left + borders.right), 100 / (borders.top + borders.bottom));
    result.centering.psa10CenteringTolerance = { maximumPercent, uncertaintyPercent, withinTolerance: Math.max(...result.centering.horizontal!, ...result.centering.vertical!) + uncertaintyPercent <= maximumPercent, source: 'https://www.psacard.com/gradingstandards' };
  }
  if (side !== 'back') return result;
  // Only white clusters surrounded by a predominantly blue back perimeter qualify.
  const band = Math.max(4, Math.floor(width * 0.045));
  const mask = new Uint8Array(width * height); let blue = 0, perimeter = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x >= band && x < width - band && y >= band && y < height - band) continue;
    const [r, g, b] = pixel(x, y); perimeter++;
    if (b > r * 1.3 && b > g * 1.1 && b > 55) blue++;
    if (Math.min(r, g, b) > 185 && Math.max(r, g, b) - Math.min(r, g, b) < 35) mask[y * width + x] = 1;
  }
  if (blue / perimeter < 0.75) {
    result.centering = { status: 'unassessable', reason: 'Back perimeter is not predominantly blue; verify crop, sleeve, exposure and card design.' };
    return result;
  }
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index]) continue;
    const queue = [index]; mask[index] = 0; let loX = width, loY = height, hiX = 0, hiY = 0;
    for (let n = 0; n < queue.length; n++) {
      const current = queue[n]!, x = current % width, y = Math.floor(current / width);
      loX = Math.min(loX, x); hiX = Math.max(hiX, x); loY = Math.min(loY, y); hiY = Math.max(hiY, y);
      for (const next of [x > 0 ? current - 1 : -1, x < width - 1 ? current + 1 : -1, y > 0 ? current - width : -1, y < height - 1 ? current + width : -1]) {
        if (next >= 0 && mask[next]) { mask[next] = 0; queue.push(next); }
      }
    }
    if (queue.length < 3 || queue.length > perimeter * 0.015) continue;
    result.anomalies.push({ kind: 'white-mark-candidate', assessment: 'needs-review', region: ((loX < width * 0.12 || hiX > width * 0.88) && (loY < height * 0.12 || hiY > height * 0.88)) ? 'corner' : 'edge', x: loX / width, y: loY / height, width: (hiX - loX + 1) / width, height: (hiY - loY + 1) / height, pixels: queue.length });
    if (result.anomalies.length >= 50) break;
  }
  return result;
}
