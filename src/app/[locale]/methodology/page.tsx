import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { localizedAlternates } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'methodology' });
  return { title: t('title'), description: t('intro'), alternates: localizedAlternates(locale, '/methodology') };
}

export default async function MethodologyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('methodology');
  return (
    <>
      <PageHeader title={t('title')} eyebrow={t('eyebrow')} />
      <PageSection className="space-y-6">
        <p className="max-w-[68ch] text-muted">{t('intro')}</p>
        {(['catalog', 'prices', 'limits'] as const).map((section) => (
          <section key={section} className="surface-flat rounded-[var(--radius-tile)] p-5">
            <h2 className="type-section text-paper">{t(`${section}Title`)}</h2>
            <p className="mt-2 max-w-[68ch] text-[0.875rem] leading-6 text-muted">{t(`${section}Body`)}</p>
          </section>
        ))}
      </PageSection>
    </>
  );
}
