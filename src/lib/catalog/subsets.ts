/**
 * Subsets belong to the set they were printed in.
 *
 * TCGdex publishes a Trainer Gallery, a Shiny Vault or a Galarian Gallery as
 * its own set, because that is how the data is shaped upstream. It is not how
 * anyone collects: the Lost Origin Trainer Gallery is part of Lost Origin,
 * and listing it as a sibling of its own parent - right next to it, with a
 * near-identical name - makes the browser read as though the catalogue is
 * duplicated.
 *
 * Most of these could be derived by stripping a suffix from the id, but not
 * all of them: Hidden Fates is `sm115` while its Shiny Vault is `sma`. A rule
 * that is right eight times out of nine is worse than a list, because the
 * ninth case fails silently. There are about two of these a year.
 */
export const SUBSET_PARENT: Readonly<Record<string, string>> = {
  sma: 'sm115', // Hidden Fates Shiny Vault
  'swsh4.5sv': 'swsh4.5', // Shining Fates Shiny Vault
  cel25cc: 'cel25', // Celebrations Classic Collection
  swsh9tg: 'swsh9', // Brilliant Stars Trainer Gallery
  swsh10tg: 'swsh10', // Astral Radiance Trainer Gallery
  swsh11tg: 'swsh11', // Lost Origin Trainer Gallery
  swsh12tg: 'swsh12', // Silver Tempest Trainer Gallery
  'swsh12.5gg': 'swsh12.5', // Crown Zenith Galarian Gallery
  '30th-c': '30th', // 30th Classic Collection
};

/** The set a subset belongs to, or null when it stands on its own. */
export function parentSetId(setId: string): string | null {
  return SUBSET_PARENT[setId] ?? null;
}

/** Every set id whose cards should appear under `setId`, including itself. */
export function setIdWithSubsets(setId: string): string[] {
  const children = Object.entries(SUBSET_PARENT)
    .filter(([, parent]) => parent === setId)
    .map(([child]) => child);
  return [setId, ...children];
}

/**
 * `(child, parent)` pairs for SQL.
 *
 * Folding subsets has to happen in the query, not after it: a collection
 * page grouping by set needs the *parent's* name, and that name is only
 * reachable by joining on the parent id. Returned as pairs so a caller can
 * build a `values` join rather than a chain of cases.
 *
 * Deliberately not a table in the database. It is nine rows that change
 * twice a year, and a migration for each would be more ceremony than the
 * fact deserves - but see the note above about why it is a list at all.
 */
export const SUBSET_PAIRS: ReadonlyArray<readonly [string, string]> = Object.entries(
  SUBSET_PARENT,
).map(([child, parent]) => [child, parent] as const);

/** The subset ids, for excluding them from any list of sets. */
export const SUBSET_IDS: readonly string[] = Object.keys(SUBSET_PARENT);
