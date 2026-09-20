import type { Condition, SealedState } from '@/db/schema/enums';

/**
 * Condition multipliers.
 *
 * No free price feed resolves prices by condition: Cardmarket's published
 * aggregates describe the product, which in practice tracks near-mint supply.
 * Rather than pretend otherwise, we apply an explicit, documented multiplier and
 * mark the resulting value approximate.
 *
 * These are conservative mid-market rules of thumb, not measurements. They are
 * intentionally in one small file so a self-hoster can tune them, and the UI
 * always discloses that a condition adjustment was applied.
 */
export const CONDITION_MULTIPLIERS: Record<Condition, number> = {
  mint: 1.05,
  near_mint: 1.0,
  excellent: 0.85,
  good: 0.7,
  light_played: 0.55,
  played: 0.4,
  poor: 0.2,
};

/** Conditions in descending quality order, for pickers and sorting. */
export const CONDITIONS_ORDERED: readonly Condition[] = [
  'mint',
  'near_mint',
  'excellent',
  'good',
  'light_played',
  'played',
  'poor',
];

/** The reference condition a raw market price is assumed to describe. */
export const BASELINE_CONDITION: Condition = 'near_mint';

export function conditionMultiplier(condition: Condition): number {
  return CONDITION_MULTIPLIERS[condition];
}

/**
 * Adjust a market price for wear.
 *
 * Returns the adjusted amount plus whether the result is still an exact reading.
 * Only the baseline condition passes through untouched.
 */
export function applyCondition(
  amount: number,
  condition: Condition,
): { amount: number; adjusted: boolean } {
  if (condition === BASELINE_CONDITION) return { amount, adjusted: false };
  const multiplier = conditionMultiplier(condition);
  return { amount: roundMoney(amount * multiplier), adjusted: true };
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Sealed state multipliers.
 *
 * The market price for a sealed product describes it factory sealed, which is
 * the only state anyone quotes. An opened Elite Trainer Box is worth its parts -
 * sleeves, dice, the boxed cards - and a damaged one less again.
 *
 * Same honesty rule as the card multipliers above: these are rules of thumb, not
 * measurements, they live here so a self-hoster can tune them, and any value
 * derived through one is reported as approximate rather than as a market price.
 */
export const SEALED_STATE_MULTIPLIERS: Record<SealedState, number> = {
  sealed: 1.0,
  opened: 0.45,
  damaged: 0.3,
};

export const BASELINE_SEALED_STATE: SealedState = 'sealed';

export function applySealedState(
  amount: number,
  state: SealedState,
): { amount: number; adjusted: boolean } {
  if (state === BASELINE_SEALED_STATE) return { amount, adjusted: false };
  return { amount: roundMoney(amount * SEALED_STATE_MULTIPLIERS[state]), adjusted: true };
}
