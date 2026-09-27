import { cn } from '@/lib/cn';

/** Referral link supplied by the site owner. */
export function WhatnotLink({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href="https://whatnot.com/invite/imfromfar"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Whatnot : jusqu'à 200 € offerts à l'inscription"
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl text-muted transition-colors hover:bg-[rgb(148_163_208/0.08)] hover:text-paper',
        compact ? 'size-11 justify-center lg:hidden' : 'mx-1 mb-6 px-2 text-[0.75rem] font-semibold',
      )}
    >
      <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-md bg-[#ff5a36] text-[0.65rem] font-black text-white">
        W
      </span>
      {!compact ? <span>Whatnot · jusqu'à 200 € offerts</span> : null}
    </a>
  );
}
