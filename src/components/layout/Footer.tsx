import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';

/**
 * The footer exists for the legal links and nothing else.
 *
 * Kept deliberately thin: on a phone every row here is a row not showing
 * cards, and these are pages people visit once if ever. The trademark line
 * stays visible though - an unofficial tracker should say so on every page,
 * not bury it three clicks deep.
 */
export async function Footer() {
  const t = await getTranslations();

  return (
    <footer className="mt-12 border-t border-hairline px-5 pt-6 pb-8 lg:px-8">
      <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[0.75rem] text-muted">
        <Link href="/legal/terms" className="transition-colors hover:text-paper">
          {t('legal.terms.title')}
        </Link>
        <Link href="/legal/privacy" className="transition-colors hover:text-paper">
          {t('legal.privacy.title')}
        </Link>
        <Link href="/legal/legal-notice" className="transition-colors hover:text-paper">
          {t('legal.legal-notice.title')}
        </Link>
      </nav>
      <p className="mt-3 max-w-[68ch] text-[0.6875rem] leading-relaxed text-faint">
        {t('legal.trademark')}
      </p>
    </footer>
  );
}
