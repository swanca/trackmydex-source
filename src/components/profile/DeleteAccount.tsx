'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';

/**
 * Account deletion.
 *
 * Irreversible, so it asks for the word DELETE rather than a yes/no. Foreign
 * keys cascade, which means the collection, wishlist and snapshots go with the
 * account - there is no orphaned data left behind to leak later.
 */
export function DeleteAccount({
  labels,
}: {
  labels: { action: string; confirm: string; cancel: string; body: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        {labels.action}
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={labels.action}
        description={labels.body}
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {labels.cancel}
            </Button>
            <Button
              variant="danger"
              fullWidth
              disabled={value !== 'DELETE'}
              loading={pending}
              onClick={() =>
                start(async () => {
                  const { error: cause } = await authClient.deleteUser({});
                  if (cause) {
                    setError(cause.message ?? 'Failed');
                    return;
                  }
                  router.push('/');
                  router.refresh();
                })
              }
            >
              {labels.action}
            </Button>
          </div>
        }
      >
        <Input
          label={labels.confirm}
          value={value}
          autoComplete="off"
          onChange={(event) => setValue(event.target.value)}
          {...(error ? { error } : {})}
        />
      </Sheet>
    </>
  );
}
