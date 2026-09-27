import { describe, expect, it } from 'vitest';
import { preparePortfolioHistory } from '@/lib/portfolio/history';

describe('preparePortfolioHistory', () => {
  it('starts a new comparable period after a bulk collection import', () => {
    const points = preparePortfolioHistory([
      { date: '2026-09-20', value: 2658.08, currency: 'EUR', totalCards: 16 },
      { date: '2026-09-21', value: 917.16, currency: 'EUR', totalCards: 1179 },
      { date: '2026-09-22', value: 915.35, currency: 'EUR', totalCards: 1179 },
      { date: '2026-09-23', value: 915.89, currency: 'EUR', totalCards: 1180 },
    ], { date: '2026-09-23', value: 920, currency: 'EUR', totalCards: 1180 });

    expect(points).toEqual([
      { date: '2026-09-21', value: 917.16, currency: 'EUR', totalCards: 1179 },
      { date: '2026-09-22', value: 915.35, currency: 'EUR', totalCards: 1179 },
      { date: '2026-09-23', value: 920, currency: 'EUR', totalCards: 1180 },
    ]);
  });

  it('keeps ordinary additions and appends the current live value', () => {
    const points = preparePortfolioHistory([
      { date: '2026-09-25', value: 1089.5, currency: 'EUR', totalCards: 1181 },
      { date: '2026-09-26', value: 1091.54, currency: 'EUR', totalCards: 1184 },
    ], { date: '2026-09-27', value: 1108.81, currency: 'EUR', totalCards: 1189 });

    expect(points.at(-1)).toEqual({
      date: '2026-09-27', value: 1108.81, currency: 'EUR', totalCards: 1189,
    });
    expect(points).toHaveLength(3);
  });

  it('does not compare snapshots stored in another display currency', () => {
    const points = preparePortfolioHistory([
      { date: '2026-09-25', value: 100, currency: 'USD', totalCards: 50 },
      { date: '2026-09-26', value: 95, currency: 'EUR', totalCards: 50 },
    ], { date: '2026-09-27', value: 97, currency: 'EUR', totalCards: 50 });

    expect(points.map((point) => point.date)).toEqual(['2026-09-26', '2026-09-27']);
  });
});
