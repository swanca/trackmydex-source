import { describe, expect, it } from 'vitest';
import { measureImageQuality } from '@/lib/grade/image-quality';

describe('image quality measurements', () => {
  it('detects clipping and local contrast without relying on sharp', () => {
    const data = new Uint8Array([
      0, 0, 0, 0,
      255, 255, 255, 255,
      20, 220, 20, 220,
    ]);
    const result = measureImageQuality({ data, width: 4, height: 3 });

    expect(result.clippedShadows).toBeCloseTo(4 / 12);
    expect(result.clippedHighlights).toBeCloseTo(4 / 12);
    expect(result.edgeEnergy).toBeGreaterThan(0);
  });

  it('does not invent detail for a flat frame', () => {
    const result = measureImageQuality({ data: new Uint8Array(16).fill(128), width: 4, height: 4 });

    expect(result.meanLuma).toBe(128);
    expect(result.lumaStdDev).toBe(0);
    expect(result.edgeEnergy).toBe(0);
  });
});
