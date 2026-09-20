import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { env, hasGoogleAuth } from '@/lib/env';
import { getCurrentUser } from '@/lib/session';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthForm } from '@/components/auth/AuthForm';
import { authLabels } from '../labels';

export default async function SignUpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  if (await getCurrentUser()) redirect(`/${locale}`);
  const t = await getTranslations();

  // A private instance turns signups off with one env var; the page says so
  // rather than failing at submit time.
  if (!env.AUTH_ALLOW_SIGNUP) {
    return (
      <AuthShell title={t('auth.signUp')} subtitle={t('auth.signupDisabled')}>
        <Link href="/auth/sign-in" className="font-semibold text-paper hover:underline">
          {t('auth.signIn')}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('auth.signUp')} subtitle={t('auth.signUpSubtitle')}>
      <AuthForm
        mode="sign-up"
        locale={locale}
        googleEnabled={hasGoogleAuth}
        labels={await authLabels(t)}
      />
      <p className="mt-6 text-[0.8125rem] text-muted">
        {t('auth.haveAccount')}{' '}
        <Link href="/auth/sign-in" className="font-semibold text-paper hover:underline">
          {t('auth.signIn')}
        </Link>
      </p>
    </AuthShell>
  );
}
