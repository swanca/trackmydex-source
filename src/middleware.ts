import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

/**
 * Locale routing only.
 *
 * Authorization deliberately does *not* live here. Middleware runs on the edge
 * without a database connection, so a session check here could only read a
 * cookie - and a cookie the client controls is not an authorization decision.
 * Every protected page and route handler re-derives the session server-side
 * instead.
 */
export default createMiddleware(routing);

export const config = {
  matcher: [
    // Everything except API routes, Next internals, the service worker, and
    // anything that looks like a static file.
    '/((?!api|_next|_vercel|sw\\.js|manifest\\.webmanifest|icons|.*\\..*).*)',
  ],
};
