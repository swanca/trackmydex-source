import type { ReactNode } from 'react';
import { ChevronDownIcon } from '@/components/layout/icons';

/**
 * An era, closed until asked for.
 *
 * Built on `<details>` rather than React state on purpose: it needs no
 * hydration, keyboard and screen-reader behaviour come free, and the whole
 * sets page stays a server component. The era header is still fully visible
 * while closed, so the progress bar a collector scans for - "what am I close
 * to finishing" - survives the collapse. Only the rows are folded away.
 */
export function EraDisclosure({
  header,
  count,
  countLabel,
  defaultOpen = false,
  children,
}: {
  header: ReactNode;
  count: number;
  countLabel: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="group space-y-3" open={defaultOpen}>
      <summary
        className={[
          'cursor-pointer list-none rounded-[var(--radius-card)]',
          'outline-none focus-visible:ring-2 focus-visible:ring-[rgb(139_92_246/0.6)]',
          // Safari still paints its own triangle without this.
          '[&::-webkit-details-marker]:hidden',
        ].join(' ')}
      >
        <div className="relative">
          {header}
          <span className="type-meta pointer-events-none absolute right-5 bottom-3 flex items-center gap-1.5 text-[0.75rem]">
            {countLabel}
            <ChevronDownIcon
              className="size-4 transition-transform duration-200 group-open:rotate-180"
              aria-hidden
            />
          </span>
        </div>
      </summary>
      {count > 0 ? children : null}
    </details>
  );
}
