import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Small, dependency-free Docker image. Works unchanged on Vercel/Fly/Render/Coolify.
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Card art is served from the provider CDN, never re-hosted by us.
    remotePatterns: [
      { protocol: 'https', hostname: 'assets.tcgdex.net' },
      { protocol: 'https', hostname: 'images.pokemontcg.io' },
      // Fallback artwork for the 10,000 cards the catalogue provider has
      // no image for. Without this host listed, next/image answers 400 and
      // those cards render blank - the file is stored, it simply cannot be
      // served.
      { protocol: 'https', hostname: 'tcgplayer-cdn.tcgplayer.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  experimental: {
    optimizePackageImports: ['@tanstack/react-query'],
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      },
    ];
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
