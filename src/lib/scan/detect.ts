/**
 * Finding cards in a photo.
 *
 * This is the step that decides whether multi-card scanning works at all.
 * Published results for hashing a whole frame that contains several cards are
 * blunt: accuracy is approximately zero, because the hash then describes the
 * table rather than any one card. Each card has to be isolated and
 * perspective-corrected *before* it is hashed.
 *
 * Rather than ship OpenCV (a multi-megabyte WASM download on a phone) this uses
 * a small purpose-built detector. It can assume far more than a general vision
 * library: Pokemon cards are high-contrast rectangles of a known aspect ratio
 * (63x88mm, 0.716) laid on a contrasting surface.
 *
 * The pipeline:
 *   1. downscale and convert to luma
 *   2. Sobel edge magnitude, then threshold
 *   3. flood-fill connected regions of *non*-edge interior
 *   4. keep regions whose bounding box matches card proportions
 *   5. return boxes in original-image coordinates
 *
 * It is not scale-invariant magic - it wants cards that do not overlap, on a
 * background that differs from the card border. The UI says so, and always
 * offers single-card framing as the reliable path.
 */

export interface DetectedCard {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0..1 confidence from how closely the box matches card proportions. */
  score: number;
}

/** 63mm x 88mm. Portrait cards; the detector rejects landscape boxes. */
const CARD_ASPECT = 63 / 88;
const ASPECT_TOLERANCE = 0.18;

/** Work at this width regardless of camera resolution, for predictable cost. */
const WORK_WIDTH = 420;

export interface DetectOptions {
  /** Smallest card, as a fraction of frame area. Filters out noise. */
  minAreaRatio?: number;
  maxCards?: number;
}

export function detectCards(
  image: ImageData,
  options: DetectOptions = {},
): DetectedCard[] {
  const { minAreaRatio = 0.012, maxCards = 12 } = options;

  const scale = image.width > WORK_WIDTH ? WORK_WIDTH / image.width : 1;
  const w = Math.max(16, Math.round(image.width * scale));
  const h = Math.max(16, Math.round(image.height * scale));

  // 1. Downscale to luma.
  const luma = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(image.height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(image.width - 1, Math.floor(x / scale));
      const i = (sy * image.width + sx) * 4;
      luma[y * w + x] =
        0.299 * (image.data[i] ?? 0) +
        0.587 * (image.data[i + 1] ?? 0) +
        0.114 * (image.data[i + 2] ?? 0);
    }
  }

  // 2. Sobel magnitude.
  const edges = new Uint8Array(w * h);
  let edgeSum = 0;
  const magnitudes = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -(luma[i - w - 1] ?? 0) - 2 * (luma[i - 1] ?? 0) - (luma[i + w - 1] ?? 0) +
        (luma[i - w + 1] ?? 0) + 2 * (luma[i + 1] ?? 0) + (luma[i + w + 1] ?? 0);
      const gy =
        -(luma[i - w - 1] ?? 0) - 2 * (luma[i - w] ?? 0) - (luma[i - w + 1] ?? 0) +
        (luma[i + w - 1] ?? 0) + 2 * (luma[i + w] ?? 0) + (luma[i + w + 1] ?? 0);
      const magnitude = Math.hypot(gx, gy);
      magnitudes[i] = magnitude;
      edgeSum += magnitude;
    }
  }

  // Adaptive threshold: a fixed one fails on both a dim room and a bright desk.
  const threshold = Math.max(40, (edgeSum / (w * h)) * 1.7);
  for (let i = 0; i < magnitudes.length; i++) {
    edges[i] = (magnitudes[i] ?? 0) > threshold ? 1 : 0;
  }

  // 3. Flood fill non-edge regions. A card's interior is a large connected
  //    blob bounded by the strong edge of its border.
  const labels = new Int32Array(w * h).fill(-1);
  const boxes: DetectedCard[] = [];
  const stack: number[] = [];
  const frameArea = w * h;

  for (let start = 0; start < labels.length; start++) {
    if (edges[start] === 1 || labels[start] !== -1) continue;

    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    let area = 0;

    stack.push(start);
    labels[start] = start;

    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % w;
      const y = (index - x) / w;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      // 4-connectivity is enough and halves the work of 8.
      if (x > 0 && edges[index - 1] === 0 && labels[index - 1] === -1) {
        labels[index - 1] = start;
        stack.push(index - 1);
      }
      if (x < w - 1 && edges[index + 1] === 0 && labels[index + 1] === -1) {
        labels[index + 1] = start;
        stack.push(index + 1);
      }
      if (y > 0 && edges[index - w] === 0 && labels[index - w] === -1) {
        labels[index - w] = start;
        stack.push(index - w);
      }
      if (y < h - 1 && edges[index + w] === 0 && labels[index + w] === -1) {
        labels[index + w] = start;
        stack.push(index + w);
      }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const boxArea = boxWidth * boxHeight;
    if (boxArea / frameArea < minAreaRatio) continue;

    // 4. Keep only card-shaped boxes that the blob actually fills - a blob
    //    spanning two cards has a bounding box it does not fill, and a blob of
    //    background is rarely 0.716 aspect.
    const aspect = boxWidth / boxHeight;
    const aspectError = Math.abs(aspect - CARD_ASPECT) / CARD_ASPECT;
    if (aspectError > ASPECT_TOLERANCE) continue;

    const fill = area / boxArea;
    if (fill < 0.55) continue;

    boxes.push({
      x: Math.round(minX / scale),
      y: Math.round(minY / scale),
      width: Math.round(boxWidth / scale),
      height: Math.round(boxHeight / scale),
      score: Math.max(0, 1 - aspectError / ASPECT_TOLERANCE) * fill,
    });
  }

  // 5. Largest and best-shaped first; drop boxes contained in another.
  boxes.sort((a, b) => b.width * b.height - a.width * a.height);
  const kept: DetectedCard[] = [];
  for (const box of boxes) {
    const overlapped = kept.some(
      (other) =>
        box.x >= other.x - 4 &&
        box.y >= other.y - 4 &&
        box.x + box.width <= other.x + other.width + 4 &&
        box.y + box.height <= other.y + other.height + 4,
    );
    if (!overlapped) kept.push(box);
    if (kept.length >= maxCards) break;
  }

  return kept;
}

/**
 * The whole frame, used when detection finds nothing.
 *
 * If the user has framed a single card to fill the viewfinder - which the UI
 * asks them to do - the frame *is* the card, and refusing to scan would be
 * unhelpful pedantry.
 */
export function wholeFrame(image: ImageData): DetectedCard {
  return { x: 0, y: 0, width: image.width, height: image.height, score: 0.4 };
}
