import type { DetectedCard } from './detect';

interface PixelFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface CaptureQuality {
  acceptable: boolean;
  edgeScore: number;
  darkRatio: number;
  brightRatio: number;
}

/**
 * Cheap camera-frame quality gate. It is deliberately conservative: a missed
 * frame is retried a fraction of a second later, while a blurred auto-capture
 * wastes the user's time and produces a poor perceptual hash.
 */
export function measureCaptureQuality(frame: PixelFrame, box: DetectedCard): CaptureQuality {
  const left = Math.max(1, Math.floor(box.x + box.width * 0.08));
  const right = Math.min(frame.width - 2, Math.ceil(box.x + box.width * 0.92));
  const top = Math.max(1, Math.floor(box.y + box.height * 0.08));
  const bottom = Math.min(frame.height - 2, Math.ceil(box.y + box.height * 0.92));
  const step = Math.max(1, Math.floor(Math.min(box.width, box.height) / 90));
  let samples = 0;
  let dark = 0;
  let bright = 0;
  let edges = 0;

  const luma = (x: number, y: number) => {
    const offset = (y * frame.width + x) * 4;
    return (frame.data[offset] ?? 0) * 0.299
      + (frame.data[offset + 1] ?? 0) * 0.587
      + (frame.data[offset + 2] ?? 0) * 0.114;
  };

  for (let y = top; y <= bottom; y += step) {
    for (let x = left; x <= right; x += step) {
      const value = luma(x, y);
      if (value < 18) dark++;
      if (value > 246) bright++;
      edges += Math.abs(value - luma(Math.min(right, x + step), y));
      edges += Math.abs(value - luma(x, Math.min(bottom, y + step)));
      samples++;
    }
  }

  const safeSamples = Math.max(1, samples);
  const edgeScore = edges / (safeSamples * 2);
  const darkRatio = dark / safeSamples;
  const brightRatio = bright / safeSamples;
  return {
    acceptable: samples > 100 && edgeScore >= 6 && darkRatio < 0.28 && brightRatio < 0.28,
    edgeScore,
    darkRatio,
    brightRatio,
  };
}

/** Compare movement in frame-relative coordinates so all camera sizes behave alike. */
export function isDetectionStable(
  previous: DetectedCard,
  current: DetectedCard,
  frameWidth: number,
  frameHeight: number,
): boolean {
  const previousCenterX = previous.x + previous.width / 2;
  const previousCenterY = previous.y + previous.height / 2;
  const currentCenterX = current.x + current.width / 2;
  const currentCenterY = current.y + current.height / 2;
  const movement = Math.hypot(
    (currentCenterX - previousCenterX) / Math.max(1, frameWidth),
    (currentCenterY - previousCenterY) / Math.max(1, frameHeight),
  );
  const previousArea = Math.max(1, previous.width * previous.height);
  const areaChange = Math.abs(current.width * current.height - previousArea) / previousArea;
  return movement <= 0.025 && areaChange <= 0.1;
}
