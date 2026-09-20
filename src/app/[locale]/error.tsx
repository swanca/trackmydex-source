'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/States';

/**
 * Route-level error boundary.
 *
 * The digest is shown because it is the only thing that ties what the user saw
 * to a line in the server log - without it, "it broke" is unsupportable. The
 * message itself is never shown: it can contain internals.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const t = useTranslations();

  return (
    <div className="px-5 py-16 lg:px-8">
      <ErrorState
        title={t('app.error')}
        body={t('app.errorBody')}
        action={<Button onClick={reset}>{t('app.retry')}</Button>}
      />
      {error.digest ? (
        <p className="mt-4 text-center font-mono text-[0.6875rem] text-faint">{error.digest}</p>
      ) : null}
    </div>
  );
}
