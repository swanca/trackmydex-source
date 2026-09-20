import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { syncKindEnum, syncStatusEnum } from './enums';

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
