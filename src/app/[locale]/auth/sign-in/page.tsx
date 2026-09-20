import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { hasGoogleAuth } from '@/lib/env';
import { getCurrentUser } from '@/lib/session';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthForm } from '@/components/auth/AuthForm';
import { authLabels } from '../labels';

export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  if (await getCurrentUser()) redirect(`/${locale}`);
  const t = await getTranslations();

  return (
    <AuthShell title={t('auth.signIn')} subtitle={t('auth.signInSubtitle')}>
      <AuthForm
        mode="sign-in"
        locale={locale}
        googleEnabled={hasGoogleAuth}
        labels={await authLabels(t)}
      />
      <div className="mt-6 flex flex-col gap-2 text-[0.8125rem] text-muted">
        <Link href="/auth/forgot-password" className="hover:text-paper">
          {t('auth.forgotPassword')}
        </Link>
        <p>
          {t('auth.noAccount')}{' '}
          <Link href="/auth/sign-up" className="font-semibold text-paper hover:underline">
            {t('auth.signUp')}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
