import type { DetectedCard } from './detect';

/**
 * Is the card well enough framed to be worth identifying?
 *
 * The scanner already captured automatically, but it fingerprinted and posted
 * a frame every 900ms no matter what the camera was looking at. That is why it
 * only worked with the phone almost touching the card: from further away the
 * artwork crop is a handful of pixels wide, its hash is noise, and the miss
 * looks to the user like the feature not working.
 *
 * Deciding here, on-device and before any hashing, does two things: it tells
 * the person what to change - almost always "get closer" - and it stops the
 * scanner wasting a request on a frame that cannot succeed.
 */

export type FramingState =
  /** Nothing card-shaped in view. */
  | 'searching'
  /** Found one, but too small in frame to hash reliably. */
  | 'closer'
  /** Filling so much of the frame that the edges are likely cut off. */
  | 'farther'
  /** Good. Hash it. */
  | 'ready';

/**
 * Share of the frame a card should occupy.
 *
 * The lower bound is the important one. At 420px working width the detector
 * gives a box roughly `sqrt(area)` across; below about a sixth of the frame
 * the artwork region is under 100px wide, which is where perceptual hashing
 * starts returning the wrong card rather than no card.
 */
const MIN_AREA = 0.16;
const MAX_AREA = 0.94;

/** Below this proportion match it is a rectangle, but probably not a card. */
const MIN_SCORE = 0.3;

export interface Framing {
  state: FramingState;
  /** The box the guidance is about, if one was found. */
  box: DetectedCard | null;
  /** How much of the frame it fills, 0..1. Useful for a progress ring. */
  fill: number;
}

export function assessFraming(
  boxes: readonly DetectedCard[],
  frameWidth: number,
  frameHeight: number,
): Framing {
  const frameArea = Math.max(1, frameWidth * frameHeight);

  // Judge on the largest plausible card: with several in shot, the closest
  // one is the one the person is pointing at.
  let best: DetectedCard | null = null;
  let bestArea = 0;
  for (const box of boxes) {
    if (box.score < MIN_SCORE) continue;
    const area = box.width * box.height;
    if (area > bestArea) {
      best = box;
      bestArea = area;
    }
  }

  if (!best) return { state: 'searching', box: null, fill: 0 };

  const fill = bestArea / frameArea;
  if (fill < MIN_AREA) return { state: 'closer', box: best, fill };
  if (fill > MAX_AREA) return { state: 'farther', box: best, fill };
  return { state: 'ready', box: best, fill };
}

/**
 * How many consecutive good frames before the shutter fires.
 *
 * One is too eager: a card swinging through the frame passes "ready" on its
 * way past, and the scanner would grab it mid-blur. Two consecutive reads
 * roughly a third of a second apart mean the phone has actually settled.
 */
export const READY_FRAMES = 2;
