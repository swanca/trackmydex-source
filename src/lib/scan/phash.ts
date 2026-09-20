/**
 * Perceptual hashing for card recognition.
 *
 * Shared deliberately between the indexer (Node, pixels from sharp) and the
 * scanner (browser, pixels from a canvas). Both must produce bit-identical
 * hashes or matching silently fails, so the algorithm lives in one pure
 * function over raw RGBA and neither side reimplements it.
 *
 * ## Why this design
 *
 * Published benchmarks for 64-bit pHash over a whole Pokemon card report ~70%
 * rank-1 accuracy and a ~26% hash-collision rate on standard-layout cards. The
 * reason is that most of a card is layout - the same frame, the same text
 * boxes, the same energy symbols - so a hash of the whole card mostly encodes
 * "this is a Pokemon card".
 *
 * Two changes address that:
 *
 *  1. **Hash the artwork window, not the card.** The illustration occupies a
 *     consistent rectangle near the top of every modern and classic layout.
 *     Cropping to it throws away the shared furniture and keeps the part that
 *     actually differs between cards.
 *  2. **128 bits, from two independent hashes.** A 64-bit DCT pHash captures
 *     structure; a 64-bit difference hash captures local gradients. Errors are
 *     largely uncorrelated, so concatenating them roughly squares the odds of a
 *     false collision while keeping matching a single integer popcount.
 *
 * Even so, recognition is a *shortlist* generator. The UI always confirms.
 */

/** Fraction of the card height occupied by the illustration window. */
export const ARTWORK_CROP = { top: 0.11, bottom: 0.56, left: 0.08, right: 0.92 } as const;

export const HASH_BITS = 128;

export interface Rgba {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

/** Rec. 601 luma. Matches what both canvas and sharp produce for greyscale. */
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Crops to the artwork window and resamples to `size` x `size` greyscale using
 * box averaging, which is stable against the resolution differences between a
 * catalogue thumbnail and a phone photo.
 */
export function toGreyscaleGrid(image: Rgba, size: number, crop = ARTWORK_CROP): Float64Array {
  const x0 = Math.floor(image.width * crop.left);
  const x1 = Math.max(x0 + 1, Math.floor(image.width * crop.right));
  const y0 = Math.floor(image.height * crop.top);
  const y1 = Math.max(y0 + 1, Math.floor(image.height * crop.bottom));

  const regionWidth = x1 - x0;
  const regionHeight = y1 - y0;
  const out = new Float64Array(size * size);

  for (let gy = 0; gy < size; gy++) {
    const sy0 = y0 + Math.floor((gy * regionHeight) / size);
    const sy1 = Math.max(sy0 + 1, y0 + Math.floor(((gy + 1) * regionHeight) / size));

    for (let gx = 0; gx < size; gx++) {
      const sx0 = x0 + Math.floor((gx * regionWidth) / size);
      const sx1 = Math.max(sx0 + 1, x0 + Math.floor(((gx + 1) * regionWidth) / size));

      let sum = 0;
      let count = 0;
      for (let y = sy0; y < sy1; y++) {
        const row = y * image.width * 4;
        for (let x = sx0; x < sx1; x++) {
          const i = row + x * 4;
          sum += luma(image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0);
          count++;
        }
      }
      out[gy * size + gx] = count > 0 ? sum / count : 0;
    }
  }

  return out;
}

/** In-place 1-D DCT-II, applied per row then per column. */
function dct1d(values: Float64Array, n: number, stride: number, offset: number) {
  const result = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += (values[offset + i * stride] ?? 0) * Math.cos(((2 * i + 1) * k * Math.PI) / (2 * n));
    }
    result[k] = sum * (k === 0 ? Math.SQRT1_2 : 1);
  }
  for (let k = 0; k < n; k++) values[offset + k * stride] = result[k] ?? 0;
}

/**
 * 64-bit DCT perceptual hash.
 *
 * Standard construction: 32x32 greyscale, 2-D DCT, keep the top-left 8x8
 * low-frequency block (minus the DC term, which only encodes brightness), and
 * threshold each coefficient against the median.
 */
export function pHash64(image: Rgba, crop = ARTWORK_CROP): bigint {
  const size = 32;
  const grid = toGreyscaleGrid(image, size, crop);

  for (let y = 0; y < size; y++) dct1d(grid, size, 1, y * size);
  for (let x = 0; x < size; x++) dct1d(grid, size, size, x);

  const coefficients: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (x === 0 && y === 0) continue; // DC term: brightness, not structure.
      coefficients.push(grid[y * size + x] ?? 0);
    }
  }

  const sorted = [...coefficients].sort((a, b) => a - b);
  const median = (sorted[31]! + sorted[32]!) / 2;

  let hash = 0n;
  // 63 coefficients plus a leading zero keeps this exactly 64 bits.
  hash = (hash << 1n) | 0n;
  for (const value of coefficients) {
    hash = (hash << 1n) | (value > median ? 1n : 0n);
  }
  return BigInt.asUintN(64, hash);
}

/**
 * 64-bit difference hash: compares each pixel to its right-hand neighbour on a
 * 9x8 grid. Cheap, and it fails on different inputs than the DCT hash, which is
 * the point of pairing them.
 */
export function dHash64(image: Rgba, crop = ARTWORK_CROP): bigint {
  const width = 9;
  const height = 8;
  const x0 = Math.floor(image.width * crop.left);
  const x1 = Math.max(x0 + 1, Math.floor(image.width * crop.right));
  const y0 = Math.floor(image.height * crop.top);
  const y1 = Math.max(y0 + 1, Math.floor(image.height * crop.bottom));
  const regionWidth = x1 - x0;
  const regionHeight = y1 - y0;

  const cells = new Float64Array(width * height);
  for (let gy = 0; gy < height; gy++) {
    const sy = y0 + Math.floor(((gy + 0.5) * regionHeight) / height);
    for (let gx = 0; gx < width; gx++) {
      const sx = x0 + Math.floor(((gx + 0.5) * regionWidth) / width);
      const i = (sy * image.width + sx) * 4;
      cells[gy * width + gx] = luma(
        image.data[i] ?? 0,
        image.data[i + 1] ?? 0,
        image.data[i + 2] ?? 0,
      );
    }
  }

  let hash = 0n;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const left = cells[y * width + x] ?? 0;
      const right = cells[y * width + x + 1] ?? 0;
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return BigInt.asUintN(64, hash);
}

/** The stored fingerprint: pHash in the high 64 bits, dHash in the low 64. */
export function fingerprint(image: Rgba, crop = ARTWORK_CROP): string {
  const high = pHash64(image, crop);
  const low = dHash64(image, crop);
  return ((high << 64n) | low).toString(16).padStart(32, '0');
}

export function parseFingerprint(hex: string): bigint {
  return BigInt(`0x${hex}`);
}

const POPCOUNT_TABLE = (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) table[i] = (i & 1) + (table[i >> 1] ?? 0);
  return table;
})();

/** Hamming distance between two 128-bit fingerprints, 0..128. */
export function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let distance = 0;
  while (xor > 0n) {
    distance += POPCOUNT_TABLE[Number(xor & 0xffn)] ?? 0;
    xor >>= 8n;
  }
  return distance;
}

/**
 * Thresholds, tuned to the shape of the problem rather than to a benchmark:
 *
 *  - `MAX_DISTANCE` is the furthest a candidate can be and still be shown.
 *  - `CONFIDENT_DISTANCE` plus `MIN_MARGIN` is what lets the UI pre-select a
 *    result. The margin matters more than the distance: a card that is 10 away
 *    when the runner-up is 40 is a safer call than one that is 6 away when the
 *    runner-up is 7.
 */
export const MATCH = {
  MAX_DISTANCE: 34,
  CONFIDENT_DISTANCE: 18,
  MIN_MARGIN: 10,
  SHORTLIST: 12,
} as const;
