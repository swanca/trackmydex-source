'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';

export function DeleteCollection({
  labels,
}: {
  labels: { action: string; confirm: string; cancel: string; body: string; done: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <>
      {done ? <p className="text-sm text-mint">{labels.done}</p> : null}
      <Button variant="danger" onClick={() => setOpen(true)}>{labels.action}</Button>
      <Sheet
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={labels.action}
        description={labels.body}
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>{labels.cancel}</Button>
            <Button
              variant="danger"
              fullWidth
              loading={pending}
              onClick={() => start(async () => {
                setError(null);
                const response = await fetch('/api/collection', { method: 'DELETE' });
                if (!response.ok) {
                  const body = await response.json().catch(() => ({})) as { error?: string };
                  setError(body.error ?? 'Failed');
                  return;
                }
                setOpen(false);
                setDone(true);
                router.refresh();
              })}
            >
              {labels.confirm}
            </Button>
          </div>
        }
      >
        {error ? <p role="alert" className="text-sm text-rose">{error}</p> : null}
      </Sheet>
    </>
  );
}
