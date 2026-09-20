import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthForm } from '@/components/auth/AuthForm';
import { authLabels } from '../labels';

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <AuthShell title={t('auth.resetTitle')} subtitle={t('auth.passwordHint')}>
      <AuthForm mode="reset" locale={locale} googleEnabled={false} labels={await authLabels(t)} />
      <p className="mt-6 text-[0.8125rem]">
        <Link href="/auth/sign-in" className="text-muted hover:text-paper">
          {t('auth.signIn')}
        </Link>
      </p>
    </AuthShell>
  );
}
