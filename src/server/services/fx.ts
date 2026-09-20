import { desc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { fxRate } from '@/db/schema';
import { env } from '@/lib/env';
import { fetchJson } from '@/lib/http';
import { logger } from '@/lib/logger';
import type { FxRates } from '@/lib/pricing/money';

/**
 * FX rates.
 *
 * Cardmarket quotes EUR and TCGplayer quotes USD, so any mixed portfolio needs a
 * rate. Rates are stored daily rather than fetched per request: a dashboard that
 * called an FX API on every render would be slow, rate-limited and would make the
 * same page show different totals minute to minute.
 *
 * With no FX_RATE_URL configured the static FX_EUR_USD value is used, which keeps
 * a zero-dependency self-host working and is honest about its precision.
 */

let cache: { rates: FxRates; expiresAt: number } | null = null;
const CACHE_MS = 15 * 60 * 1000;

export async function getFxRates(): Promise<FxRates> {
  if (cache && cache.expiresAt > Date.now()) return cache.rates;

  const rates: FxRates = { 'EUR:USD': env.FX_EUR_USD, 'USD:EUR': 1 / env.FX_EUR_USD };

  try {
    const rows = await db
      .select({ base: fxRate.base, quote: fxRate.quote, rate: fxRate.rate })
      .from(fxRate)
      .orderBy(desc(fxRate.asOf))
      .limit(10);

    for (const row of rows) {
      const value = Number(row.rate);
      if (!Number.isFinite(value) || value <= 0) continue;
      const key = `${row.base}:${row.quote}`;
      if (rates[key] === undefined || key === 'EUR:USD') {
        rates[key] = value;
        rates[`${row.quote}:${row.base}`] = 1 / value;
      }
    }
  } catch (error) {
    logger.warn('fx.load_failed', { error });
  }

  cache = { rates, expiresAt: Date.now() + CACHE_MS };
  return rates;
}

/** Called by the daily job. Falls back to the configured static rate on failure. */
export async function refreshFxRates(): Promise<number> {
  let rate = env.FX_EUR_USD;
  let source = 'static';

  if (env.FX_RATE_URL) {
    try {
      const payload = await fetchJson<Record<string, unknown>>(env.FX_RATE_URL, { retries: 2 });
      const candidate = extractEurUsd(payload);
      if (candidate) {
        rate = candidate;
        source = 'remote';
      }
    } catch (error) {
      logger.warn('fx.refresh_failed', { error, url: env.FX_RATE_URL });
    }
  }

  await db
    .insert(fxRate)
    .values({ base: 'EUR', quote: 'USD', asOf: new Date().toISOString().slice(0, 10), rate: String(rate), source })
    .onConflictDoUpdate({
      target: [fxRate.base, fxRate.quote, fxRate.asOf],
      set: { rate: sql`excluded.rate`, source: sql`excluded.source` },
    });

  cache = null;
  return rate;
}

/** Tolerant extraction: FX APIs disagree on payload shape. */
function extractEurUsd(payload: Record<string, unknown> | null): number | null {
  if (!payload) return null;
  const candidates = [
    (payload as { rates?: Record<string, number> }).rates?.USD,
    (payload as { usd?: number }).usd,
    (payload as { eur?: Record<string, number> }).eur?.usd,
    (payload as { data?: Record<string, number> }).data?.USD,
  ];
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  }
  return null;
}
