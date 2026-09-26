import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireUser, isAdmin } from '@/lib/session';
import { env } from '@/lib/env';
import { CARD_LANGUAGES } from '@/db/schema/enums';
import { LANGUAGE_LABELS, UI_LOCALES, UI_LOCALE_NAMES, toUiLocale } from '@/lib/catalog/languages';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { SectionHeader, Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { PreferencesForm } from '@/components/profile/PreferencesForm';
import { ThemeSwitcher } from '@/components/layout/ThemeSwitcher';
import { DeleteAccount } from '@/components/profile/DeleteAccount';
import { DeleteCollection } from '@/components/profile/DeleteCollection';

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();
  const user = await requireUser(locale, '/profile');
  const uiLocale = toUiLocale(locale);
  const languageLabels = LANGUAGE_LABELS[uiLocale];

  // Only offer printed languages this instance actually ingested.
  const ingested = env.CATALOG_LANGUAGES;
  const cardLanguageOptions = CARD_LANGUAGES.filter((language) =>
    ingested.includes(language),
  ).map((language) => ({ value: language, label: languageLabels[language] }));

  return (
    <>
      <PageHeader
        title={t('profile.title')}
        eyebrow={user.email}
        actions={
          isAdmin(user) ? (
            <Link href="/admin">
              <Button variant="secondary" size="sm">
                {t('nav.admin')}
              </Button>
            </Link>
          ) : null
        }
      />

      <PageSection className="space-y-8">
        {/* The theme is per-device rather than per-account - the same person
            wants black on a phone at night and light on a laptop by a window -
            so it sits above the saved preferences and applies immediately
            rather than on submit. */}
        <section>
          <SectionHeader title={t('theme.label')} />
          <Surface className="p-4">
            <ThemeSwitcher
              labels={{
                label: t('theme.label'),
                midnight: t('theme.vault'),
                black: t('theme.black'),
                light: t('theme.light'),
              }}
            />
          </Surface>
        </section>

        <section>
          <SectionHeader title={t('profile.preferences')} />
          <Surface className="p-4">
            <PreferencesForm
              initial={{
                uiLocale: locale,
                defaultCardLanguage: String(user.defaultCardLanguage ?? 'en'),
                displayCurrency: String(user.displayCurrency ?? env.DEFAULT_CURRENCY),
                weeklyDigest: Boolean(user.weeklyDigest),
              }}
              uiLocales={UI_LOCALES.map((value) => ({
                value,
                label: UI_LOCALE_NAMES[value],
              }))}
              cardLanguages={
                cardLanguageOptions.length > 0
                  ? cardLanguageOptions
                  : [{ value: 'en', label: languageLabels.en }]
              }
              labels={{
                uiLanguage: t('profile.uiLanguage'),
                uiLanguageHelp: t('profile.uiLanguageHelp'),
                defaultCardLanguage: t('profile.defaultCardLanguage'),
                defaultCardLanguageHelp: t('profile.defaultCardLanguageHelp'),
                displayCurrency: t('profile.displayCurrency'),
                displayCurrencyHelp: t('profile.displayCurrencyHelp'),
                save: t('app.save'),
                saving: t('app.saving'),
                saved: t('app.saved'),
                signOut: t('nav.signOut'),
                weeklyDigest: t('profile.weeklyDigest'),
                weeklyDigestHelp: t('profile.weeklyDigestHelp'),
              }}
            />
          </Surface>
        </section>

        <section>
          <SectionHeader title={t('profile.data')} />
          <Surface className="space-y-3 p-4">
            <p className="type-meta text-[0.875rem]">{t('csv.exportBody')}</p>
            <div className="flex flex-wrap gap-2">
              <a href="/api/collection/export" download>
                <Button variant="secondary">{t('csv.export')}</Button>
              </a>
              <Link href="/collection/import">
                <Button variant="ghost">{t('csv.import')}</Button>
              </Link>
            </div>
            <div className="border-t border-hairline pt-3">
              <p className="type-meta mb-3 text-[0.875rem]">{t('profile.deleteCollectionBody')}</p>
              <DeleteCollection labels={{
                action: t('profile.deleteCollection'),
                confirm: t('profile.deleteCollectionConfirm'),
                cancel: t('app.cancel'),
                body: t('profile.deleteCollectionBody'),
                done: t('profile.deleteCollectionDone'),
              }} />
            </div>
          </Surface>
        </section>

        <section>
          <SectionHeader title={t('profile.dangerZone')} />
          <Surface className="space-y-3 border-[rgb(240_87_111/0.22)] p-4">
            <p className="type-meta text-[0.875rem]">{t('profile.deleteAccountBody')}</p>
            <DeleteAccount
              labels={{
                action: t('profile.deleteAccount'),
                confirm: t('profile.deleteConfirm'),
                cancel: t('app.cancel'),
                body: t('profile.deleteAccountBody'),
              }}
            />
          </Surface>
        </section>
      </PageSection>
    </>
  );
}
