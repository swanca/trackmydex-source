import { describe, expect, it } from 'vitest';
import { estimateCardGrade } from '@/lib/grade/card-grade';
import type { CardInspection } from '@/lib/grade/card-inspection';

function inspection(overrides: Partial<CardInspection> = {}): CardInspection {
  return {
    quality: { accepted: true, reasons: [] },
    centering: {
      status: 'measured', horizontal: [55, 45], vertical: [52, 48],
      bordersPx: { left: 11, right: 9, top: 13, bottom: 12 },
    },
    anomalies: [],
    surface: { status: 'unassessable', reason: 'angled light required' },
    ...overrides,
  };
}

describe('estimateCardGrade', () => {
  it('returns half-point category scores and a conservative 9.5 ceiling', () => {
    const grade = estimateCardGrade(inspection(), inspection({
      centering: { status: 'measured', horizontal: [57.5, 42.5], vertical: [50, 50] },
    }));

    expect(grade).toMatchObject({
      overall: 9.5,
      label: 'Mint',
      scores: { centering: 9.5, corners: 10, edges: 10, surface: 9.5 },
      confidence: 'limited',
    });
  });

  it('lets visible corner and edge candidates cap the overall grade', () => {
    const grade = estimateCardGrade(inspection(), inspection({
      anomalies: [
        { kind: 'white-mark-candidate', assessment: 'needs-review', region: 'corner', x: 0, y: 0, width: .01, height: .01, pixels: 4 },
        { kind: 'white-mark-candidate', assessment: 'needs-review', region: 'corner', x: .9, y: 0, width: .01, height: .01, pixels: 5 },
        { kind: 'white-mark-candidate', assessment: 'needs-review', region: 'edge', x: .5, y: 0, width: .01, height: .01, pixels: 5 },
      ],
    }));

    expect(grade?.scores.corners).toBe(9);
    expect(grade?.scores.edges).toBe(9.5);
    expect(grade?.overall).toBe(9);
  });

  it('abstains when photo quality or centering is not measurable', () => {
    expect(estimateCardGrade(inspection({ quality: { accepted: false, reasons: ['blur'] } }), inspection())).toBeNull();
    expect(estimateCardGrade(inspection({ centering: { status: 'unassessable', reason: 'border' } }), inspection())).toBeNull();
  });
});
