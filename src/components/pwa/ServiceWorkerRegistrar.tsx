'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker.
 *
 * Deliberately manual. The build-time plugin route does not work under
 * Turbopack, which Next 16 uses by default, so the worker is a hand-written
 * file in `public/` and this component is the only thing that knows about it.
 *
 * Registration is deferred until after load so it never competes with the
 * first paint on a mid-range phone, and it is skipped entirely in development
 * where a cached shell makes edits appear not to apply.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // A failed registration must never break the page: the app works
        // perfectly well without an offline cache.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
