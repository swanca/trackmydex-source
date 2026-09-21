import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { getCurrentUser, isAdmin } from '@/lib/session';
import { AccountMenu } from './AccountMenu';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Logo } from './Logo';

/**
 * The top bar, on every page.
 *
 * The mark on the left, language and the account menu on the right.
 *
 * The theme is not here. It is chosen once and then left alone for months, so
 * it lives in preferences, where there is room for its name and a swatch,
 * rather than as a permanent control competing with things people press every
 * visit. Language stays visible - somebody reading the wrong one needs it
 * immediately and cannot be expected to go looking.
 *
 * The mark is hidden from large screens because the left rail already carries
 * it there; on a phone there is no rail, and a site with no logo anywhere on
 * the screen reads as unfinished.
 */
export async function UtilityBar() {
  const t = await getTranslations();
  const user = await getCurrentUser();

  return (
    <div className="pt-safe flex items-center gap-2 px-5 pt-3 lg:px-8 lg:pt-5">
      {/* Padded to a 44px target: the mark alone is 28px, which is below the
          minimum anyone can reliably hit with a thumb. */}
      <Link
        href="/"
        className="-m-2 shrink-0 p-2 lg:hidden"
        aria-label={t('nav.home')}
      >
        <Logo markClassName="size-7" showWordmark={false} />
      </Link>

      <div className="ml-auto flex items-center gap-2">
        <LanguageSwitcher label={t('nav.language')} />
        <AccountMenu
          signedIn={Boolean(user)}
          isAdmin={isAdmin(user)}
          email={user?.email ?? null}
        />
      </div>
    </div>
  );
}
