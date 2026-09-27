/**
 * Conservative photo-quality pre-grade.
 *
 * This is intentionally a screening score, not a PSA prediction. It measures
 * the signals we can validate server-side without silently shipping a model
 * or sending card photos to a third party. A future model can replace this
 * function while keeping the same response contract and abstention behaviour.
 */

export type PregradeBand = 'retake' | 'review' | 'promising';
export type PregradeConfidence = 'low' | 'medium' | 'high';

export interface PregradeSignals {
  width: number;
  height: number;
  aspectRatio: number;
  meanLuma: number;
  lumaStdDev: number;
  /** Optional measurements from the decoded pixels. Kept optional for API compatibility. */
  edgeEnergy?: number;
  clippedHighlights?: number;
  clippedShadows?: number;
}

export interface PregradeResult {
  score: number;
  band: PregradeBand;
  confidence: PregradeConfidence;
  flags: string[];
}

const CARD_RATIO = 63 / 88;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function estimatePregrade(signals: PregradeSignals): PregradeResult {
  let score = 6;
  const flags: string[] = [];
  const ratioError = Math.abs(signals.aspectRatio - CARD_RATIO) / CARD_RATIO;

  if (ratioError <= 0.08) score += 1.4;
  else if (ratioError <= 0.16) score += 0.2;
  else {
    score -= 1.8;
    flags.push('framing');
  }

  const shortSide = Math.min(signals.width, signals.height);
  if (shortSide >= 1000) score += 1.2;
  else if (shortSide >= 650) score += 0.5;
  else {
    score -= 1.8;
    flags.push('resolution');
  }

  if (signals.meanLuma < 35) {
    score -= 1.6;
    flags.push('too-dark');
  } else if (signals.meanLuma > 235) {
    score -= 1.2;
    flags.push('glare');
  } else if (signals.meanLuma >= 70 && signals.meanLuma <= 205) {
    score += 0.4;
  }

  if (signals.lumaStdDev < 12) {
    score -= 0.8;
    flags.push('low-detail');
  }

  // A low average pixel difference is a useful blur/defocus warning. It is
  // deliberately a small penalty: a clean, flat card can legitimately have
  // little local contrast, so this must never be presented as a card defect.
  if (signals.edgeEnergy !== undefined) {
    if (signals.edgeEnergy < 5) {
      score -= 1.1;
      flags.push('soft-focus');
    } else if (signals.edgeEnergy >= 18) {
      score += 0.25;
    }
  }

  if (signals.clippedHighlights !== undefined && signals.clippedHighlights > 0.08) {
    score -= 1.2;
    flags.push('glare');
  }
  if (signals.clippedShadows !== undefined && signals.clippedShadows > 0.18) {
    score -= 0.8;
    flags.push('blocked-shadows');
  }

  const uniqueFlags = [...new Set(flags)];
  const confidence: PregradeConfidence =
    shortSide < 500 || ratioError > 0.22 || uniqueFlags.length >= 3
      ? 'low'
      : shortSide >= 1000 && ratioError <= 0.08 && uniqueFlags.length === 0
        ? 'medium'
        : 'low';
  const bounded = Math.round(clamp(score, 1, 10) * 10) / 10;
  const band: PregradeBand = bounded < 5.5 || confidence === 'low' ? 'retake' : bounded < 7.5 ? 'review' : 'promising';

  return { score: bounded, band, confidence, flags: uniqueFlags };
}
