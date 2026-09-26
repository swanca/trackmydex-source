import Papa from 'papaparse';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, type SqlRow } from '@/db';
import { CARD_LANGUAGES, CONDITIONS, CURRENCIES, type Currency } from '@/db/schema/enums';
import { logger } from '@/lib/logger';
import {
  matchImportCandidate,
  normalizeImportText,
  selectImportVariant,
  type ImportCandidate,
  type ImportMatchResult,
} from '@/lib/csv/import-normalize';
import { upsertEntry } from './collection';

/**
 * CSV import / export.
 *
 * Export carries enough identity - internal ids *and* marketplace product ids -
 * that a user can leave for another tool without losing their mapping work.
 * Import never writes until the user has seen a preview, and every row is
 * validated and resolved to a real printing first.
 */

export const CSV_COLUMNS = [
  'card_id',
  'card_variant_id',
  'cardmarket_product_id',
  'tcgplayer_product_id',
  'card_name',
  'set_name',
  'set_id',
  'set_code',
  'card_number',
  'language',
  'variant',
  'condition',
  'quantity',
  'purchase_price',
  'purchase_currency',
  'purchase_date',
  'estimated_unit_price',
  'estimated_total_value',
  'estimated_currency',
  'price_confidence',
  'price_source',
  'notes',
] as const;

/**
 * Spreadsheet applications execute a cell starting with = + - or @ as a formula.
 * A card called "-Mew" or a note pasted from elsewhere must not become an
 * executable cell in someone's Excel, so those values are prefixed and quoted.
 */
function neutraliseFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return neutraliseFormula(String(value));
}

export async function exportCollectionCsv(
  userId: string,
  displayCurrency: Currency,
): Promise<string> {
  const result = await db.execute<Record<string, unknown>>(sql`
    select
      c.id as card_id,
      ci.card_variant_id as card_variant_id,
      v.cardmarket_product_id,
      v.tcgplayer_product_id,
      c.name as card_name,
      s.name as set_name,
      s.id as set_id,
      s.code as set_code,
      c.local_id as card_number,
      ci.language,
      v.variant_type as variant,
      ci.condition,
      ci.quantity,
      ci.purchase_price,
      ci.purchase_currency,
      ci.purchase_date,
      pr.market as estimated_unit_price,
      (pr.market * ci.quantity) as estimated_total_value,
      pr.currency as estimated_currency,
      pr.confidence as price_confidence,
      pr.provider as price_source,
      ci.notes
    from collection_item ci
    join card c on c.id = ci.card_id
    join card_variant v on v.id = ci.card_variant_id
    join set s on s.id = c.set_id
    left join lateral (
      select p.market, p.currency, p.confidence, p.provider from card_price p
      where p.card_variant_id = ci.card_variant_id and p.market is not null
      order by (p.confidence = 'exact') desc,
               array_position(array['tcgdex.cardmarket','tcgdex.tcgplayer','tcgcsv.tcgplayer','pokemontcgio'], p.provider) nulls last
      limit 1
    ) pr on true
    where ci.user_id = ${userId}
    order by s.release_date desc nulls last, c.sort_index
  `);

  const rows = result.rows.map((row) =>
    Object.fromEntries(CSV_COLUMNS.map((column) => [column, cell(row[column])])),
  );

  logger.info('csv.export', { userId, rows: rows.length, displayCurrency });

  return Papa.unparse(
    { fields: [...CSV_COLUMNS], data: rows.map((row) => CSV_COLUMNS.map((c) => row[c] ?? '')) },
    { quotes: true, newline: '\r\n' },
  );
}

export function csvTemplate(): string {
  return Papa.unparse(
    {
      fields: [...CSV_COLUMNS],
      data: [
        [
          'swsh3-136', 'swsh3-136::reverse', '483559', '219333', 'Furret', 'Darkness Ablaze',
          'swsh3', 'DAA', '136', 'en', 'reverse', 'near_mint', '2', '1.50', 'EUR', '2024-05-01',
          '', '', '', '', '', 'Pulled from a booster',
        ],
      ],
    },
    { quotes: true, newline: '\r\n' },
  );
}

/* ------------------------------------------------------------------ import */

const MAX_ROWS = 20_000;

/**
 * Column names other trackers use, mapped onto ours.
 *
 * An export from somewhere else is the normal way a collection arrives, and
 * nobody is going to rename twelve columns by hand first. Every alias here is
 * a header actually seen in the wild or the obvious French equivalent, and
 * matching ignores case, spaces, hyphens and underscores - so "Card Name",
 * "card-name" and "CARDNAME" are one thing.
 *
 * Unknown columns are left alone rather than guessed at. A wrong guess writes
 * the wrong data into somebody's collection, which is far worse than a column
 * being ignored.
 */
const HEADER_ALIASES: Record<string, string> = {
  // Identity
  name: 'card_name',
  card: 'card_name',
  cardname: 'card_name',
  pokemon: 'card_name',
  nom: 'card_name',
  nomdelacarte: 'card_name',

  number: 'card_number',
  no: 'card_number',
  num: 'card_number',
  cardno: 'card_number',
  cardnumber: 'card_number',
  collectornumber: 'card_number',
  numero: 'card_number',

  set: 'set_name',
  setname: 'set_name',
  expansion: 'set_name',
  edition: 'set_name',
  extension: 'set_name',
  series: 'set_name',
  serie: 'set_name',

  setcode: 'set_id',
  setid: 'set_id',

  // Copies
  qty: 'quantity',
  count: 'quantity',
  amount: 'quantity',
  quantite: 'quantity',
  nombre: 'quantity',

  // Attributes
  lang: 'language',
  langue: 'language',
  cardlanguage: 'language',

  cond: 'condition',
  grade: 'condition',
  etat: 'condition',
  state: 'condition',

  printing: 'variant',
  finish: 'variant',
  foil: 'variant',
  holo: 'variant',
  impression: 'variant',

  // Money
  price: 'purchase_price',
  paid: 'purchase_price',
  pricepaid: 'purchase_price',
  purchaseprice: 'purchase_price',
  prix: 'purchase_price',
  prixdachat: 'purchase_price',

  currency: 'purchase_currency',
  devise: 'purchase_currency',

  date: 'purchase_date',
  purchasedate: 'purchase_date',
  dateachat: 'purchase_date',
  acquired: 'purchase_date',

  note: 'notes',
  comment: 'notes',
  comments: 'notes',
  remarque: 'notes',
};

/** Case, spaces, hyphens and underscores all mean the same thing in a header. */
export function canonicalHeader(header: string): string {
  const squashed = header.trim().toLowerCase().replace(/[\s\-_.]+/g, '');
  const aliased = HEADER_ALIASES[squashed];
  if (aliased) return aliased;
  // Not an alias: fall back to our own snake_case spelling of it.
  return header.trim().toLowerCase().replace(/[\s\-.]+/g, '_');
}

const importRowSchema = z.object({
  card_id: z.string().trim().max(96).optional().default(''),
  card_variant_id: z.string().trim().max(128).optional().default(''),
  cardmarket_product_id: z.string().trim().max(32).optional().default(''),
  tcgplayer_product_id: z.string().trim().max(32).optional().default(''),
  set_id: z.string().trim().max(64).optional().default(''),
  set_code: z.string().trim().max(64).optional().default(''),
  /** A set's printed name, for exports that carry no set code. */
  set_name: z.string().trim().max(200).optional().default(''),
  card_number: z.string().trim().max(24).optional().default(''),
  card_name: z.string().trim().max(200).optional().default(''),
  language: z.string().trim().toLowerCase().optional().default(''),
  variant: z.string().trim().optional().default(''),
  condition: z.string().trim().toLowerCase().optional().default('near_mint'),
  quantity: z.string().trim().optional().default('1'),
  purchase_price: z.string().trim().optional().default(''),
  purchase_currency: z.string().trim().toUpperCase().optional().default(''),
  purchase_date: z.string().trim().optional().default(''),
  notes: z.string().trim().max(1_000).optional().default(''),
});

export type DuplicateStrategy = 'skip' | 'add' | 'replace';

export interface PreviewRow {
  line: number;
  status: 'ready' | 'duplicate' | 'error';
  message?: string;
  cardName?: string;
  setName?: string;
  cardVariantId?: string;
  language?: string;
  condition?: string;
  quantity?: number;
  purchasePrice?: number | null;
  purchaseCurrency?: Currency | null;
  purchaseDate?: string | null;
  notes?: string | null;
  existingQuantity?: number;
  suggestion?: string;
  source?: Record<string, string>;
}

export interface ImportPreview {
  rows: PreviewRow[];
  counts: { ready: number; duplicate: number; error: number };
  truncated: boolean;
}

/**
 * Parses and resolves a CSV without writing anything.
 *
 * Resolution order per row, most reliable first: explicit variant id, then
 * card id plus variant, then set id plus printed number. Name matching is
 * deliberately *not* attempted - two cards in different sets share a name and a
 * wrong match silently corrupts a collection.
 */
export async function previewImport(
  userId: string,
  csvText: string,
): Promise<ImportPreview> {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: canonicalHeader,
  });

  const rawRows = parsed.data.slice(0, MAX_ROWS);
  const truncated = parsed.data.length > MAX_ROWS;
  const rows: PreviewRow[] = [];

  // Resolve every candidate printing in as few queries as possible.
  const [resolved, existing, defaultLanguage] = await Promise.all([
    resolvePrintings(rawRows),
    loadExistingStacks(userId),
    loadDefaultLanguage(userId),
  ]);

  for (const [index, raw] of rawRows.entries()) {
    const line = index + 2; // header is line 1
    const parsedRow = importRowSchema.safeParse(raw);
    if (!parsedRow.success) {
      rows.push({ line, status: 'error', message: parsedRow.error.issues[0]?.message ?? 'Invalid row', source: raw });
      continue;
    }
    const value = parsedRow.data;

    const languageValue = value.language || defaultLanguage;
    const language = CARD_LANGUAGES.includes(languageValue as never) ? languageValue : null;
    if (!language) {
      rows.push({ line, status: 'error', message: `Unknown language "${languageValue}"`, source: raw });
      continue;
    }

    const condition = normaliseCondition(value.condition);
    if (!condition) {
      rows.push({ line, status: 'error', message: `Unknown condition "${value.condition}"`, source: raw });
      continue;
    }

    const quantity = Number.parseInt(value.quantity || '1', 10);
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 9_999) {
      rows.push({ line, status: 'error', message: `Quantity must be between 1 and 9999`, source: raw });
      continue;
    }

    const resolution = resolved.get(index);
    const match = resolution?.match;
    if (!match) {
      rows.push({
        line,
        status: 'error',
        message: resolution?.reason ?? 'No card matched this row',
        suggestion: resolution?.suggestion,
        source: raw,
      });
      continue;
    }

    let purchasePrice: number | null = null;
    let purchaseCurrency: Currency | null = null;
    if (value.purchase_price) {
      const amount = Number.parseFloat(value.purchase_price.replace(',', '.'));
      if (!Number.isFinite(amount) || amount < 0) {
        rows.push({ line, status: 'error', message: 'Purchase price is not a number', source: raw });
        continue;
      }
      purchasePrice = amount;
      purchaseCurrency = CURRENCIES.includes(value.purchase_currency as never)
        ? (value.purchase_currency as Currency)
        : 'EUR';
    }

    const purchaseDate = value.purchase_date && /^\d{4}-\d{2}-\d{2}$/.test(value.purchase_date)
      ? value.purchase_date
      : null;

    const stackKey = `${match.variantId}|${language}|${condition}`;
    const existingQuantity = existing.get(stackKey);

    rows.push({
      line,
      status: existingQuantity === undefined ? 'ready' : 'duplicate',
      cardName: match.cardName,
      setName: match.setName,
      cardVariantId: match.variantId,
      language,
      condition,
      quantity,
      purchasePrice,
      purchaseCurrency,
      purchaseDate,
      notes: value.notes || null,
      ...(existingQuantity === undefined ? {} : { existingQuantity }),
    });
  }

  const counts = rows.reduce(
    (acc, row) => ({ ...acc, [row.status]: acc[row.status] + 1 }),
    { ready: 0, duplicate: 0, error: 0 },
  );

  return { rows, counts, truncated };
}

export async function commitImport(
  userId: string,
  preview: ImportPreview,
  strategy: DuplicateStrategy,
): Promise<{ imported: number; skipped: number; failed: number }> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of preview.rows) {
    if (row.status === 'error' || !row.cardVariantId) {
      skipped += 1;
      continue;
    }
    if (row.status === 'duplicate' && strategy === 'skip') {
      skipped += 1;
      continue;
    }

    const quantity =
      row.status === 'duplicate' && strategy === 'add'
        ? (row.existingQuantity ?? 0) + (row.quantity ?? 0)
        : (row.quantity ?? 0);

    try {
      await upsertEntry(userId, {
        cardVariantId: row.cardVariantId,
        language: row.language as never,
        condition: row.condition as never,
        quantity,
        purchasePrice: row.purchasePrice ?? null,
        purchaseCurrency: row.purchaseCurrency ?? null,
        purchaseDate: row.purchaseDate ?? null,
        notes: row.notes ?? null,
      });
      imported += 1;
    } catch (error) {
      failed += 1;
      logger.warn('csv.import_row_failed', { userId, line: row.line, error });
    }
  }

  logger.info('csv.import', { userId, imported, skipped, failed, strategy });
  return { imported, skipped, failed };
}

export function normaliseCondition(value: string): string | null {
  const cleaned = (value.trim() || 'near_mint').toLowerCase().replace(/[\s-]+/g, '_');
  if (CONDITIONS.includes(cleaned as never)) return cleaned;
  // Common marketplace abbreviations, so an export from elsewhere just works.
  const aliases: Record<string, string> = {
    m: 'mint',
    nm: 'near_mint',
    nearmint: 'near_mint',
    ex: 'excellent',
    gd: 'good',
    lp: 'light_played',
    lightlyplayed: 'light_played',
    pl: 'played',
    po: 'poor',
    damaged: 'poor',
  };
  return aliases[value.toLowerCase().replace(/[\s_-]+/g, '')] ?? null;
}

async function resolvePrintings(
  rows: readonly Record<string, string>[],
): Promise<Map<number, ImportMatchResult>> {
  const out = new Map<number, ImportMatchResult>();
  if (rows.length === 0) return out;

  const variantIds = new Set<string>();
  const cardIds = new Set<string>();
  const cardmarketIds = new Set<number>();
  const tcgplayerIds = new Set<number>();
  const numbers = new Set<string>();
  const parsedRows: Array<z.infer<typeof importRowSchema> | null> = [];

  for (const raw of rows) {
    const parsed = importRowSchema.safeParse(raw);
    if (!parsed.success) {
      parsedRows.push(null);
      continue;
    }
    const value = parsed.data;
    parsedRows.push(value);
    if (value.card_variant_id) variantIds.add(value.card_variant_id);
    if (value.card_id) cardIds.add(value.card_id);
    if (/^\d+$/.test(value.cardmarket_product_id)) cardmarketIds.add(Number(value.cardmarket_product_id));
    if (/^\d+$/.test(value.tcgplayer_product_id)) tcgplayerIds.add(Number(value.tcgplayer_product_id));
    if (value.card_number) numbers.add(normalizeImportText(value.card_number));
  }

  const result = await db.execute<SqlRow<ImportCandidate & {
    cardmarketProductId: number | null;
    tcgplayerProductId: number | null;
  }>>(sql`
    select
      v.id as "variantId", v.variant_type as "variantType", v.is_default as "isDefault",
      v.cardmarket_product_id as "cardmarketProductId", v.tcgplayer_product_id as "tcgplayerProductId",
      c.id as "cardId", c.local_id as "localId", c.name as "cardName",
      s.id as "setId", s.code as "setCode", s.name as "setName",
      array_remove(array[c.name] || array_agg(distinct ct.name), null) as "cardNames",
      array_remove(array[s.name] || array_agg(distinct st.name), null) as "setNames"
    from card_variant v
    join card c on c.id = v.card_id
    join set s on s.id = c.set_id
    left join card_translation ct on ct.card_id = c.id
    left join set_translation st on st.set_id = s.id
    where v.id = any(${sql.param([...variantIds])}::text[])
       or c.id = any(${sql.param([...cardIds])}::text[])
       or regexp_replace(lower(c.local_id), '[^a-z0-9]', '', 'g') = any(${sql.param([...numbers])}::text[])
       or v.cardmarket_product_id = any(${sql.param([...cardmarketIds])}::bigint[])
       or v.tcgplayer_product_id = any(${sql.param([...tcgplayerIds])}::bigint[])
    group by v.id, v.variant_type, v.is_default, v.cardmarket_product_id, v.tcgplayer_product_id,
             c.id, c.local_id, c.name, s.id, s.code, s.name
  `);

  const candidates = result.rows;
  for (const [index, value] of parsedRows.entries()) {
    if (!value) continue;
    const exactVariant = value.card_variant_id
      ? candidates.find((candidate) => candidate.variantId === value.card_variant_id)
      : undefined;
    if (exactVariant) {
      out.set(index, { match: exactVariant, confidence: 'exact-identifiers' });
      continue;
    }

    let pool = candidates;
    if (value.card_id) pool = pool.filter((candidate) => candidate.cardId === value.card_id);
    else if (/^\d+$/.test(value.tcgplayer_product_id)) {
      pool = pool.filter((candidate) => candidate.tcgplayerProductId === Number(value.tcgplayer_product_id));
    } else if (/^\d+$/.test(value.cardmarket_product_id)) {
      pool = pool.filter((candidate) => candidate.cardmarketProductId === Number(value.cardmarket_product_id));
    }

    if ((value.card_id || value.tcgplayer_product_id || value.cardmarket_product_id) && pool.length > 0) {
      const selected = selectImportVariant(pool, value.variant, value.notes);
      out.set(index, selected.match ? { ...selected, confidence: 'exact-identifiers' } : selected);
      continue;
    }

    out.set(index, matchImportCandidate({
      setId: value.set_id,
      setCode: value.set_code,
      setName: value.set_name,
      cardNumber: value.card_number,
      cardName: value.card_name,
      variant: value.variant,
      notes: value.notes,
    }, pool));
  }

  return out;
}

async function loadDefaultLanguage(userId: string): Promise<string> {
  const result = await db.execute<{ language: string }>(sql`
    select coalesce(default_card_language::text, 'en') as language
    from "user" where id = ${userId} limit 1
  `);
  return result.rows[0]?.language ?? 'en';
}

async function loadExistingStacks(userId: string): Promise<Map<string, number>> {
  const result = await db.execute<{
    card_variant_id: string;
    language: string;
    condition: string;
    quantity: number;
  }>(sql`
    select card_variant_id, language, condition, quantity
    from collection_item where user_id = ${userId}
  `);
  return new Map(
    result.rows.map((row) => [
      `${row.card_variant_id}|${row.language}|${row.condition}`,
      Number(row.quantity),
    ]),
  );
}
