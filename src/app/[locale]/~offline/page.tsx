import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/States';

export const dynamic = 'force-static';

/**
 * Offline fallback.
 *
 * Precached by the service worker and served for any navigation that cannot
 * reach the network. It states what still works rather than only reporting a
 * failure.
 */
export default async function OfflinePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <>
      <PageHeader title={t('app.offline')} />
      <PageSection>
        <EmptyState title={t('app.offline')} body={t('app.offlineBody')} />
      </PageSection>
    </>
  );
}
