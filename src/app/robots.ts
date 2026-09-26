import type { MetadataRoute } from 'next';
import { APP_ORIGIN } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/*/admin',
        '/*/auth/',
        '/*/collection',
        '/*/profile',
        '/*/scan',
        '/*/wishlist',
        '/*/~offline',
      ],
    },
    sitemap: `${APP_ORIGIN}/sitemap.xml`,
  };
}
