/**
 * The sets worth putting in front of someone who has just arrived.
 *
 * Three hundred and eighty-eight extensions in one scroll is not a browser,
 * it is a data dump: the page had no opinion about what matters, so the
 * reader had to form one from a wall of rows. This list is the opinion.
 *
 * It is deliberately editorial rather than computed. "Most valuable" would
 * rank by whatever the market did last week, and "most owned" needs a user
 * base we do not have yet; neither would surface Base Set. So these are the
 * fifteen a collector would name - the ones with chase cards people actually
 * hunt, plus the anniversary sets that bracket the hobby's history.
 *
 * Everything else stays one search away, and the era list underneath opens
 * on demand. Nothing is hidden, it is just no longer all shouted at once.
 *
 * Ordered newest first at render time, not here, so adding an entry is a
 * one-line change wherever it reads best.
 */
export const FEATURED_SET_IDS: readonly string[] = [
  '30th', // 30e Anniversaire - the current headline
  'me01', // Mega-Evolution - opens the current era
  'sv08.5', // Evolutions Prismatiques
  'sv03.5', // 151 - the Kanto reprint everyone came back for
  'swsh12.5', // Zenith Supreme
  'swsh11', // Origine Perdue
  'swsh10.5', // Pokemon GO
  'swsh7', // Evolution Celeste - Rayquaza VMAX alt art
  'swsh4.5', // Destinees Radieuses
  'cel25', // Celebrations - the 25th, twin to the 30th above
  'sm115', // Destinees Occultes - Charizard GX
  'xy12', // Evolutions - the Base Set homage
  'neo1', // Neo Genesis - Lugia
  'base5', // Team Rocket - Dark Charizard
  'base1', // Set de Base - where it starts
];

/**
 * Sets printed only in Japanese.
 *
 * They belong in the browser - somebody collects them - but not interleaved
 * with the western releases, where they double the length of every era for a
 * minority of readers. `languages` is authoritative here: a set carrying any
 * western language is a western release however it is named.
 */
export function isJapanOnly(languages: readonly string[]): boolean {
  return languages.length > 0 && languages.every((language) => language === 'ja');
}
