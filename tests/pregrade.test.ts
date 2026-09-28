import { describe, expect, it } from 'vitest';
import { estimatePregrade } from '@/lib/grade/pregrade';

describe('photo pre-grade estimator', () => {
  it('rewards a sharp, well-framed card photo without claiming a PSA grade', () => {
    const result = estimatePregrade({
      width: 1600,
      height: 2200,
      aspectRatio: 1600 / 2200,
      meanLuma: 128,
      lumaStdDev: 48,
    });

    expect(result.score).toBeGreaterThanOrEqual(7);
    expect(result.band).toBe('promising');
    expect(result.confidence).toBe('medium');
  });

  it('abstains when the photo is too small or badly framed', () => {
    const result = estimatePregrade({
      width: 320,
      height: 320,
      aspectRatio: 1,
      meanLuma: 8,
      lumaStdDev: 4,
    });

    expect(result.score).toBeLessThan(5);
    expect(result.band).toBe('retake');
    expect(result.confidence).toBe('low');
    expect(result.flags.length).toBeGreaterThan(1);
  });

  it('penalises blur and clipped light while keeping the result a photo check', () => {
    const result = estimatePregrade({
      width: 1600,
      height: 2200,
      aspectRatio: 1600 / 2200,
      meanLuma: 128,
      lumaStdDev: 20,
      edgeEnergy: 2,
      clippedHighlights: 0.2,
      clippedShadows: 0.25,
    });

    expect(result.flags).toEqual(expect.arrayContaining(['soft-focus', 'glare', 'blocked-shadows']));
    expect(result.score).toBeLessThan(7.5);
  });
});
