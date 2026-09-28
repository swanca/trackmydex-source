import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { Surface } from '@/components/ui/Surface';
import { localizedAlternates } from '@/lib/seo';

const steps = [
  { key: 'step1', href: '/search' },
  { key: 'step2', href: '/sets' },
  { key: 'step3', href: '/scan' },
  { key: 'step4', href: '/collection/import' },
  { key: 'step5', href: '/collection' },
  { key: 'step6', href: '/collection' },
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tutorial' });
  return {
    title: t('title'),
    description: t('intro'),
    alternates: localizedAlternates(locale, '/tutorial'),
    openGraph: { title: t('title'), description: t('intro'), type: 'article' },
  };
}

export default async function TutorialPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('tutorial');
  const howTo = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: t('title'),
    description: t('intro'),
    step: steps.map(({ key }) => ({
      '@type': 'HowToStep',
      name: t(`${key}Title`),
      text: t(`${key}Body`),
    })),
  };

  return (
    <>
      <PageHeader title={t('title')} eyebrow={t('eyebrow')} />
      <PageSection className="space-y-7">
        <p className="max-w-[68ch] text-[0.95rem] leading-7 text-muted">{t('intro')}</p>

        <section aria-labelledby="tutorial-steps">
          <h2 id="tutorial-steps" className="type-section mb-3">{t('stepsTitle')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {steps.map(({ key, href }, index) => (
              <Surface key={key} as="article" className="flex h-full flex-col p-5">
                <p className="type-eyebrow text-violet">{String(index + 1).padStart(2, '0')}</p>
                <h3 className="mt-2 text-[1rem] font-semibold text-paper">{t(`${key}Title`)}</h3>
                <p className="mt-2 flex-1 text-[0.875rem] leading-6 text-muted">{t(`${key}Body`)}</p>
                <Link
                  href={href}
                  className="mt-4 inline-flex w-fit rounded-lg border border-hairline px-3 py-2 text-[0.8125rem] font-medium text-paper transition-colors hover:border-violet hover:bg-[rgb(139_92_246/0.12)]"
                >
                  {t(`${key}Action`)}
                </Link>
              </Surface>
            ))}
          </div>
        </section>

        <Surface className="p-5">
          <h2 className="type-section text-paper">{t('desktopTitle')}</h2>
          <p className="mt-2 max-w-[68ch] text-[0.875rem] leading-6 text-muted">{t('desktopBody')}</p>
          <Link href="/scan" className="mt-4 inline-flex text-[0.875rem] font-semibold text-violet hover:text-paper">
            {t('desktopAction')}
          </Link>
        </Surface>

        <Surface className="p-5">
          <h2 className="type-section text-paper">{t('privacyTitle')}</h2>
          <p className="mt-2 max-w-[68ch] text-[0.875rem] leading-6 text-muted">{t('privacyBody')}</p>
        </Surface>
      </PageSection>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howTo).replace(/</g, '\\u003c') }} />
    </>
  );
}
