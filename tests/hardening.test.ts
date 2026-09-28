import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderActionEmail } from '@/lib/mail';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('theme-safe native selects', () => {
  it('gives every native option an explicit themed background and foreground', () => {
    const css = source('src/app/globals.css');
    expect(css).toMatch(/select\s+option[\s\S]*background[^;]*var\(--color-slate\)/);
    expect(css).toMatch(/select\s+option[\s\S]*color[^;]*var\(--color-paper\)/);
  });
});

describe('preferences', () => {
  it('refreshes the Better Auth session cookie when preferences change', () => {
    const form = source('src/components/profile/PreferencesForm.tsx');
    expect(form).toContain('authClient.updateUser');
    expect(form).not.toContain('updatePreferences(form)');
  });
});

describe('mobile administration', () => {
  it('exposes the admin route from the mobile account menu for admins', () => {
    const menu = source('src/components/layout/AccountMenu.tsx');
    const utility = source('src/components/layout/UtilityBar.tsx');
    expect(menu).toContain('isAdmin');
    expect(menu).toContain('href="/admin"');
    expect(utility).toContain('isAdmin(user)');
  });
});

describe('email verification', () => {
  it('is enabled by default', () => {
    expect(source('src/lib/env.ts')).toContain('AUTH_REQUIRE_EMAIL_VERIFICATION: booleanish.default(true)');
    expect(source('.env.example')).toContain('AUTH_REQUIRE_EMAIL_VERIFICATION=true');
  });

  it('shows a pending confirmation state and supports resending', () => {
    const form = source('src/components/auth/AuthForm.tsx');
    expect(form).toContain('verificationPending');
    expect(form).toContain('sendVerificationEmail');
    expect(form).toMatch(/signUp\.email\([\s\S]*if \(emailVerificationRequired\)/);
  });

  it('renders the supplied icon in transactional mail', () => {
    const html = renderActionEmail({
      heading: 'Confirm',
      body: 'Body',
      actionLabel: 'Confirm',
      actionUrl: 'https://example.test/verify',
      footer: 'Footer',
      icon: '✉',
    } as Parameters<typeof renderActionEmail>[0]);
    expect(html).toContain('✉');
  });
});

describe('search indexing essentials', () => {
  it('publishes robots and sitemap metadata routes', () => {
    expect(source('src/app/robots.ts')).toContain('sitemap:');
    const sitemap = source('src/app/sitemap.ts');
    expect(sitemap).toContain('alternates:');
    expect(sitemap).toContain("dynamic = 'force-dynamic'");
    expect(sitemap).toContain('unstable_cache');
    expect(sitemap).toContain('revalidate: 86_400');
    expect(sitemap).toContain('SITEMAP_CHUNK_SIZE = 5_000');
  });

  it('centralizes canonical and hreflang URLs', () => {
    const seo = source('src/lib/seo.ts');
    expect(seo).toContain('NEXT_PUBLIC_APP_URL');
    expect(seo).toContain('canonical:');
    expect(seo).toContain("'x-default'");
  });
});

describe('catalog cron', () => {
  it('returns the sync command failure status', () => {
    if (!existsSync(resolve(process.cwd(), 'deploy/cron.sh'))) return;
    const cron = source('deploy/cron.sh');
    expect(cron).toMatch(/status=\$\?/);
    expect(cron).toMatch(/exit "\$status"/);
  });
});

describe('translation sync resilience', () => {
  it('commits translation batches and exposes absent versus failed sets', () => {
    const sync = source('src/server/sync/catalog.ts');
    expect(sync).toContain('const TRANSLATION_BATCH = 100');
    expect(sync).toContain('translations.${language}.absent');
    expect(sync).toContain('translations.${language}.failed');
    expect(sync).toContain("translations.batch_done");
  });
});

describe('collection sharing safety', () => {
  it('keeps shared pages out of search while allowing followed links', () => {
    const page = source('src/app/[locale]/shared/[token]/page.tsx');
    expect(page).toContain('index: false');
    expect(page).toContain('follow: true');
  });

  it('protects every share mutation with authenticated handlers', () => {
    const route = source('src/app/api/collection/share/route.ts');
    expect(route.match(/= authed\(/g)).toHaveLength(4);
  });

  it('uses native share or copy for platforms without web intents', () => {
    const sheet = source('src/components/collection/ShareCollection.tsx');
    expect(sheet).toContain('navigator.share');
    expect(sheet).toContain('navigator.clipboard.writeText');
    expect(sheet).not.toMatch(/instagram\.com\/share|discord\.com\/share/);
  });

  it('keeps fast add defaults unchanged', () => {
    const editor = source('src/components/cards/CardEntryEditor.tsx');
    const actions = source('src/components/cards/CardActions.tsx');
    expect(editor).toContain("condition: 'near_mint'");
    expect(editor).toContain('language: defaultLanguage');
    expect(editor).toContain('variantId: variants[0]?.id');
    expect(actions).toContain("condition: 'near_mint'");
  });
});

describe('Ko-fi support link', () => {
  it('keeps the official local symbol and desktop label in one link', () => {
    const component = source('src/components/layout/KoFiLink.tsx');
    expect(component).toContain('https://ko-fi.com/imfrom');
    expect(component).toContain('/brand/kofi-symbol.avif');
    expect(component).toContain('Buy me a coffee');
  });
});

describe('Whatnot referral link', () => {
  it('uses the owner-provided referral URL, current mark and current offer', () => {
    const component = source('src/components/layout/WhatnotLink.tsx');
    expect(component).toContain('https://whatnot.com/invite/imfromfar');
    expect(component).toContain('/brand/whatnot-symbol.svg');
    expect(component).toContain("Jusqu'à 200 € offerts");
    expect(component).not.toContain('Pokémon 30 ans');
  });

  it('uses the two-lobed Whatnot W mark rather than a single V chevron', () => {
    const logo = source('public/brand/whatnot-symbol.svg');
    expect(logo.match(/fill="#ffe100"/g)).toHaveLength(2);
    expect(logo).toContain('data-mark="whatnot-w"');
  });

  it('is first on mobile, with no duplicate TrackMyDex mark', () => {
    const utility = source('src/components/layout/UtilityBar.tsx');
    expect(utility).not.toContain('<Logo');
    expect(utility.indexOf('<WhatnotLink')).toBeLessThan(utility.indexOf('<KoFiLink'));
  });

  it('adds concise marketplace copy to the global footer without invitation wording', () => {
    const footer = source('src/components/layout/Footer.tsx');
    expect(footer).toContain('whatnot.com/invite/imfromfar');
    expect(footer).toContain('boosters Pokémon');
    expect(footer).toContain("Jusqu'à 200 € offerts");
    expect(footer).not.toContain("lien d'invitation");
  });
});

describe('public tutorial', () => {
  it('is reachable from the account menu, footer and sitemap, not the desktop rail', () => {
    expect(source('src/app/[locale]/tutorial/page.tsx')).toContain("href: '/scan'");
    expect(source('src/components/layout/DesktopRail.tsx')).not.toContain('href="/tutorial"');
    expect(source('src/components/layout/AccountMenu.tsx')).toContain('href="/tutorial"');
    expect(source('src/components/layout/Footer.tsx')).toContain('href="/tutorial"');
    expect(source('src/app/sitemap.ts')).toContain("entry('/tutorial')");
  });
});

describe('scanner UX', () => {
  it('auto-captures without a manual shutter and hides technical notices', () => {
    const scanner = source('src/components/scan/CardScanner.tsx');
    const page = source('src/app/[locale]/scan/page.tsx');
    expect(scanner).not.toContain('labels.indexIncomplete');
    expect(scanner).not.toContain('onClick={() => void capture(false)}');
    expect(scanner).toContain("t('inspection.camera')");
    expect(scanner).toContain("t('inspection.gallery')");
    expect(page).not.toContain("t('scan.language')");
    expect(page).not.toContain("t('scan.privacy')");
  });

  it('automatically detects and rectifies grading photos', () => {
    const photo = source('src/components/scan/GradePhoto.tsx');
    expect(photo).toContain('detectCards');
    expect(photo).toContain('autoCrop');
    expect(photo).toContain('rectifyCard');
  });
});

describe('card navigation', () => {
  it('uses browser history from card detail with a safe set fallback', () => {
    const page = source('src/app/[locale]/cards/[cardId]/page.tsx');
    const header = source('src/components/layout/PageHeader.tsx');
    const historyLink = source('src/components/layout/HistoryBackLink.tsx');
    expect(page).toContain('backMode="history"');
    expect(header).toContain("backMode === 'history'");
    expect(historyLink).toContain('router.back()');
  });
});

describe('premium navigation and catalogue', () => {
  it('keeps the mobile navigation to five primary destinations', () => {
    const nav = source('src/components/layout/BottomNav.tsx');
    expect(nav).toContain('grid-cols-5');
    expect(nav).toContain('href="/sets"');
    expect(nav).toContain("matchPrefixes={['/sets', '/sealed']}");
    expect(nav).not.toContain('href="/sealed"');
    expect(nav).not.toContain('href="/wishlist"');
    expect(nav).not.toContain('pb-1 text-[0.6875rem]');
  });

  it('opens the catalogue on series with sealed products as a tab', () => {
    const sets = source('src/app/[locale]/sets/page.tsx');
    const tabs = source('src/components/catalog/CatalogTabs.tsx');
    expect(sets).toContain('<CatalogTabs active="sets"');
    expect(sets).toContain('<SetShowcaseCard');
    expect(tabs).toContain('href="/sets"');
    expect(tabs).toContain('href="/sealed"');
  });
});

describe('standalone grading experience', () => {
  it('publishes grading outside the scanner and links both services', () => {
    const grade = source('src/app/[locale]/grade/page.tsx');
    const scan = source('src/app/[locale]/scan/page.tsx');
    expect(grade).toContain('<GradePanel');
    expect(grade).toContain("href=\"/scan\"");
    expect(scan).toContain("href=\"/grade\"");
    expect(scan).not.toContain('<GradePanel');
    expect(source('src/app/sitemap.ts')).toContain("entry('/grade')");
  });

  it('places grading before search and search directly before featured series', () => {
    const home = source('src/app/[locale]/page.tsx');
    const signedIn = home.slice(home.indexOf('<Surface className="relative'), home.indexOf('{!empty ?'));
    expect(signedIn.indexOf('<GradeCta')).toBeLessThan(signedIn.indexOf('<SearchLauncher'));
    expect(signedIn).toMatch(/<SearchLauncher \/>[\s\S]*?rails\.map/);

    const signedOut = home.slice(home.indexOf('async function SignedOutHome'));
    expect(signedOut.indexOf('<GradeCta')).toBeLessThan(signedOut.indexOf('<SearchLauncher'));
    expect(signedOut).toMatch(/<SearchLauncher \/>[\s\S]*?rails\.map/);
  });
});

describe('collection interaction polish', () => {
  it('keeps search on the home and series surfaces, not above the collection', () => {
    expect(source('src/app/[locale]/collection/page.tsx')).not.toContain('SearchLauncher');
  });

  it('keeps the chart interactive and marks inventory changes', () => {
    const chart = source('src/components/dashboard/ValueChart.tsx');
    expect(chart).toContain('pointsForRange');
    expect(chart).toContain('showInventoryEvents');
    expect(chart).toContain('onPointerDown');
  });

  it('adds one mobile sticky card action backed by the existing editor', () => {
    const editor = source('src/components/cards/CardEntryEditor.tsx');
    expect(editor).toContain('data-card-sticky-action');
    expect(editor).toContain('<QuantityStepper');
  });
});
