'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleWishlist } from '@/lib/api-client';

export function WishlistRemoveButton({
  cardVariantId,
  language,
  label,
}: {
  cardVariantId: string;
  language: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      aria-label={label}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await toggleWishlist({ cardVariantId, language, remove: true });
          router.refresh();
        })
      }
      className="inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[rgb(240_87_111/0.12)] hover:text-rose disabled:opacity-40"
    >
      <svg viewBox="0 0 20 20" aria-hidden className="size-4">
        <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}
