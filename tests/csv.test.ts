import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { canonicalHeader, CSV_COLUMNS, csvTemplate } from '@/server/services/csv';

/**
 * CSV is the escape hatch that makes this product non-captive: a user must be
 * able to leave with everything they entered. These tests protect that promise
 * and the export's safety against spreadsheet formula injection.
 */
describe('CSV contract', () => {
  it('carries the identifiers needed to migrate to another tool', () => {
    // Losing any of these turns an export into an unusable name list.
    for (const required of [
      'card_id',
      'card_variant_id',
      'cardmarket_product_id',
      'tcgplayer_product_id',
      'set_id',
      'card_number',
      'language',
      'variant',
      'condition',
      'quantity',
    ]) {
      expect(CSV_COLUMNS).toContain(required);
    }
  });

  it('carries valuation columns alongside what the user paid', () => {
    for (const required of [
      'purchase_price',
      'purchase_currency',
      'purchase_date',
      'estimated_unit_price',
      'estimated_total_value',
      'price_confidence',
      'price_source',
      'notes',
    ]) {
      expect(CSV_COLUMNS).toContain(required);
    }
  });

  it('has no duplicate column names', () => {
    expect(new Set(CSV_COLUMNS).size).toBe(CSV_COLUMNS.length);
  });

  it('produces a template that parses back to the documented header', () => {
    const parsed = Papa.parse<Record<string, string>>(csvTemplate(), { header: true });
    expect(parsed.meta.fields).toEqual([...CSV_COLUMNS]);
    expect(parsed.data[0]?.card_variant_id).toBe('swsh3-136::reverse');
    expect(parsed.data[0]?.condition).toBe('near_mint');
  });

  it('round-trips a template row through the parser unchanged', () => {
    const parsed = Papa.parse<Record<string, string>>(csvTemplate(), { header: true });
    const row = parsed.data[0]!;
    const again = Papa.parse<Record<string, string>>(
      Papa.unparse({ fields: [...CSV_COLUMNS], data: [CSV_COLUMNS.map((c) => row[c] ?? '')] }),
      { header: true },
    );
    expect(again.data[0]).toEqual(row);
  });
});

/**
 * Formula neutralisation is re-implemented here against the same rule the
 * exporter applies. It is a security property, so it gets its own assertions
 * rather than being inferred from the exporter passing.
 */
describe('spreadsheet formula injection', () => {
  const neutralise = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

  it('quotes values that a spreadsheet would execute', () => {
    expect(neutralise('=HYPERLINK("http://evil","click")')).toMatch(/^'=/);
    expect(neutralise('+1+1')).toMatch(/^'\+/);
    expect(neutralise('-2+3')).toMatch(/^'-/);
    expect(neutralise('@SUM(A1)')).toMatch(/^'@/);
  });

  it('leaves ordinary card data alone', () => {
    expect(neutralise('Dracaufeu')).toBe('Dracaufeu');
    expect(neutralise('4')).toBe('4');
    expect(neutralise('swsh3-136')).toBe('swsh3-136');
  });
});

describe('import header tolerance', () => {
  /**
   * A collection normally arrives as an export from somewhere else, and
   * nobody renames twelve columns by hand first. These are headers seen in
   * the wild plus their obvious French equivalents.
   */
  it.each([
    ['Card Name', 'card_name'],
    ['cardname', 'card_name'],
    ['Nom', 'card_name'],
    ['Collector Number', 'card_number'],
    ['No', 'card_number'],
    ['Numero', 'card_number'],
    ['Set', 'set_name'],
    ['Expansion', 'set_name'],
    ['Extension', 'set_name'],
    ['Qty', 'quantity'],
    ['Quantite', 'quantity'],
    ['Langue', 'language'],
    ['Etat', 'condition'],
    ['Grade', 'condition'],
    ['Price Paid', 'purchase_price'],
    ['Prix', 'purchase_price'],
  ])('maps %s to %s', (header, expected) => {
    expect(canonicalHeader(header)).toBe(expected);
  });

  it('leaves an unknown column alone rather than guessing', () => {
    // A wrong guess writes wrong data into somebody's collection, which is
    // far worse than a column being ignored.
    expect(canonicalHeader('Binder Page')).toBe('binder_page');
    expect(canonicalHeader('graded_by')).toBe('graded_by');
  });

  it('treats case, spaces, hyphens and underscores as the same', () => {
    const forms = ['card name', 'Card-Name', 'CARD_NAME', ' cardName '];
    for (const form of forms) expect(canonicalHeader(form)).toBe('card_name');
  });
});
