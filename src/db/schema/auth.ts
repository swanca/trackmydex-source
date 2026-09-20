import { boolean, index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { cardLanguageEnum, currencyEnum, userRoleEnum } from './enums';

/**
 * Better Auth owns these four tables. They live in our own Postgres, so there is
 * no external identity vendor and a self-hoster's `pg_dump` contains everything.
 *
 * The extra columns on `user` (role, preferences) are declared to Better Auth as
 * `additionalFields` in `src/lib/auth.ts`, which keeps them type-safe on the
 * session object.
 */

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),

    role: userRoleEnum('role').notNull().default('user'),
    /** UI language. Deliberately independent from the languages of owned cards. */
    uiLocale: varchar('ui_locale', { length: 8 }).notNull().default('en'),
    /** Pre-selected printed language when adding cards, purely a convenience. */
    defaultCardLanguage: cardLanguageEnum('default_card_language').notNull().default('en'),
    displayCurrency: currencyEnum('display_currency').notNull().default('EUR'),

    /**
     * Opt in to the weekly value summary.
     *
     * Off by default, and deliberately so: an unsolicited weekly email is the
     * fastest way to be marked as spam, which costs deliverability for the
     * mail that actually matters, like a password reset.
     */
    weeklyDigest: boolean('weekly_digest').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('user_email_idx').on(t.email)],
);

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('session_user_idx').on(t.userId), index('session_expires_idx').on(t.expiresAt)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    /** `credential` for e-mail+password, or an OAuth provider id such as `google`. */
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    /** Argon2id hash. Never a plaintext or reversible value. */
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('account_user_idx').on(t.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);
