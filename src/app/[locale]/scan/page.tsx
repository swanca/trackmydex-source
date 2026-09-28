import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getCurrentUser } from '@/lib/session';
import { resolvePreferences } from '@/lib/user-prefs';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { CardScanner } from '@/components/scan/CardScanner';
import { MobileHandoff } from '@/components/scan/MobileHandoff';
import { Link } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'scan' });
  return { title: t('title'), description: t('subtitle') };
}

export default async function ScanPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();
  const user = await getCurrentUser();
  const prefs = resolvePreferences(user, locale);

  return (
    <>
      <PageHeader title={t('scan.title')} eyebrow={t('scan.subtitle')} />

      <PageSection className="space-y-4">
        <Link href="/grade" className="inline-flex min-h-11 items-center text-sm font-semibold text-azure underline underline-offset-4">
          {t('scan.gradeQuickLink')}
        </Link>
        <MobileHandoff
          title={t('scan.desktopTitle')}
          body={t('scan.desktopBody')}
          openOnPhone={t('scan.openOnPhone')}
          copyLink={t('scan.copyLink')}
          copied={t('scan.copied')}
        />
        <CardScanner
          locale={locale}
          cardLanguage={prefs.cardLanguage}
          displayCurrency={prefs.displayCurrency}
          signedIn={Boolean(user)}
          labels={{
            hintSearching: t('scan.hintSearching'),
            hintCloser: t('scan.hintCloser'),
            hintFarther: t('scan.hintFarther'),
            hintReady: t('scan.hintReady'),
            start: t('scan.start'),
            stop: t('scan.stop'),
            choosePhoto: t('scan.choosePhoto'),
            retake: t('scan.retake'),
            scanning: t('scan.scanning'),
            noCamera: t('scan.noCamera'),
            permissionDenied: t('scan.permissionDenied'),
            noMatch: t('scan.noMatch'),
            noMatchBody: t('scan.noMatchBody'),
            detected: t('scan.detected', { count: 0 }).replace('0', '{count}'),
            confirmTitle: t('scan.confirmTitle'),
            confirmBody: t('scan.confirmBody'),
            add: t('scan.add'),
            added: t('scan.added'),
            skip: t('scan.skip'),
            uncertain: t('scan.uncertain'),
            tipsTitle: t('scan.tipsTitle'),
            tips: [0, 1, 2, 3].map((i) => t(`scan.tips.${i}` as never)),
            viewMarket: t('scan.viewMarket'),
          }}
        />
      </PageSection>
    </>
  );
}
