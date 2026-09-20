'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { LOCALE_DEFAULT_CARD_LANGUAGE, toUiLocale } from '@/lib/catalog/languages';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

export type AuthMode = 'sign-in' | 'sign-up' | 'forgot' | 'reset';

export interface AuthFormLabels {
  name: string;
  email: string;
  password: string;
  passwordHint: string;
  confirmPassword: string;
  newPassword: string;
  submitSignIn: string;
  submitSignUp: string;
  submitForgot: string;
  submitReset: string;
  resetSent: string;
  resetDone: string;
  continueWithGoogle: string;
  or: string;
  errors: {
    invalidCredentials: string;
    emailTaken: string;
    weakPassword: string;
    passwordMismatch: string;
    generic: string;
    rateLimited: string;
  };
}

/**
 * One form, four modes.
 *
 * Better Auth handles the protocol; this component handles the human side of
 * it. Two decisions worth naming:
 *
 *  - The password-reset request always reports success, whether or not the
 *    address exists. Telling an anonymous visitor which e-mails have accounts
 *    is an account-enumeration leak.
 *  - Errors are mapped to plain sentences about what to do next, not the
 *    provider's status codes.
 */
export function AuthForm({
  mode,
  locale,
  googleEnabled,
  labels,
}: {
  mode: AuthMode;
  locale: string;
  googleEnabled: boolean;
  labels: AuthFormLabels;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });

  const next = searchParams.get('next') ?? `/${locale}`;
  const token = searchParams.get('token') ?? '';

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    start(async () => {
      try {
        if (mode === 'sign-in') {
          const { error: authError } = await authClient.signIn.email({
            email: form.email,
            password: form.password,
            callbackURL: next,
          });
          if (authError) throw authError;
          router.push(next);
          router.refresh();
          return;
        }

        if (mode === 'sign-up') {
          if (form.password !== form.confirm) {
            setError(labels.errors.passwordMismatch);
            return;
          }
          if (form.password.length < 10) {
            setError(labels.errors.weakPassword);
            return;
          }
          const { error: authError } = await authClient.signUp.email({
            name: form.name.trim() || form.email.split('@')[0]!,
            email: form.email,
            password: form.password,
            callbackURL: next,
            // Carry the locale the account was created in. Without these the
            // stored defaults are English for everyone, so a French visitor
            // browsing French cards would see them flip to English the moment
            // they signed up - the one action that should change nothing.
            uiLocale: locale,
            defaultCardLanguage: localeCardLanguage(locale),
          });
          if (authError) throw authError;
          router.push(next);
          router.refresh();
          return;
        }

        if (mode === 'forgot') {
          await authClient.requestPasswordReset({
            email: form.email,
            redirectTo: `/${locale}/auth/reset-password`,
          });
          // Always the same message: see the note above about enumeration.
          setNotice(labels.resetSent);
          return;
        }

        if (form.password !== form.confirm) {
          setError(labels.errors.passwordMismatch);
          return;
        }
        const { error: authError } = await authClient.resetPassword({
          newPassword: form.password,
          token,
        });
        if (authError) throw authError;
        setNotice(labels.resetDone);
      } catch (cause) {
        setError(mapError(cause, labels));
      }
    });
  }

  return (
    <div className="space-y-5">
      {googleEnabled && (mode === 'sign-in' || mode === 'sign-up') ? (
        <>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            size="lg"
            icon={<GoogleMark />}
            onClick={() =>
              authClient.signIn.social({ provider: 'google', callbackURL: next })
            }
          >
            {labels.continueWithGoogle}
          </Button>
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-hairline" />
            <span className="text-[0.75rem] text-faint">{labels.or}</span>
            <span className="h-px flex-1 bg-hairline" />
          </div>
        </>
      ) : null}

      <form onSubmit={submit} className="space-y-4">
        {mode === 'sign-up' ? (
          <Input
            label={labels.name}
            name="name"
            autoComplete="name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        ) : null}

        {mode !== 'reset' ? (
          <Input
            label={labels.email}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        ) : null}

        {mode !== 'forgot' ? (
          <Input
            label={mode === 'reset' ? labels.newPassword : labels.password}
            name="password"
            type="password"
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'sign-in' ? undefined : 10}
            hint={mode === 'sign-in' ? undefined : labels.passwordHint}
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        ) : null}

        {mode === 'sign-up' || mode === 'reset' ? (
          <Input
            label={labels.confirmPassword}
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={form.confirm}
            onChange={(event) => setForm({ ...form, confirm: event.target.value })}
          />
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-[rgb(240_87_111/0.3)] bg-[rgb(240_87_111/0.08)] px-3.5 py-2.5 text-[0.8125rem] text-rose"
          >
            {error}
          </p>
        ) : null}

        {notice ? (
          <p className="rounded-xl border border-[rgb(52_211_153/0.3)] bg-[rgb(52_211_153/0.08)] px-3.5 py-2.5 text-[0.8125rem] text-mint">
            {notice}
          </p>
        ) : null}

        <Button type="submit" size="lg" fullWidth loading={pending}>
          {mode === 'sign-in'
            ? labels.submitSignIn
            : mode === 'sign-up'
              ? labels.submitSignUp
              : mode === 'forgot'
                ? labels.submitForgot
                : labels.submitReset}
        </Button>
      </form>
    </div>
  );
}

function mapError(cause: unknown, labels: AuthFormLabels): string {
  const code = (cause as { code?: string; status?: number })?.code ?? '';
  const status = (cause as { status?: number })?.status;

  if (status === 429) return labels.errors.rateLimited;
  if (code.includes('INVALID_EMAIL_OR_PASSWORD') || status === 401) {
    return labels.errors.invalidCredentials;
  }
  if (code.includes('USER_ALREADY_EXISTS')) return labels.errors.emailTaken;
  if (code.includes('PASSWORD_TOO_SHORT')) return labels.errors.weakPassword;
  return labels.errors.generic;
}

/**
 * Google's own mark, drawn rather than fetched.
 *
 * Google's branding rules require the four-colour G in its official colours,
 * unaltered - so these hex values are fixed and must not be themed. Inlining it
 * also means the sign-in button cannot render as a broken image on a slow or
 * blocked connection, which is exactly when a login screen needs to look
 * trustworthy.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

/** The printed-card language a visitor most likely wants, from their UI locale. */
function localeCardLanguage(locale: string): string {
  return LOCALE_DEFAULT_CARD_LANGUAGE[toUiLocale(locale)];
}
