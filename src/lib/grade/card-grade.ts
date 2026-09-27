import type { CardInspection } from './card-inspection';

export interface EstimatedCardGrade {
  overall: number;
  label: 'Gem Mint' | 'Mint' | 'Near Mint-Mint' | 'Near Mint' | 'Excellent' | 'Good' | 'Poor';
  scores: { centering: number; corners: number; edges: number; surface: number };
  confidence: 'limited';
  limitations: string[];
}

/**
 * Conservative photo estimate, not a PSA grade. Flat front/back photos can
 * measure alignment and flag visible whitening, but cannot certify texture,
 * dents or fine scratches. That uncertainty caps the estimate at 9.5.
 */
export function estimateCardGrade(
  front: CardInspection,
  back: CardInspection,
): EstimatedCardGrade | null {
  if (!front.quality.accepted || !back.quality.accepted) return null;
  if (front.centering.status !== 'measured' || back.centering.status !== 'measured') return null;

  const ratios = [
    ...(front.centering.horizontal ?? []), ...(front.centering.vertical ?? []),
    ...(back.centering.horizontal ?? []), ...(back.centering.vertical ?? []),
  ];
  if (ratios.length !== 8 || ratios.some((value) => !Number.isFinite(value))) return null;
  const worstDeviation = Math.max(...ratios.map((value) => Math.abs(value - 50)));
  const centering = half(10 - Math.max(0, worstDeviation - 5) / 5);
  const corners = half(10 - back.anomalies.filter((mark) => mark.region === 'corner').length * .5);
  const edges = half(10 - back.anomalies.filter((mark) => mark.region === 'edge').length * .5);
  const surface = 9.5;
  const overall = Math.min(9.5, centering, corners, edges, surface);

  return {
    overall,
    label: gradeLabel(overall),
    scores: { centering, corners, edges, surface },
    confidence: 'limited',
    limitations: ['surface-not-verified-under-angled-light', 'white-marks-require-visual-confirmation'],
  };
}

function half(value: number): number {
  return Math.max(0, Math.min(10, Math.round(value * 2) / 2));
}

function gradeLabel(score: number): EstimatedCardGrade['label'] {
  if (score === 10) return 'Gem Mint';
  if (score >= 9) return 'Mint';
  if (score >= 8) return 'Near Mint-Mint';
  if (score >= 7) return 'Near Mint';
  if (score >= 5) return 'Excellent';
  if (score >= 3) return 'Good';
  return 'Poor';
}
