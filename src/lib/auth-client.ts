'use client';

import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import type { Auth } from './auth';

/**
 * Browser-side auth client.
 *
 * `inferAdditionalFields` carries our custom user columns (role, locale,
 * currency) through to the client session type, so a component reading
 * `session.user.displayCurrency` is type-checked rather than casting.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? undefined,
  plugins: [inferAdditionalFields<Auth>()],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  requestPasswordReset,
  resetPassword,
} = authClient;
