import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getCurrentUser } from '@/lib/session';
import { resolvePreferences } from '@/lib/user-prefs';
import { LANGUAGE_LABELS, toUiLocale } from '@/lib/catalog/languages';
import { getScanIndexStats } from '@/server/services/scan';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { CardScanner } from '@/components/scan/CardScanner';
import { Badge } from '@/components/ui/Badge';

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
  const stats = await getScanIndexStats();

  const coverage = stats.total > 0 ? stats.hashed / stats.total : 0;
  const languageLabels = LANGUAGE_LABELS[toUiLocale(locale)];

  return (
    <>
      <PageHeader title={t('scan.title')} eyebrow={t('scan.subtitle')} />

      <PageSection className="space-y-4">
        {/* The printed language cannot be read off the artwork, so it is a
            setting the user makes, shown here rather than assumed silently. */}
        <div className="surface-flat flex items-center justify-between gap-3 rounded-[var(--radius-tile)] px-4 py-3">
          <span className="type-eyebrow">{t('scan.language')}</span>
          <Badge tone="accent">{languageLabels[prefs.cardLanguage]}</Badge>
        </div>

        <CardScanner
          locale={locale}
          cardLanguage={prefs.cardLanguage}
          displayCurrency={prefs.displayCurrency}
          signedIn={Boolean(user)}
          indexComplete={coverage > 0.98}
          labels={{
            hintSearching: t('scan.hintSearching'),
            hintCloser: t('scan.hintCloser'),
            hintFarther: t('scan.hintFarther'),
            hintReady: t('scan.hintReady'),
            start: t('scan.start'),
            stop: t('scan.stop'),
            capture: t('scan.capture'),
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
            close: t('scan.close'),
            uncertain: t('scan.uncertain'),
            language: t('scan.language'),
            tipsTitle: t('scan.tipsTitle'),
            tips: [0, 1, 2, 3].map((i) => t(`scan.tips.${i}` as never)),
            indexIncomplete: t('scan.indexIncomplete'),
          viewMarket: t('scan.viewMarket'),
          }}
        />

        <p className="type-meta px-1 text-[0.75rem]">{t('scan.privacy')}</p>
      </PageSection>
    </>
  );
}
