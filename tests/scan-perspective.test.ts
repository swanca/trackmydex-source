import { describe, expect, it } from 'vitest';
import { detectCards } from '@/lib/scan/detect';
import { fingerprint, hammingDistance, parseFingerprint, type Rgba } from '@/lib/scan/phash';
import { rectifyCard } from '@/lib/scan/rectify';

function card(seed: number): Rgba {
  const width = 126, height = 176;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = 145 + 12 * Math.sin(x / (7 + seed)) * Math.cos(y / (8 + seed * 2)) + 8 * Math.sin((x + y) / (4 + seed));
    const index = (y * width + x) * 4;
    data[index] = value; data[index + 1] = value; data[index + 2] = value; data[index + 3] = 255;
  }
  return { data, width, height };
}

function rotated(source: Rgba, degrees: number): Rgba {
  const width = 240, height = 260;
  const data = new Uint8ClampedArray(width * height * 4);
  const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.round(c * (x - 120) + s * (y - 130) + source.width / 2);
    const sy = Math.round(-s * (x - 120) + c * (y - 130) + source.height / 2);
    const index = (y * width + x) * 4;
    const inside = sx >= 0 && sy >= 0 && sx < source.width && sy < source.height;
    for (let channel = 0; channel < 3; channel++) data[index + channel] = inside ? source.data[(sy * source.width + sx) * 4 + channel]! : 15;
    data[index + 3] = 255;
  }
  return { data, width, height };
}

describe('scanner projective normalization', () => {
  it('reprojects a trapezoid with projective rather than bilinear geometry', () => {
    const width = 201, height = 101, data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      data[(y * width + x) * 4] = x;
      data[(y * width + x) * 4 + 1] = y;
    }
    const result = rectifyCard({ data, width, height }, [{ x: 50, y: 0 }, { x: 150, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }], 3, 3);
    expect(result.data[16]).toBe(100);
    expect(result.data[17]).toBe(33);
    expect(result.data[0]).toBe(50);
    expect(result.data[32]).toBe(200);
  });
  it('rejects out-of-bounds and almost zero-area corners', () => {
    const image = card(1);
    expect(() => rectifyCard(image, [{ x: -1, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 150 }, { x: 0, y: 150 }])).toThrow('inside');
    expect(() => rectifyCard(image, [{ x: 1, y: 1 }, { x: 1.001, y: 1 }, { x: 1.001, y: 1.001 }, { x: 1, y: 1.001 }])).toThrow('convex');
  });
  it('rejects crossed corners instead of generating a misleading fingerprint', () => {
    expect(() => rectifyCard(card(1), [{ x: 0, y: 0 }, { x: 125, y: 175 }, { x: 125, y: 0 }, { x: 0, y: 175 }])).toThrow('convex quadrilateral');
  });
  it('preserves identity pixels at equal output size', () => {
    const image = card(1);
    expect(rectifyCard(image, [{ x: 0, y: 0 }, { x: 125, y: 0 }, { x: 125, y: 175 }, { x: 0, y: 175 }], 126, 176).data).toEqual(image.data);
  });

  it('rejects a featureless card-shaped camera frame as background', () => {
    const image = card(1);
    image.data.fill(120);
    expect(detectCards(image as ImageData)).toEqual([]);
  });

  it('improves fingerprint distance after detecting rotated textured cards', () => {
    let before = 0, after = 0, samples = 0;
    for (const seed of [1, 2, 3, 4]) for (const angle of [-12, -8, 8, 12]) {
      const original = card(seed), photo = rotated(original, angle);
      const detected = detectCards(photo as ImageData)[0];
      expect(detected?.corners).toBeDefined();
      const box = detected!;
      const cropData = new Uint8ClampedArray(box.width * box.height * 4);
      for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) {
        const start = ((box.y + y) * photo.width + box.x + x) * 4;
        cropData.set(photo.data.slice(start, start + 4), (y * box.width + x) * 4);
      }
      const reference = parseFingerprint(fingerprint(original));
      before += hammingDistance(reference, parseFingerprint(fingerprint({ data: cropData, width: box.width, height: box.height })));
      after += hammingDistance(reference, parseFingerprint(fingerprint(rectifyCard(photo, box.corners!))));
      samples++;
    }
    console.info(`Synthetic rotation benchmark: ${samples} samples; mean Hamming ${before / samples} before, ${after / samples} rectified`);
    expect(after).toBeLessThan(before * 0.65);
  });
});
