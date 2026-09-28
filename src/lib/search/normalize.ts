/** Shared, display-independent search normalization. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[â™€â™‚]/g, (symbol) => (symbol === 'â™€' ? 'f' : 'm'))
    .replace(/[^a-z0-9]+/g, '');
}

export function normalizeSearchToken(value: string): string {
  return normalizeSearchText(value);
}

/** Returns the original token and a numeric form with leading zeroes removed. */
export function numberSearchTokens(value: string): string[] {
  const original = value.trim();
  if (!original) return [];

  const normalized = original
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, '');
  const slash = normalized.indexOf('/');
  const head = slash >= 0 ? normalized.slice(0, slash) : normalized;
  if (!/^\d+$/.test(head)) return [normalized];

  const compact = String(Number(head));
  const out = [normalized];
  if (compact !== head) out.push(`${compact}${slash >= 0 ? normalized.slice(slash) : ''}`);
  if (slash >= 0) out.push(compact);
  return [...new Set(out)];
}
