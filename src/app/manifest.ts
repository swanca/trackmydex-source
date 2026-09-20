import type { MetadataRoute } from 'next';

/**
 * Web app manifest.
 *
 * `standalone` so an installed copy launches without browser chrome, and the
 * theme colour matches the app background exactly - a mismatch shows as a
 * coloured band above the status bar on Android.
 *
 * Shortcuts cover the two things people open the app to do: add a card they
 * just pulled, and check what a set is worth.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TrackMyDex: TCG collection tracker for Pokémon',
    short_name: 'TMD',
    description:
      'Track every Pokémon TCG card you own, across every set, era and language, with live market estimates.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#05070f',
    theme_color: '#05070f',
    categories: ['utilities', 'productivity', 'entertainment'],
    lang: 'en',
    dir: 'ltr',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'Search cards', short_name: 'Search', url: '/en/search' },
      { name: 'My collection', short_name: 'Collection', url: '/en/collection' },
      { name: 'Sets', short_name: 'Sets', url: '/en/sets' },
    ],
  };
}
