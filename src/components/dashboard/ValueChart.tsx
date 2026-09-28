'use client';

import { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/pricing/money';
import type { Currency } from '@/db/schema/enums';
import { formatDate } from '@/lib/dates';
import { intlLocale } from '@/lib/intl-locale';
import { chartChange, chartDomain, inventoryEvents, pointsForRange, type ChartPoint, type ChartRange } from '@/lib/portfolio/chart';

const WIDTH = 360;
const HEIGHT = 170;
const LEFT = 58;
const RIGHT = 12;
const TOP = 18;
const BOTTOM = 32;
const RANGES: ChartRange[] = [7, 30, 90, 365, 'all'];

/** Touch-friendly chart backed only by stored readings; missing dates stay missing. */
export function ValueChart({
  points,
  currency,
  locale,
  emptyTitle,
  emptyBody,
  className,
  showInventoryEvents = false,
}: {
  points: ChartPoint[];
  currency: Currency;
  locale: string;
  emptyTitle: string;
  emptyBody: string;
  className?: string;
  showInventoryEvents?: boolean;
}) {
  const [range, setRange] = useState<ChartRange>(30);
  const [selected, setSelected] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const visible = useMemo(() => pointsForRange(points, range), [points, range]);

  if (points.length < 2) {
    return <div className={cn('surface-flat rounded-[var(--radius-tile)] px-4 py-6 text-center', className)}>
      <p className="text-sm font-medium text-paper">{emptyTitle}</p>
      <p className="type-meta mx-auto mt-1.5 max-w-[46ch] text-xs">{emptyBody}</p>
    </div>;
  }

  const active = visible.length >= 2 ? visible : points.slice(-2);
  const domain = chartDomain(active);
  const span = domain.max - domain.min;
  const x = (index: number) => LEFT + (index / Math.max(active.length - 1, 1)) * (WIDTH - LEFT - RIGHT);
  const y = (value: number) => HEIGHT - BOTTOM - ((value - domain.min) / span) * (HEIGHT - TOP - BOTTOM);
  const line = active.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ');
  const area = `${line} L${x(active.length - 1)},${HEIGHT - BOTTOM} L${x(0)},${HEIGHT - BOTTOM} Z`;
  const change = chartChange(active);
  const selectedIndex = Math.min(selected ?? active.length - 1, active.length - 1);
  const selectedPoint = active[selectedIndex]!;
  const dateLabels = axisLabelIndexes(active.length);
  const events = showInventoryEvents ? inventoryEvents(active) : [];

  function selectFromPointer(clientX: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const chartX = ((clientX - rect.left) / rect.width) * WIDTH;
    const index = Math.round(((chartX - LEFT) / (WIDTH - LEFT - RIGHT)) * (active.length - 1));
    setSelected(Math.max(0, Math.min(active.length - 1, index)));
  }

  return <figure className={cn('surface-flat rounded-[var(--radius-tile)] p-4', className)}>
    <figcaption className="flex flex-wrap items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-xs text-muted">
        <span aria-hidden className="size-2 rounded-full bg-violet" />
        {formatRangeLabel(range, locale)}
      </span>
      {change !== null ? <span className={cn('tnum text-sm font-semibold', change >= 0 ? 'text-mint' : 'text-rose')}>
        {change >= 0 ? '↗ +' : '↘ '}{new Intl.NumberFormat(intlLocale(locale), { style: 'percent', maximumFractionDigits: 1 }).format(change)}
      </span> : null}
    </figcaption>

    <div className="mt-3 grid grid-cols-5 gap-1" aria-label={formatRangeLabel(range, locale)}>
      {RANGES.map((option) => <button
        key={option}
        type="button"
        aria-pressed={range === option}
        onClick={() => { setRange(option); setSelected(null); }}
        className={cn('min-h-11 rounded-xl px-1 text-xs font-semibold transition-colors', range === option
          ? 'bg-[linear-gradient(100deg,var(--color-violet),var(--color-azure))] text-white'
          : 'bg-[rgb(148_163_208/0.06)] text-muted hover:text-paper')}
      >{rangeButtonLabel(option, locale)}</button>)}
    </div>

    <div className="relative mt-2 lg:mx-auto lg:w-full lg:max-w-[720px]">
      <div className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-hairline-strong bg-slate-hi px-2 py-1 text-[0.6875rem] font-semibold whitespace-nowrap text-paper shadow-lg"
        style={{
          left: `${Math.max(12, Math.min(88, (x(selectedIndex) / WIDTH) * 100))}%`,
          top: `${Math.max(0, ((y(selectedPoint.value) - 28) / HEIGHT) * 100)}%`,
        }}>
        {formatShortDate(selectedPoint.date, locale)} · {formatValue(selectedPoint.value, currency, locale)}
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full touch-pan-y select-none" role="img"
        aria-label={`${formatValue(active[0]!.value, currency, locale)} → ${formatValue(active.at(-1)!.value, currency, locale)}`}
        onPointerDown={(event) => selectFromPointer(event.clientX)}
        onPointerMove={(event) => { if (event.pointerType === 'mouse' || event.buttons === 1) selectFromPointer(event.clientX); }}>
        <defs>
          <linearGradient id="value-line" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#8b5cf6" /><stop offset="100%" stopColor="#3b82f6" /></linearGradient>
          <linearGradient id="value-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" /><stop offset="100%" stopColor="#6366f1" stopOpacity="0" /></linearGradient>
        </defs>
        {domain.ticks.map((tick) => <g key={tick}>
          <line x1={LEFT} x2={WIDTH - RIGHT} y1={y(tick)} y2={y(tick)} stroke="rgb(148 163 208 / 0.14)" strokeDasharray="3 4" />
          <text x={LEFT - 7} y={y(tick) + 3} textAnchor="end" fill="var(--color-faint)" fontSize="9">{formatAxisValue(tick, currency, locale)}</text>
        </g>)}
        <path d={area} fill="url(#value-area)" />
        <path d={line} fill="none" stroke="url(#value-line)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {events.map((event) => <g key={`${event.date}-${event.delta}`}>
          <line x1={x(event.index)} x2={x(event.index)} y1={TOP} y2={HEIGHT - BOTTOM} stroke={event.delta > 0 ? 'var(--color-amber)' : 'var(--color-rose)'} strokeDasharray="2 4" opacity="0.7" />
          <circle cx={x(event.index)} cy={TOP + 5} r="4" fill={event.delta > 0 ? 'var(--color-amber)' : 'var(--color-rose)'}><title>{event.delta > 0 ? '+' : ''}{event.delta}</title></circle>
        </g>)}
        <line x1={x(selectedIndex)} x2={x(selectedIndex)} y1={TOP} y2={HEIGHT - BOTTOM} stroke="rgb(232 236 247 / 0.42)" strokeDasharray="3 3" />
        {active.map((point, index) => <circle key={point.date} cx={x(index)} cy={y(point.value)} r={index === selectedIndex ? 4.5 : 2.2}
          fill={index === selectedIndex ? 'var(--color-paper)' : 'var(--color-azure)'} stroke="var(--color-violet)" strokeWidth={index === selectedIndex ? 2 : 0} />)}
        {dateLabels.map((index) => <text key={active[index]!.date} x={x(index)} y={HEIGHT - 12}
          textAnchor={index === 0 ? 'start' : index === active.length - 1 ? 'end' : 'middle'} fill="var(--color-faint)" fontSize="9">
          {formatShortDate(active[index]!.date, locale)}
        </text>)}
      </svg>
    </div>
  </figure>;
}

function axisLabelIndexes(length: number): number[] {
  return [...new Set([0, Math.round((length - 1) * 0.25), Math.round((length - 1) * 0.5), Math.round((length - 1) * 0.75), length - 1])];
}

function rangeButtonLabel(range: ChartRange, locale: string): string {
  const language = locale.split('-')[0];
  if (range === 'all') return ({ fr: 'Tout', es: 'Todo', pt: 'Tudo', it: 'Tutto', ja: '全期間' } as Record<string, string>)[language ?? ''] ?? 'All';
  if (range === 90) return '3 M';
  if (range === 365) return language === 'ja' ? '1年' : language === 'en' ? '1 Y' : '1 A';
  if (language === 'ja') return `${range}日`;
  return `${range} ${language === 'fr' || language === 'it' ? 'J' : 'D'}`;
}

function formatRangeLabel(range: ChartRange, locale: string): string {
  const language = locale.split('-')[0];
  const all = ({
    fr: 'Historique disponible',
    es: 'Historial disponible',
    pt: 'Histórico disponível',
    it: 'Cronologia disponibile',
    ja: '利用可能な履歴',
  } as Record<string, string>)[language ?? ''] ?? 'Available history';
  if (range === 'all') return all;
  return ({
    fr: `Sur ${range} jours`,
    es: `Últimos ${range} días`,
    pt: `Últimos ${range} dias`,
    it: `Ultimi ${range} giorni`,
    ja: `過去${range}日`,
  } as Record<string, string>)[language ?? ''] ?? `Last ${range} days`;
}

function formatShortDate(date: string, locale: string): string {
  return formatDate(date, locale, { day: 'numeric', month: 'short' }, '');
}

function formatValue(value: number, currency: Currency, locale: string): string {
  return formatMoney({ minor: Math.round(value * 100), currency }, locale);
}

function formatAxisValue(value: number, currency: Currency, locale: string): string {
  return formatMoney({ minor: Math.round(value * 100), currency }, locale, { compact: true, showDecimals: false });
}
