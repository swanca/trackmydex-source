import { betterAuth } from 'better-auth';
import { eq } from 'drizzle-orm';
import type { CardLanguage } from '@/db/schema/enums';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { env, hasGoogleAuth } from './env';
import { logger } from './logger';
import { renderActionEmail, sendMail } from './mail';
import { verificationMailCopy } from './verification-mail';

/**
 * Authentication.
 *
 * Better Auth keeps identity in our own Postgres, so a self-hoster's backup
 * contains their users and nothing depends on a third-party identity vendor.
 * Google is wired up but inert until GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are
 * set, which is what "support additional providers later" should cost.
 */
export const auth = betterAuth({
  appName: 'TrackMyDex',
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.APP_URL],

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),

  emailAndPassword: {
    enabled: true,
    disableSignUp: !env.AUTH_ALLOW_SIGNUP,
    minPasswordLength: 10,
    maxPasswordLength: 200,
    requireEmailVerification: env.AUTH_REQUIRE_EMAIL_VERIFICATION,
    // Better Auth hashes with scrypt by default; both are memory-hard and
    // acceptable. Left explicit so the choice is visible in review.
    async sendResetPassword({ user, url }) {
      await sendMail({
        to: user.email,
        subject: 'Reset your TrackMyDex password',
        text: `Reset your password: ${url}\n\nIf you did not request this, ignore this message.`,
        html: renderActionEmail({
          heading: 'Reset your password',
          body: 'Use the button below to choose a new password. The link expires in one hour.',
          actionLabel: 'Choose a new password',
          actionUrl: url,
          footer: 'If you did not request a reset you can safely ignore this e-mail.',
        }),
      });
    },
  },

  emailVerification: {
    sendOnSignUp: env.AUTH_REQUIRE_EMAIL_VERIFICATION,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      const [preferences] = await db
        .select({ uiLocale: schema.user.uiLocale })
        .from(schema.user)
        .where(eq(schema.user.id, user.id))
        .limit(1);
      const copy = verificationMailCopy(preferences?.uiLocale);
      await sendMail({
        to: user.email,
        subject: copy.subject,
        text: `${copy.heading}\n\n${copy.body}\n\n${url}\n\n${copy.footer}`,
        html: renderActionEmail({
          heading: copy.heading,
          body: copy.body,
          actionLabel: copy.action,
          actionUrl: url,
          footer: copy.footer,
          icon: '✉',
        }),
      });
    },
  },

  socialProviders: hasGoogleAuth
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {},

  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'user', input: false },
      uiLocale: { type: 'string', defaultValue: 'en', input: true },
      defaultCardLanguage: { type: 'string', defaultValue: 'en', input: true },
      displayCurrency: { type: 'string', defaultValue: env.DEFAULT_CURRENCY, input: true },
      weeklyDigest: { type: 'boolean', defaultValue: false, input: true },
    },
    changeEmail: { enabled: true },
    deleteUser: { enabled: true },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },

  advanced: {
    useSecureCookies: env.APP_URL.startsWith('https://'),
    defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
  },

  databaseHooks: {
    user: {
      create: {
        /**
         * Stamp the role on accounts listed in ADMIN_EMAILS.
         *
         * This runs *after* creation, and writes the column directly, because
         * `role` is declared `input: false` above - which is exactly what stops
         * a signup request from POSTing `{"role":"admin"}` and promoting
         * itself. Better Auth enforces that by stripping non-input fields from
         * anything a hook hands back, so setting the role in a `before` hook is
         * silently discarded and every account lands on the 'user' default.
         *
         * Writing it here keeps the escalation shut and still records the role.
         * Authorisation does not hinge on this succeeding: `isAdmin()` also
         * consults ADMIN_EMAILS on every request, so the column is the durable
         * record rather than the only source of truth.
         */
        after: async (user) => {
          const patch: Partial<typeof schema.user.$inferInsert> = {};

          if (env.ADMIN_EMAILS.includes(user.email.toLowerCase())) {
            patch.role = 'admin';
          }

          /**
           * Adopt the locale the account was created in.
           *
           * The email form sends it explicitly, but a Google sign-up cannot -
           * social providers carry no custom fields - so every Google account
           * would otherwise be stamped English. The referer during the signup
           * request is the localised page the visitor came from
           * (`/fr/auth/sign-in`), which is the one signal available to both
           * routes.
           *
           * Only applied when the stored values are still the untouched
           * English defaults, so an explicit choice from the form is never
           * overwritten.
           */
          const fromReferer = await localeFromReferer();
          if (fromReferer && user.uiLocale === 'en' && user.defaultCardLanguage === 'en') {
            patch.uiLocale = fromReferer.uiLocale;
            patch.defaultCardLanguage = fromReferer.cardLanguage;
          }

          if (Object.keys(patch).length === 0) return;
          await db.update(schema.user).set(patch).where(eq(schema.user.id, user.id));
          if (patch.role) logger.info('auth.admin_granted', { email: user.email });
        },
      },
    },
  },

  plugins: [nextCookies()],
});

export type Auth = typeof auth;
export type AuthSession = typeof auth.$Infer.Session;
export type AuthUser = AuthSession['user'];

/**
 * The locale of the page a signup came from, read off the Referer header.
 *
 * Returns null when there is no usable referer, in which case the English
 * defaults stand - a wrong guess here is worse than no guess.
 */
async function localeFromReferer(): Promise<{
  uiLocale: string;
  cardLanguage: CardLanguage;
} | null> {
  try {
    const { headers } = await import('next/headers');
    const referer = (await headers()).get('referer');
    if (!referer) return null;
    const segment = new URL(referer).pathname.split('/').filter(Boolean)[0];
    if (!segment) return null;
    const { LOCALE_DEFAULT_CARD_LANGUAGE, UI_LOCALES, toUiLocale } = await import(
      './catalog/languages'
    );
    if (!(UI_LOCALES as readonly string[]).includes(segment)) return null;
    const uiLocale = toUiLocale(segment);
    return { uiLocale, cardLanguage: LOCALE_DEFAULT_CARD_LANGUAGE[uiLocale] };
  } catch {
    // Outside a request scope (a CLI seeding a user, say) there is no referer.
    return null;
  }
}
