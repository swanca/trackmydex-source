import type { Currency } from '@/db/schema/enums';

export interface PortfolioHistoryPoint {
  date: string;
  value: number;
  currency: Currency;
  totalCards: number;
}

/**
 * Keeps the chart comparable after a bulk import and makes today's displayed
 * value agree with the live collection summary.
 */
export function preparePortfolioHistory(
  history: PortfolioHistoryPoint[],
  current: PortfolioHistoryPoint,
): PortfolioHistoryPoint[] {
  const sameCurrency = history.filter((point) => point.currency === current.currency);
  const points = [...sameCurrency];
  const today = points.findIndex((point) => point.date === current.date);
  if (today >= 0) points[today] = current;
  else points.push(current);
  points.sort((a, b) => a.date.localeCompare(b.date));

  let start = 0;
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]!;
    const point = points[index]!;
    const inventoryChange = Math.abs(point.totalCards - previous.totalCards);
    const bulkThreshold = Math.max(25, Math.ceil(previous.totalCards * 0.2));
    if (inventoryChange >= bulkThreshold) start = index;
  }
  return points.slice(start);
}

export function portfolioChange(points: PortfolioHistoryPoint[]): number | null {
  if (points.length < 2) return null;
  const first = points[0]!.value;
  if (first === 0) return null;
  return (points.at(-1)!.value - first) / first;
}
