import Image from 'next/image';
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
        'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl transition-all hover:-translate-y-px',
        compact
          ? 'max-w-[7.6rem] px-1.5 text-[0.66rem] font-semibold leading-tight text-paper lg:hidden'
          : 'mx-1 mb-3 border border-[#ffe100]/25 bg-[#ffe100]/10 px-2.5 text-[0.75rem] text-paper hover:border-[#ffe100]/45 hover:bg-[#ffe100]/15',
      )}
    >
      <Image
        src="/brand/whatnot-symbol.svg"
        alt=""
        width={32}
        height={32}
        className={cn('shrink-0 object-contain', compact ? 'size-8' : 'size-7')}
      />
      <span>{compact ? <>Jusqu'à 200 €<br />offerts</> : <>Whatnot · Jusqu'à 200 € offerts</>}</span>
    </a>
  );
}
