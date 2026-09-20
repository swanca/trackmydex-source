import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Printed language of a physical card. Distinct from the UI locale: a French
 * speaker may collect Japanese cards. Values mirror the TCGdex language codes so
 * ingestion needs no translation table.
 */
export const CARD_LANGUAGES = [
  'en',
  'fr',
  'de',
  'es',
  'it',
  'pt',
  'pt-br',
  'ja',
  'ko',
  'zh-tw',
  'zh-cn',
  'id',
  'th',
  'nl',
  'pl',
  'ru',
] as const;
export type CardLanguage = (typeof CARD_LANGUAGES)[number];
export const cardLanguageEnum = pgEnum('card_language', CARD_LANGUAGES);

/**
 * Printing / finish of a card. `variants_detailed[].type` from the provider maps
 * onto this directly; `other` is the escape hatch that keeps the model extensible
 * as new printing conventions appear (they have, repeatedly, since 1999).
 */
export const VARIANT_TYPES = [
  'normal',
  'holo',
  'reverse',
  'firstEdition',
  'firstEditionHolo',
  'unlimited',
  'wPromo',
  'other',
] as const;
export type VariantType = (typeof VARIANT_TYPES)[number];
export const variantTypeEnum = pgEnum('variant_type', VARIANT_TYPES);

/**
 * Grading of physical wear, ordered best to worst. Terminology follows
 * Cardmarket, which is the dominant marketplace for the European audience this
 * product targets; `mint` is kept separate from `near_mint` because sellers and
 * users distinguish them even though most price feeds do not.
 */
export const CONDITIONS = [
  'mint',
  'near_mint',
  'excellent',
  'good',
  'light_played',
  'played',
  'poor',
] as const;
export type Condition = (typeof CONDITIONS)[number];
export const conditionEnum = pgEnum('condition', CONDITIONS);

/** Currencies we store natively. Cardmarket quotes EUR, TCGplayer quotes USD. */
export const CURRENCIES = ['EUR', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const currencyEnum = pgEnum('currency', CURRENCIES);

/**
 * Whether a price describes exactly this card+variant, or was substituted from a
 * related product. Surfaced in the UI; an approximate price is never presented as
 * a market valuation.
 */
export const PRICE_CONFIDENCES = ['exact', 'approximate'] as const;
export type PriceConfidence = (typeof PRICE_CONFIDENCES)[number];
export const priceConfidenceEnum = pgEnum('price_confidence', PRICE_CONFIDENCES);

/**
 * Shapes a sealed product ships in.
 *
 * Derived from the product name at ingest, because TCGplayer has no structured
 * field for it. `other` is load-bearing: Pokemon invents new box formats every
 * year and an unrecognised one must still be collectable, not dropped.
 */
export const SEALED_KINDS = [
  'booster_pack',
  'booster_box',
  // A sealed case of anything, not only boosters: cases of Elite Trainer Boxes
  // and tin displays ship and are priced the same way, and the market treats
  // them as one category.
  'booster_case',
  'elite_trainer_box',
  'bundle',
  'build_and_battle',
  'blister',
  'deck',
  'tin',
  'box_set',
  'collection',
  'other',
] as const;
export type SealedKind = (typeof SEALED_KINDS)[number];
export const sealedKindEnum = pgEnum('sealed_kind', SEALED_KINDS);

/**
 * Whether the product is still factory sealed. An opened Elite Trainer Box is
 * worth a fraction of a sealed one, so the two cannot share a stack.
 */
export const SEALED_STATES = ['sealed', 'opened', 'damaged'] as const;
export type SealedState = (typeof SEALED_STATES)[number];
export const sealedStateEnum = pgEnum('sealed_state', SEALED_STATES);

export const USER_ROLES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleEnum = pgEnum('user_role', USER_ROLES);

export const SYNC_KINDS = ['catalog', 'translations', 'prices', 'snapshot', 'sealed'] as const;
export type SyncKind = (typeof SYNC_KINDS)[number];
export const syncKindEnum = pgEnum('sync_kind', SYNC_KINDS);

export const SYNC_STATUSES = ['running', 'success', 'partial', 'failed'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];
export const syncStatusEnum = pgEnum('sync_status', SYNC_STATUSES);

export const CARD_CATEGORIES = ['Pokemon', 'Trainer', 'Energy'] as const;
export type CardCategory = (typeof CARD_CATEGORIES)[number];
