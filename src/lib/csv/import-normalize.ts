import Papa from 'papaparse';

export type ImportVariant = 'normal' | 'reverse' | 'holo' | 'firstEdition';

export interface ImportCandidate {
  variantId: string;
  variantType: string;
  isDefault: boolean;
  cardId: string;
  cardNames: string[];
  setId: string;
  setCode: string | null;
  setNames: string[];
  localId: string;
  cardName: string;
  setName: string;
}

export interface ImportMatchInput {
  setId: string;
  setCode: string;
  setName: string;
  cardNumber: string;
  cardName: string;
  variant: string;
  notes: string;
}

export interface ImportMatchResult {
  match: ImportCandidate | null;
  confidence?: 'exact-identifiers' | 'exact-names' | 'fuzzy';
  reason?: string;
  suggestion?: string;
}

export function normalizeImportText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .replace(/[^a-z0-9]+/g, '');
}

export function normalizeVariant(value: string): ImportVariant | null {
  const key = normalizeImportText(value);
  if (!key) return null;
  if (/^(reverse|reverseholo|reverseholofoil|rh)$/.test(key)) return 'reverse';
  if (/^(holo|holofoil|holotg|foil)$/.test(key)) return 'holo';
  if (/^(normal|regular|nonholo|standard)$/.test(key)) return 'normal';
  if (/^(firstedition|firsted|1stedition|1st)$/.test(key)) return 'firstEdition';
  return null;
}

function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length]!;
}

function similarity(a: string, b: string): number {
  const left = normalizeImportText(a);
  const right = normalizeImportText(b);
  if (!left || !right) return 0;
  return 1 - distance(left, right) / Math.max(left.length, right.length);
}

function bestSimilarity(value: string, aliases: readonly string[]): number {
  return Math.max(0, ...aliases.map((alias) => similarity(value, alias)));
}

export function selectImportVariant(
  candidates: readonly ImportCandidate[],
  requested: string,
  notes: string,
): ImportMatchResult {
  const inferred = normalizeVariant(requested) ?? normalizeVariant(notes.replace(/^.*source variant:\s*/i, ''));
  if (inferred) {
    const exact = candidates.filter((candidate) => candidate.variantType === inferred);
    if (exact.length === 1) return { match: exact[0]! };
    if (exact.length === 0) {
      return {
        match: null,
        reason: `Variant "${requested || inferred}" is not available for this card`,
        suggestion: `Use one of: ${[...new Set(candidates.map((candidate) => candidate.variantType))].join(', ')}`,
      };
    }
    return { match: null, reason: 'Ambiguous printing variant' };
  }

  if (requested.trim()) {
    return { match: null, reason: `Unknown variant "${requested}"`, suggestion: 'Use normal, holo or reverse' };
  }
  if (candidates.length === 1) return { match: candidates[0]! };
  const normal = candidates.filter((candidate) => candidate.variantType === 'normal');
  if (normal.length === 1) return { match: normal[0]! };
  const defaults = candidates.filter((candidate) => candidate.isDefault);
  if (defaults.length === 1) return { match: defaults[0]! };
  return {
    match: null,
    reason: 'Ambiguous printing variant',
    suggestion: `Specify one of: ${[...new Set(candidates.map((candidate) => candidate.variantType))].join(', ')}`,
  };
}

export function matchImportCandidate(
  input: ImportMatchInput,
  candidates: readonly ImportCandidate[],
): ImportMatchResult {
  const number = normalizeImportText(input.cardNumber);
  const numbered = candidates.filter((candidate) => normalizeImportText(candidate.localId) === number);
  if (!number || numbered.length === 0) {
    return { match: null, reason: 'No card matched this collector number', suggestion: 'Check set and card number' };
  }

  const exactSetId = input.setId
    ? numbered.filter((candidate) => normalizeImportText(candidate.setId) === normalizeImportText(input.setId))
    : [];
  const exactSetCode = input.setCode
    ? numbered.filter((candidate) => normalizeImportText(candidate.setCode ?? '') === normalizeImportText(input.setCode))
    : [];
  const exact = exactSetId.length > 0 ? exactSetId : exactSetCode;
  if (exact.length > 0) {
    const selected = selectImportVariant(exact, input.variant, input.notes);
    return selected.match ? { ...selected, confidence: 'exact-identifiers' } : selected;
  }

  const scored = numbered
    .map((candidate) => {
      const setScore = input.setName ? bestSimilarity(input.setName, candidate.setNames) : 0;
      const cardScore = input.cardName ? bestSimilarity(input.cardName, candidate.cardNames) : 0;
      return { candidate, setScore, cardScore, score: setScore * 0.55 + cardScore * 0.45 };
    })
    .filter(({ setScore, cardScore }) =>
      (setScore >= 0.82 && cardScore >= 0.72) ||
      (cardScore === 1 && setScore >= 0.72) ||
      (setScore === 1 && cardScore >= 0.8),
    )
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) {
    return { match: null, reason: 'No card matched this row', suggestion: 'Check set name and card number' };
  }
  const runnerUp = scored.find((entry) => entry.candidate.cardId !== best.candidate.cardId);
  if (runnerUp && best.score - runnerUp.score < 0.08) {
    return { match: null, reason: 'Ambiguous card match', suggestion: 'Add a set id or correct the set name' };
  }

  const sameCard = scored
    .filter((entry) => entry.candidate.cardId === best.candidate.cardId)
    .map((entry) => entry.candidate);
  const selected = selectImportVariant(sameCard, input.variant, input.notes);
  if (!selected.match) return selected;
  const exactNames = best.setScore === 1 && best.cardScore === 1;
  return { ...selected, confidence: exactNames ? 'exact-names' : 'fuzzy' };
}

export function serializeImportErrors(
  errors: ReadonlyArray<{
    line: number;
    message: string;
    suggestion?: string;
    source: Record<string, string>;
  }>,
): string {
  const sourceFields = [...new Set(errors.flatMap((error) => Object.keys(error.source)))];
  const fields = ['import_line', 'import_error', 'import_suggestion', ...sourceFields];
  return Papa.unparse(
    {
      fields,
      data: errors.map((error) => [
        String(error.line),
        error.message,
        error.suggestion ?? '',
        ...sourceFields.map((field) => error.source[field] ?? ''),
      ]),
    },
    { quotes: true, newline: '\r\n' },
  );
}
