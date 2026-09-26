import type { getTranslations } from 'next-intl/server';
import type { AuthFormLabels } from '@/components/auth/AuthForm';

type Translator = Awaited<ReturnType<typeof getTranslations>>;

/** Shared so the four auth pages stay worded identically. */
export async function authLabels(t: Translator): Promise<AuthFormLabels> {
  return {
    name: t('auth.name'),
    email: t('auth.email'),
    password: t('auth.password'),
    passwordHint: t('auth.passwordHint'),
    confirmPassword: t('auth.confirmPassword'),
    newPassword: t('auth.newPassword'),
    submitSignIn: t('auth.signIn'),
    submitSignUp: t('auth.signUp'),
    submitForgot: t('auth.sendResetLink'),
    submitReset: t('app.save'),
    resetSent: t('auth.resetSent'),
    resetDone: t('auth.resetDone'),
    verifyTitle: t('auth.verifyTitle'),
    verifyBody: t('auth.verifyBody', { email: '{email}' }),
    verifyCheckSpam: t('auth.verifyCheckSpam'),
    resendVerification: t('auth.resendVerification'),
    verificationResent: t('auth.verificationResent'),
    backToSignIn: t('auth.backToSignIn'),
    continueWithGoogle: t('auth.continueWithGoogle'),
    or: t('auth.or'),
    errors: {
      invalidCredentials: t('auth.errors.invalidCredentials'),
      emailTaken: t('auth.errors.emailTaken'),
      weakPassword: t('auth.errors.weakPassword'),
      passwordMismatch: t('auth.errors.passwordMismatch'),
      generic: t('auth.errors.generic'),
      rateLimited: t('auth.errors.rateLimited'),
      emailNotVerified: t('auth.errors.emailNotVerified'),
    },
  };
}
