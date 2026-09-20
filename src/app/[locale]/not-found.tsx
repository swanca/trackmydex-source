import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';

export default async function NotFound() {
  const t = await getTranslations();

  return (
    <div className="px-5 py-16 lg:px-8">
      <EmptyState
        title={t('app.notFound')}
        body={t('app.notFoundBody')}
        action={
          <Link href="/">
            <Button>{t('nav.home')}</Button>
          </Link>
        }
      />
    </div>
  );
}
