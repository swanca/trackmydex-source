import { describe, expect, it } from 'vitest';
import { preparePortfolioHistory } from '@/lib/portfolio/history';
import { chartDomain, inventoryEvents, pointsForRange } from '@/lib/portfolio/chart';

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

describe('portfolio chart helpers', () => {
  const points = [
    { date: '2026-08-01', value: 100, totalCards: 10 },
    { date: '2026-09-20', value: 108, totalCards: 10 },
    { date: '2026-09-21', value: 118, totalCards: 12 },
    { date: '2026-09-27', value: 121, totalCards: 11 },
  ];

  it('filters periods by calendar date rather than inventing missing daily points', () => {
    expect(pointsForRange(points, 7).map((point) => point.date)).toEqual([
      '2026-09-21',
      '2026-09-27',
    ]);
    expect(pointsForRange(points, 'all')).toEqual(points);
  });

  it('creates a readable personalized scale when every value is equal', () => {
    const domain = chartDomain([
      { date: '2026-09-26', value: 100 },
      { date: '2026-09-27', value: 100 },
    ]);
    expect(domain.min).toBeLessThan(100);
    expect(domain.max).toBeGreaterThan(100);
    expect(domain.max - domain.min).toBeGreaterThanOrEqual(35);
    expect(domain.ticks).toHaveLength(4);
  });

  it('marks additions and removals without treating them as market movement', () => {
    expect(inventoryEvents(points)).toEqual([
      { index: 2, delta: 2, date: '2026-09-21' },
      { index: 3, delta: -1, date: '2026-09-27' },
    ]);
  });
});
