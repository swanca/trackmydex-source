/**
 * Card numbers are not numbers.
 *
 * Across 27 years the printed number has been `4`, `H12`, `SV45`, `TG08`,
 * `GG31`, `001`, `?`, `!`, `RC5`, `XY-P 123`. Sorting them lexically puts card
 * 10 before card 2; sorting them as integers throws away the prefix. So we
 * project each number onto a numeric key:
 *
 *   plain numbers      -> the number itself           (4      -> 4.000)
 *   prefixed numbers   -> prefix bucket + the number  (H12    -> 100012.000)
 *   suffixed numbers   -> number + fractional suffix  (25a    -> 25.001)
 *   non-numeric        -> a large bucket, ordered by codepoint
 *
 * Prefix buckets are spaced far enough apart that no real set overflows one.
 */

const PREFIX_BUCKET = 1_000;
const UNNUMBERED_BASE = 900_000;

/** Deterministic bucket for an alphabetic prefix, so `H*` always sorts with `H*`. */
function prefixBucket(prefix: string): number {
  let acc = 0;
  for (const ch of prefix.toUpperCase()) {
    acc = acc * 36 + (ch.charCodeAt(0) - 55);
  }
  // Keep every prefixed card after every plain-numbered card.
  return 100_000 + (acc % 700) * PREFIX_BUCKET;
}

export function cardSortIndex(localId: string): number {
  const raw = decodeLocalId(localId).trim();
  if (!raw) return UNNUMBERED_BASE;

  const match = /^([A-Za-z-]*)\s*0*(\d+)\s*([A-Za-z]?)$/.exec(raw);
  if (!match) {
    // Pure symbols such as Unown's `!` / `?`: order by codepoint, always last.
    const code = raw.codePointAt(0) ?? 0;
    return UNNUMBERED_BASE + (code % 1_000);
  }

  const [, prefix = '', digits = '0', suffix = ''] = match;
  const base = Number.parseInt(digits, 10);
  const suffixOffset = suffix ? (suffix.toLowerCase().charCodeAt(0) - 96) / 1_000 : 0;
  const bucket = prefix ? prefixBucket(prefix.replace(/-/g, '')) : 0;

  return Number((bucket + base + suffixOffset).toFixed(3));
}

/**
 * Some provider ids arrive percent-encoded (`%3F` for the `?` Unown). Decode
 * defensively: a malformed sequence must not throw during a 23k-card sync.
 */
export function decodeLocalId(localId: string): string {
  try {
    return decodeURIComponent(localId);
  } catch {
    return localId;
  }
}
