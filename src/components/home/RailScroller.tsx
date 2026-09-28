'use client';

import { useRef } from 'react';
import type { ReactNode } from 'react';

export function RailScroller({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const move = (direction: -1 | 1) => {
    ref.current?.scrollBy({ left: direction * Math.max(320, ref.current.clientWidth * 0.8), behavior: 'smooth' });
  };

  return <div className="group/rail relative">
    <ul ref={ref} aria-label={label} className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-5 pb-1 lg:-mx-8 lg:px-8">
      {children}
    </ul>
    <button type="button" onClick={() => move(-1)} aria-label={`${label} précédent`}
      className="surface-flat absolute top-1/2 left-2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full text-xl text-paper opacity-0 shadow-xl transition-opacity group-hover/rail:opacity-100 lg:flex">‹</button>
    <button type="button" onClick={() => move(1)} aria-label={`${label} suivant`}
      className="surface-flat absolute top-1/2 right-2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full text-xl text-paper opacity-0 shadow-xl transition-opacity group-hover/rail:opacity-100 lg:flex">›</button>
  </div>;
}
