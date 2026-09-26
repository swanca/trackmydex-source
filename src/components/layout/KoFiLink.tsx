import Image from 'next/image';
import { cn } from '@/lib/cn';

/** Official asset source: https://more.ko-fi.com/brand-assets */
export function KoFiLink({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href="https://ko-fi.com/imfrom"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Buy me a coffee on Ko-fi"
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-xl text-muted transition-colors hover:bg-[rgb(148_163_208/0.08)] hover:text-paper',
        compact ? 'px-2 text-[0.6875rem] font-semibold lg:hidden' : 'mx-1 mb-6 px-2 text-[0.8125rem] font-semibold',
      )}
    >
      <Image src="/brand/kofi-symbol.avif" alt="" width={24} height={24} className="size-6 rounded-md" />
      <span>Buy me a coffee</span>
    </a>
  );
}
