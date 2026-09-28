export type ChartRange = 7 | 30 | 90 | 365 | 'all';

export interface ChartPoint {
  date: string;
  value: number;
  totalCards?: number;
}

export interface InventoryEvent {
  index: number;
  delta: number;
  date: string;
}

export function pointsForRange(points: ChartPoint[], range: ChartRange): ChartPoint[] {
  if (range === 'all' || points.length === 0) return points;
  const last = new Date(`${points.at(-1)!.date}T00:00:00Z`);
  const start = new Date(last);
  start.setUTCDate(start.getUTCDate() - (range - 1));
  const startDate = start.toISOString().slice(0, 10);
  return points.filter((point) => point.date >= startDate);
}

export function chartDomain(points: ChartPoint[]): { min: number; max: number; ticks: number[] } {
  const values = points.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = Math.max(rawMax - rawMin, Math.abs(rawMax) * 0.35, 1);
  const padding = span * 0.1;
  const center = (rawMin + rawMax) / 2;
  const min = Math.max(0, center - span / 2 - padding);
  const max = Math.max(rawMax + padding, center + span / 2 + padding);
  return {
    min,
    max,
    ticks: Array.from({ length: 4 }, (_, index) => min + ((max - min) * index) / 3),
  };
}

export function inventoryEvents(points: ChartPoint[]): InventoryEvent[] {
  const events: InventoryEvent[] = [];
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]!.totalCards;
    const current = points[index]!.totalCards;
    if (previous === undefined || current === undefined || previous === current) continue;
    events.push({ index, delta: current - previous, date: points[index]!.date });
  }
  return events;
}

export function chartChange(points: ChartPoint[]): number | null {
  if (points.length < 2 || points[0]!.value === 0) return null;
  return (points.at(-1)!.value - points[0]!.value) / points[0]!.value;
}
