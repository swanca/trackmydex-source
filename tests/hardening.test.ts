import { readFileSync } from 'node:fs';
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
    const cron = source('deploy/cron.sh');
    expect(cron).toMatch(/status=\$\?/);
    expect(cron).toMatch(/exit "\$status"/);
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
  it('keeps the official local symbol and visible text in one link', () => {
    const component = source('src/components/layout/KoFiLink.tsx');
    expect(component).toContain('https://ko-fi.com/imfrom');
    expect(component).toContain('/brand/kofi-symbol.avif');
    expect(component).toContain('Buy me a coffee');
  });
});
