'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { triggerSync } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';

/**
 * Manual job triggers.
 *
 * Jobs are fire-and-forget: the request returns as soon as the run row exists,
 * and progress is read from the run list below rather than held open in an HTTP
 * request that would time out on a 24,000-card import.
 */
export function SyncControls({
  labels,
}: {
  labels: {
    catalog: string;
    translations: string;
    prices: string;
    sealed: string;
    snapshot: string;
    triggered: string;
    running: string;
    generic: string;
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);

  function run(kind: 'catalog' | 'translations' | 'prices' | 'snapshot' | 'sealed') {
    setMessage(null);
    start(async () => {
      try {
        const result = await triggerSync(kind);
        setMessage({
          text: result.started ? labels.triggered : labels.running,
          tone: result.started ? 'ok' : 'warn',
        });
        router.refresh();
      } catch (cause) {
        setMessage({
          text: cause instanceof Error ? cause.message : labels.generic,
          tone: 'warn',
        });
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run('catalog')}>
          {labels.catalog}
        </Button>
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run('translations')}>
          {labels.translations}
        </Button>
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run('prices')}>
          {labels.prices}
        </Button>
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run('sealed')}>
          {labels.sealed}
        </Button>
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run('snapshot')}>
          {labels.snapshot}
        </Button>
      </div>
      {message ? (
        <p
          role="status"
          className={`text-[0.8125rem] ${message.tone === 'ok' ? 'text-mint' : 'text-amber'}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
