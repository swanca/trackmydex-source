import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { legalIdentity } from '@/lib/env';
import { LEGAL_DOCUMENTS, LEGAL_SECTIONS, type LegalDocument } from '@/lib/legal';

/**
 * The legal pages.
 *
 * What the software does with data is knowable, so it is stated outright and
 * in full - a privacy policy that says "we may collect certain information"
 * is worthless to a reader and, as Google's OAuth verification pointed out,
 * insufficient as a document.
 *
 * The genuinely operator-specific facts - who runs this instance, where to
 * write, under which law - come from configuration instead of being invented,
 * and they degrade to something truthful rather than to a bracket. The draft
 * notice below is then driven by whether any bracket actually survived, so
 * the warning disappears on its own as the operator fills things in instead
 * of sitting there contradicting a finished page.
 */

/** Bumped by hand when the substance changes, not on every deploy. */
const LAST_UPDATED = '2026-09-20';

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((document) => ({ document }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; document: string }>;
}): Promise<Metadata> {
  const { locale, document } = await params;
  if (!(LEGAL_DOCUMENTS as readonly string[]).includes(document)) return {};
  const t = await getTranslations({ locale, namespace: 'legal' });
  return {
    title: t(`${document as LegalDocument}.title` as never),
    // Verification crawlers must be able to read these, and a thin page that
    // is also noindex reads as an afterthought.
    robots: { index: true, follow: true },
  };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string; document: string }>;
}) {
  const { locale, document } = await params;
  setRequestLocale(locale);
  if (!(LEGAL_DOCUMENTS as readonly string[]).includes(document)) notFound();

  const key = document as LegalDocument;
  const t = await getTranslations();
  const identity = legalIdentity();

  // A bracket is what tells the draft notice below that something is still
  // missing, so the marker keeps its brackets - but its words are translated
  // rather than left in one language for every reader.
  const todo = `[${t('legal.missing')}]`;

  const values: Record<string, string> = {
    publisher: identity.publisher,
    contact: identity.contact,
    site: identity.site,
    address: identity.address || todo,
    jurisdiction: identity.jurisdiction || todo,
    date: LAST_UPDATED,
  };

  // next-intl infers a message's parameters from a literal key. These are
  // assembled from the section list at runtime, so it narrows them to `never`
  // and refuses the values object; the section list is what keeps them honest.
  const translate = t as unknown as (
    key: string,
    values?: Record<string, string>,
  ) => string;

  const intro = key === 'privacy' ? translate('legal.privacy.intro', values) : null;
  const sections = LEGAL_SECTIONS[key].map((section) => ({
    id: section,
    heading: translate(`legal.${key}.${section}.heading`),
    body: translate(`legal.${key}.${section}.body`, values),
  }));

  // Only warn about an unfinished document when one genuinely is. The privacy
  // policy has no brackets left at all, which is the point.
  const unfinished = sections.some((section) => section.body.includes('['));

  return (
    <>
      <PageHeader
        backHref="/"
        backLabel={t('nav.home')}
        eyebrow={t('legal.eyebrow')}
        title={t(`legal.${key}.title` as never)}
      />
      <PageSection className="space-y-6 pb-12">
        {unfinished ? (
          <p className="type-meta max-w-[68ch] rounded-xl border border-[rgb(245_181_68/0.28)] bg-[rgb(245_181_68/0.08)] px-3.5 py-2.5 text-[0.8125rem] text-amber">
            {t('legal.draftNotice')}
          </p>
        ) : null}

        {intro ? (
          <p className="max-w-[68ch] text-[0.9375rem] leading-relaxed text-muted">
            {intro}
          </p>
        ) : null}

        {sections.map((section) => (
          <section key={section.id} className="max-w-[68ch] space-y-2">
            <h2 className="font-display text-[0.9375rem] font-bold text-paper">
              {section.heading}
            </h2>
            <p className="type-meta text-[0.875rem] leading-relaxed whitespace-pre-line">
              {section.body}
            </p>
          </section>
        ))}

        <p className="type-meta text-[0.75rem] text-faint">
          {t('legal.updated', values)}
        </p>
      </PageSection>
    </>
  );
}
