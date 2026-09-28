import { getTranslations } from 'next-intl/server';
import { getCurrentUser, isAdmin } from '@/lib/session';
import { AccountMenu } from './AccountMenu';
import { LanguageSwitcher } from './LanguageSwitcher';
import { KoFiLink } from './KoFiLink';
import { WhatnotLink } from './WhatnotLink';

/**
 * The top bar, on every page.
 *
 * Referral/support actions on the left, language and account on the right.
 *
 * The theme is not here. It is chosen once and then left alone for months, so
 * it lives in preferences, where there is room for its name and a swatch,
 * rather than as a permanent control competing with things people press every
 * visit. Language stays visible - somebody reading the wrong one needs it
 * immediately and cannot be expected to go looking.
 *
 * The TrackMyDex mark is deliberately absent on phones: the bottom navigation
 * already identifies the product and the narrow row is more useful to the
 * Whatnot offer requested by the publisher.
 */
export async function UtilityBar() {
  const t = await getTranslations();
  const user = await getCurrentUser();

  return (
    <div className="pt-safe flex items-center gap-1 px-3 pt-3 sm:gap-2 sm:px-5 lg:px-8 lg:pt-5">
      <WhatnotLink compact />

      <div className="ml-auto flex items-center gap-2">
        <LanguageSwitcher label={t('nav.language')} />
        <AccountMenu
          signedIn={Boolean(user)}
          isAdmin={isAdmin(user)}
          email={user?.email ?? null}
        />
        <KoFiLink compact />
      </div>
    </div>
  );
}
