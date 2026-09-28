import { describe, expect, it } from 'vitest';
import { inspectCardPixels } from '../src/lib/grade/card-inspection';

function card(left = 12, right = 12, top = 14, bottom = 14) {
  const width = 210, height = 294, rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rgb.set(x < left || x >= width - right || y < top || y >= height - bottom ? [30, 60, 160] : [160, 110, 60], (y * width + x) * 3);
  return { rgb, width, height, side: 'back' as const };
}

describe('rectified card pixel inspection', () => {
  it('measures clean uniform border without manufacturing grade or damage', () => {
    const result = inspectCardPixels(card());
    expect(result.quality.accepted).toBe(true);
    expect(result.centering.horizontal).toEqual([50, 50]);
    expect(result.centering.vertical).toEqual([50, 50]);
    expect(result.anomalies).toEqual([]);
    expect(result.surface.status).toBe('unassessable');
  });
  it('measures deliberate off-centering independently on both axes', () => {
    const result = inspectCardPixels(card(8, 16, 10, 20));
    expect(result.centering.bordersPx).toEqual({ left: 8, right: 16, top: 10, bottom: 20 });
    expect(result.centering.horizontal?.[0]).toBeCloseTo(100 / 3);
    expect(result.centering.vertical?.[0]).toBeCloseTo(100 / 3);
  });
  it('locates candidate corner whitening and edge chips on blue back', () => {
    const input = card();
    for (const [x, y] of [[2, 3], [3, 3], [2, 4], [3, 4], [2, 140], [3, 140], [2, 141], [3, 141]] as [number, number][]) input.rgb.set([230, 230, 230], (y * input.width + x) * 3);
    const result = inspectCardPixels(input);
    expect(result.anomalies.map(mark => mark.region)).toEqual(['corner', 'edge']);
    expect(result.anomalies[0]!.x).toBeCloseTo(2 / input.width);
    expect(result.anomalies[0]!.pixels).toBe(4);
  });
  it('abstains on textured full-art borders', () => {
    const input = card();
    for (let y = 0; y < input.height; y++) for (let x = 0; x < input.width; x++) input.rgb.set((x + y) % 2 ? [60, 120, 180] : [160, 80, 30], (y * input.width + x) * 3);
    expect(inspectCardPixels(input).centering.status).toBe('unassessable');
  });
  it('rejects low resolution and clipped exposure', () => {
    expect(inspectCardPixels({ rgb: new Uint8Array(30), width: 2, height: 5, side: 'front' }).quality.accepted).toBe(false);
    const input = card(); input.rgb.fill(255);
    expect(inspectCardPixels(input).quality.accepted).toBe(false);
  });
  it('does not treat front white print as back damage', () => {
    const input = card(); input.rgb.set([230, 230, 230], 3);
    expect(inspectCardPixels({ ...input, side: 'front' }).anomalies).toEqual([]);
  });
  it('compares measured centering tolerance without predicting a grade', () => {
    const input = card(8, 16, 10, 20);
    expect(inspectCardPixels(input).centering.psa10CenteringTolerance?.withinTolerance).toBe(true);
    expect(inspectCardPixels({ ...input, side: 'front' }).centering.psa10CenteringTolerance?.withinTolerance).toBe(false);
  });
  it('abstains when back crop includes uniform background instead of blue border', () => {
    const input = card();
    for (let y = 0; y < input.height; y++) for (let x = 0; x < input.width; x++) {
      if (x < 12 || x >= input.width - 12 || y < 14 || y >= input.height - 14) input.rgb.set([150, 150, 150], (y * input.width + x) * 3);
    }
    expect(inspectCardPixels(input).centering.status).toBe('unassessable');
  });
  it('does not report comfortably within tolerance at a threshold boundary', () => {
    const result = inspectCardPixels({ ...card(11, 9), side: 'front' });
    expect(result.centering.horizontal).toEqual([55, 45]);
    expect(result.centering.psa10CenteringTolerance?.withinTolerance).toBe(false);
    expect(result.centering.psa10CenteringTolerance?.uncertaintyPercent).toBe(5);
  });
  it('rejects a deliberately blurred border instead of confidently measuring it', () => {
    const input = card();
    const original = input.rgb.slice();
    const radius = 7;
    for (let y = 0; y < input.height; y++) for (let x = 0; x < input.width; x++) {
      const sum = [0, 0, 0]; let count = 0;
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const xx = Math.max(0, Math.min(input.width - 1, x + dx)), yy = Math.max(0, Math.min(input.height - 1, y + dy));
        for (let channel = 0; channel < 3; channel++) sum[channel] = sum[channel]! + original[(yy * input.width + xx) * 3 + channel]!;
        count++;
      }
      input.rgb.set(sum.map(value => Math.round(value / count)), (y * input.width + x) * 3);
    }
    const result = inspectCardPixels(input);
    expect(result.quality.accepted).toBe(false);
    expect(result.quality.reasons.some(reason => reason.includes('blur'))).toBe(true);
    expect(result.centering.status).toBe('unassessable');
  });
});
