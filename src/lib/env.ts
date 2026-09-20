import { z } from 'zod';
import { CARD_LANGUAGES } from '@/db/schema/enums';

/**
 * Fail fast on misconfiguration rather than 500ing on the first request that
 * happens to touch a missing variable. Parsed once at module load, on the server
 * only - this file must never be imported from a client component.
 */

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const csv = <T extends string>(allowed: readonly T[]) =>
  z
    .string()
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(allowed as unknown as [T, ...T[]])).min(1));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  APP_URL: z.url().default('http://localhost:3000'),
  BETTER_AUTH_SECRET: z
    .string()
    .min(16, 'BETTER_AUTH_SECRET must be at least 16 characters; generate one with `openssl rand -base64 32`'),

  AUTH_REQUIRE_EMAIL_VERIFICATION: booleanish.default(false),
  AUTH_ALLOW_SIGNUP: booleanish.default(true),
  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),

  SMTP_URL: z.string().default(''),
  SMTP_FROM: z.string().default('TrackMyDex <no-reply@example.com>'),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),

  TCGDEX_API_URL: z.url().default('https://api.tcgdex.net/v2'),
  CATALOG_LANGUAGES: csv(CARD_LANGUAGES).default(['en', 'fr', 'es', 'pt', 'it', 'ja']),
  SYNC_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(6),

  PRICING_PROVIDERS: z
    .string()
    .default('tcgdex')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  POKEMONTCGIO_API_KEY: z.string().default(''),

  DEFAULT_CURRENCY: z.enum(['EUR', 'USD']).default('EUR'),
  FX_EUR_USD: z.coerce.number().positive().default(1.08),
  FX_RATE_URL: z.string().default(''),

  /**
   * Which prices get a daily history row.
   *
   * `all` snapshots every priced printing and sealed product: about 69,000 rows
   * a day, 19 MB, 7 GB a year. That is the right choice for a public instance
   * where anyone may open any card, and far too much for a personal one.
   *
   * `tracked` (the default) records only what somebody actually owns or
   * wishlists. A personal instance then grows by kilobytes a day instead of
   * megabytes, which is what makes a free Postgres tier viable. Cards nobody
   * tracks simply have no history, which the card page already states plainly
   * rather than drawing an empty chart.
   */
  PRICE_HISTORY_SCOPE: z.enum(['tracked', 'all']).default('tracked'),

  /**
   * How long price history stays daily.
   *
   * Beyond this, the daily job thins older rows to one per week. A price chart
   * does not need day-by-day resolution on a card you bought three years ago,
   * and keeping it means the table grows for ever: scoping alone still adds a
   * row per tracked printing per day, so a 5,000-card collection writes half a
   * gigabyte a year.
   *
   * Thinning caps that at a seventh of the rate once the window passes, while
   * the recent detail people actually look at stays intact.
   */
  PRICE_HISTORY_DAILY_DAYS: z.coerce.number().int().min(0).default(120),

  /** Hard limit: history older than this is deleted. 0 keeps it for ever. */
  PRICE_HISTORY_RETENTION_DAYS: z.coerce.number().int().min(0).default(0),

  /**
   * Who runs this instance, for the legal pages.
   *
   * These are the only genuinely operator-specific facts in those documents;
   * everything else about data handling is a property of the software and is
   * stated outright. Left empty they fall back to something truthful rather
   * than to a bracket: an unanswerable placeholder in a privacy policy is
   * what gets an OAuth app refused verification.
   */
  LEGAL_PUBLISHER: z.string().default(''),
  LEGAL_CONTACT_EMAIL: z.string().default(''),
  LEGAL_ADDRESS: z.string().default(''),
  LEGAL_JURISDICTION: z.string().default(''),

  CRON_SECRET: z.string().default(''),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SENTRY_DSN: z.string().default(''),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\n\nSee .env.example.`);
  }
  return parsed.data;
}

export const env: Env = load();

/** `true` when at least one social provider is configured. */
export const hasGoogleAuth = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/** `true` when outbound mail can actually be sent; otherwise links are logged. */
export const hasMailer = Boolean(env.SMTP_URL);

/**
 * Identity shown on the legal pages.
 *
 * The contact address falls back to `contact@` at the site's own domain,
 * which is the address a self-hoster almost certainly has or can forward in
 * a minute - and, unlike a bracket, one a reader can actually write to.
 */
export function legalIdentity() {
  const host = new URL(env.APP_URL).hostname.replace(/^www\./, '');
  return {
    publisher: env.LEGAL_PUBLISHER || host,
    contact: env.LEGAL_CONTACT_EMAIL || `contact@${host}`,
    address: env.LEGAL_ADDRESS,
    jurisdiction: env.LEGAL_JURISDICTION,
    site: host,
  };
}
