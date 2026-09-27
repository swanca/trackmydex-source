/**
 * Small, dependency-free image-quality measurements used by the pre-grade.
 *
 * The input is already a downscaled greyscale buffer. Keeping this separate
 * from sharp makes the scoring deterministic and easy to validate with small
 * fixtures. These signals describe the photograph, not the card's condition.
 */

export interface GrayImage {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ImageQualitySignals {
  meanLuma: number;
  lumaStdDev: number;
  /** Mean absolute horizontal/vertical pixel difference, 0..255. */
  edgeEnergy: number;
  /** Proportion of pixels at or above 250, 0..1. */
  clippedHighlights: number;
  /** Proportion of pixels at or below 5, 0..1. */
  clippedShadows: number;
}

export function measureImageQuality(image: GrayImage): ImageQualitySignals {
  const size = image.width * image.height;
  if (size <= 0 || image.data.length < size) {
    return {
      meanLuma: 0,
      lumaStdDev: 0,
      edgeEnergy: 0,
      clippedHighlights: 1,
      clippedShadows: 1,
    };
  }

  let sum = 0;
  let squared = 0;
  let highlights = 0;
  let shadows = 0;
  for (let index = 0; index < size; index++) {
    const value = image.data[index] ?? 0;
    sum += value;
    squared += value * value;
    if (value >= 250) highlights++;
    if (value <= 5) shadows++;
  }

  let edgeSum = 0;
  let edgeCount = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const index = y * image.width + x;
      const value = image.data[index] ?? 0;
      if (x + 1 < image.width) {
        edgeSum += Math.abs(value - (image.data[index + 1] ?? 0));
        edgeCount++;
      }
      if (y + 1 < image.height) {
        edgeSum += Math.abs(value - (image.data[index + image.width] ?? 0));
        edgeCount++;
      }
    }
  }

  const meanLuma = sum / size;
  return {
    meanLuma,
    lumaStdDev: Math.sqrt(Math.max(0, squared / size - meanLuma ** 2)),
    edgeEnergy: edgeCount > 0 ? edgeSum / edgeCount : 0,
    clippedHighlights: highlights / size,
    clippedShadows: shadows / size,
  };
}
