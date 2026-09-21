import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { archivo, plexMono } from '@/lib/fonts';
import { getCurrentUser, isAdmin } from '@/lib/session';
import { BottomNav } from '@/components/layout/BottomNav';
import { DesktopRail } from '@/components/layout/DesktopRail';
import { PwaInstallPrompt } from '@/components/pwa/PwaInstallPrompt';
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar';
import { UtilityBar } from '@/components/layout/UtilityBar';
import { Footer } from '@/components/layout/Footer';
import { GuestCollectionBanner } from '@/components/collection/GuestCollectionBanner';
import { THEME_INIT_SCRIPT } from '@/components/layout/ThemeSwitcher';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: '#05070f',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  // Zooming stays available: capping it would fail WCAG 1.4.4 and punish anyone
  // reading a card number on a small screen.
  maximumScale: 5,
  viewportFit: 'cover',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });

  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
    title: { default: t('homeTitle'), template: '%s · TrackMyDex' },
    description: t('homeDescription'),
    applicationName: 'TrackMyDex',
    appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'TrackMyDex' },
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [
        { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
    },
    formatDetection: { telephone: false },
    openGraph: { type: 'website', siteName: 'TrackMyDex', locale },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const [t, user] = await Promise.all([getTranslations({ locale }), getCurrentUser()]);

  const navLabels = {
    home: t('nav.home'),
    collection: t('nav.collection'),
    search: t('nav.search'),
    sets: t('nav.sets'),
    sealed: t('nav.sealed'),
    wishlist: t('nav.wishlist'),
    scan: t('nav.scan'),
  };

  return (
    <html lang={locale} className={`${archivo.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        {/*
          Applies the saved theme before first paint. Without this the page
          renders in the default dark navy and then snaps to black or light,
          which is the single most noticeable flaw a theme switcher can have.
          It has to be inline and blocking; a deferred script is already too
          late.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <NextIntlClientProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-slate-hi focus:px-4 focus:py-2 focus:text-sm"
          >
            {t('a11y.skipToContent')}
          </a>

          <DesktopRail
            labels={{
              ...navLabels,
              profile: t('nav.profile'),
              admin: t('nav.admin'),
              signIn: t('nav.signIn'),
            }}
            isAdmin={isAdmin(user)}
            signedIn={Boolean(user)}
          />

          <div className="lg:pl-[232px]">
            <div className="mx-auto w-full max-w-5xl">
              <UtilityBar />
            </div>
            <div className="mx-auto w-full max-w-5xl">
              <GuestCollectionBanner signedIn={Boolean(user)} />
            </div>
            <main id="main" className="pb-nav mx-auto w-full max-w-5xl lg:pb-16">
              {children}
            </main>
            <div className="pb-nav mx-auto w-full max-w-5xl lg:pb-0">
              <Footer />
            </div>
          </div>

          {/* "Produits scellés" does not fit a seventh of a phone. */}
          <BottomNav labels={{ ...navLabels, sealed: t('nav.sealedShort') }} />

          <ServiceWorkerRegistrar />

          <PwaInstallPrompt
            labels={{
              title: t('pwa.installTitle'),
              body: t('pwa.installBody'),
              install: t('pwa.install'),
              dismiss: t('pwa.dismiss'),
              iosTitle: t('pwa.iosTitle'),
              iosBody: t('pwa.iosBody'),
            }}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
