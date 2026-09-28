import {
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { syncKindEnum, syncStatusEnum } from './enums';
import { user } from './auth';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/**
 * Operations layer: everything the admin area reads.
 *
 * Sync jobs are auditable by design. A run that half-succeeds is recorded as
 * `partial` with its errors attached, rather than silently leaving the catalog
 * inconsistent.
 */
export const syncRun = pgTable(
  'sync_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: syncKindEnum('kind').notNull(),
    status: syncStatusEnum('status').notNull().default('running'),
    /** `cron`, `admin:<userId>`, `cli`. */
    triggeredBy: varchar('triggered_by', { length: 64 }).notNull().default('cli'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** { setsSeen, cardsUpserted, translationsUpserted, pricesUpserted, skipped } */
    stats: jsonb('stats').notNull().default({}),
    errorCount: integer('error_count').notNull().default(0),
  },
  (t) => [index('sync_run_kind_idx').on(t.kind, t.startedAt.desc())],
);

export const syncError = pgTable(
  'sync_error',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    syncRunId: uuid('sync_run_id').references(() => syncRun.id, { onDelete: 'cascade' }),
    /** `set`, `card`, `translation`, `price`, `provider`. */
    scope: varchar('scope', { length: 32 }).notNull(),
    /** Identifier of the failing entity, e.g. a card id or a language code. */
    ref: varchar('ref', { length: 160 }),
    message: text('message').notNull(),
    detail: jsonb('detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sync_error_run_idx').on(t.syncRunId),
    index('sync_error_created_idx').on(t.createdAt.desc()),
  ],
);

/**
 * Token-bucket rate limiting in Postgres.
 *
 * Deliberately not Redis: a self-hoster should need one service, not two. The
 * table is tiny, the update is a single row-level write, and it works correctly
 * across multiple app replicas.
 */
export const rateLimitBucket = pgTable(
  'rate_limit_bucket',
  {
    key: varchar('key', { length: 160 }).primaryKey(),
    tokens: integer('tokens').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('rate_limit_updated_idx').on(t.updatedAt)],
);

/** Small key/value store for runtime settings an admin can change without a redeploy. */
export const appSetting = pgTable('app_setting', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Private admin-owned sessions used to tune the scanner against real phone photos. */
export const calibrationCampaign = pgTable(
  'calibration_campaign',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    targetCount: integer('target_count').notNull(),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('calibration_campaign_owner_idx').on(t.createdBy, t.createdAt.desc()),
    check('calibration_campaign_target_range', sql`${t.targetCount} between 1 and 500`),
    check('calibration_campaign_status_valid', sql`${t.status} in ('active', 'complete')`),
  ],
);

/**
 * A deliberately bounded JPEG/WebP crop plus the measurements that produced it.
 * IP addresses and ordinary users' scans never enter this table.
 */
export const calibrationCapture = pgTable(
  'calibration_capture',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => calibrationCampaign.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    image: bytea('image').notNull(),
    imageMime: varchar('image_mime', { length: 24 }).notNull(),
    imageWidth: integer('image_width').notNull(),
    imageHeight: integer('image_height').notNull(),
    imageSize: integer('image_size').notNull(),
    fingerprint: varchar('fingerprint', { length: 32 }).notNull(),
    metrics: jsonb('metrics').notNull(),
    candidates: jsonb('candidates').notNull().default([]),
    device: jsonb('device').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('calibration_capture_sequence_idx').on(t.campaignId, t.sequence),
    index('calibration_capture_campaign_idx').on(t.campaignId, t.createdAt),
    check('calibration_capture_sequence_positive', sql`${t.sequence} > 0`),
    check('calibration_capture_image_size_range', sql`${t.imageSize} between 1 and 750000`),
    check('calibration_capture_mime_valid', sql`${t.imageMime} in ('image/jpeg', 'image/webp')`),
  ],
);
