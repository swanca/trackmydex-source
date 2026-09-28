import { describe, expect, it } from 'vitest';
import { projectObjectCoverBox } from '@/lib/scan/viewport';

describe('scanner guide projection', () => {
  it('accounts for the vertically cropped part of a portrait camera feed', () => {
    const projected = projectObjectCoverBox(
      { x: 64, y: 220, width: 512, height: 716 },
      { width: 640, height: 1138 },
      { width: 394, height: 525 },
    );

    expect(projected?.left).toBeCloseTo(39.4);
    expect(projected?.top).toBeCloseTo(47.646875);
    expect(projected?.width).toBeCloseTo(315.2);
    expect(projected?.height).toBeCloseTo(440.7875);
  });

  it('accounts for horizontally cropped landscape video', () => {
    const projected = projectObjectCoverBox(
      { x: 480, y: 90, width: 960, height: 900 },
      { width: 1920, height: 1080 },
      { width: 400, height: 500 },
    );

    expect(projected?.left).toBeCloseTo(-22.22222222222223);
    expect(projected?.top).toBeCloseTo(41.66666666666667);
    expect(projected?.width).toBeCloseTo(444.44444444444446);
    expect(projected?.height).toBeCloseTo(416.6666666666667);
  });

  it('returns null for missing geometry instead of drawing a misleading guide', () => {
    expect(projectObjectCoverBox(
      { x: 0, y: 0, width: 10, height: 10 },
      { width: 0, height: 100 },
      { width: 300, height: 400 },
    )).toBeNull();
  });
});
