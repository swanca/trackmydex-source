import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { GradePanel } from '@/components/scan/GradePanel';
import { MobileHandoff } from '@/components/scan/MobileHandoff';
import { localizedAlternates } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'home' });
  return {
    title: t('gradeCtaTitle'),
    description: t('gradeCtaBody'),
    alternates: localizedAlternates(locale, '/grade'),
  };
}

export default async function GradePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <>
      <PageHeader title={t('home.gradeCtaTitle')} eyebrow={t('home.gradeCtaBody')} />
      <PageSection className="space-y-4">
        <Link href="/scan" className="inline-flex min-h-11 items-center text-sm font-semibold text-azure underline underline-offset-4">
          {t('nav.scan')}
        </Link>
        <MobileHandoff
          title={t('scan.desktopTitle')}
          body={t('scan.desktopBody')}
          openOnPhone={t('scan.openOnPhone')}
          copyLink={t('scan.copyLink')}
          copied={t('scan.copied')}
        />
        <GradePanel />
      </PageSection>
    </>
  );
}
