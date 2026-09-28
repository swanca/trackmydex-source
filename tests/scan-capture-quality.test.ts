import { describe, expect, it } from 'vitest';
import { isDetectionStable, measureCaptureQuality } from '@/lib/scan/capture-quality';

const box = (x = 50, y = 40, width = 100, height = 140) => ({ x, y, width, height, score: 0.9 });

function pixels(width: number, height: number, value: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    const level = value(x, y);
    data[offset] = level;
    data[offset + 1] = level;
    data[offset + 2] = level;
    data[offset + 3] = 255;
  }
  return { data, width, height } as ImageData;
}

describe('automatic scanner shutter quality gate', () => {
  it('accepts a sharp, normally exposed card region', () => {
    const frame = pixels(200, 220, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? 70 : 190);
    expect(measureCaptureQuality(frame, box()).acceptable).toBe(true);
  });

  it('rejects a flat blurred frame and clipped exposure', () => {
    expect(measureCaptureQuality(pixels(200, 220, () => 120), box()).acceptable).toBe(false);
    expect(measureCaptureQuality(pixels(200, 220, () => 255), box()).acceptable).toBe(false);
  });

  it('requires the detected card to stay in the same place', () => {
    expect(isDetectionStable(box(), box(52, 41), 200, 220)).toBe(true);
    expect(isDetectionStable(box(), box(78, 40), 200, 220)).toBe(false);
  });
});
