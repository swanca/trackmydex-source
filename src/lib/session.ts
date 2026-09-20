import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth, type AuthUser } from './auth';
import { env } from './env';

/**
 * Server-side session helpers.
 *
 * Every mutation derives the acting user from here. The client never supplies a
 * user id, so a crafted request cannot touch somebody else's collection.
 *
 * `cache()` de-duplicates the lookup within a single render pass: a page with a
 * header, a dashboard and three server components resolves the session once.
 */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await getSession();
  return session?.user ?? null;
}

/** Redirects to sign-in, preserving the intended destination. */
export async function requireUser(locale: string, returnTo?: string): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    const target = returnTo ? `?next=${encodeURIComponent(returnTo)}` : '';
    redirect(`/${locale}/auth/sign-in${target}`);
  }
  return user;
}

/**
 * Is this user an administrator?
 *
 * Two sources, deliberately:
 *
 *  - the `role` column, which is the durable record;
 *  - ADMIN_EMAILS, checked live on every request.
 *
 * The env list is not just a bootstrap. Without it, adding yourself to
 * ADMIN_EMAILS *after* signing up does nothing, because the role is only
 * written at account creation - so an operator who forgets to set it before
 * their first signup is locked out of their own admin area with no way back
 * except hand-editing the database. Checking it live removes that trap, and
 * makes revoking access a config change rather than a migration.
 */
export function isAdmin(user: Pick<AuthUser, 'role' | 'email'> | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return env.ADMIN_EMAILS.includes(user.email.toLowerCase());
}

export async function requireAdmin(locale: string): Promise<AuthUser> {
  const user = await requireUser(locale);
  if (!isAdmin(user)) redirect(`/${locale}`);
  return user;
}

/** For route handlers: returns null instead of redirecting. */
export async function getApiUser(): Promise<AuthUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}
