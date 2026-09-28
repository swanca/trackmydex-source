import { setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/session';
import { resolvePreferences } from '@/lib/user-prefs';
import { listCalibrationCampaigns } from '@/server/services/calibration';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { CalibrationPanel } from '@/components/admin/CalibrationPanel';

export const dynamic = 'force-dynamic';

export default async function CalibrationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireAdmin(locale);
  const preferences = resolvePreferences(user, locale);
  const campaigns = await listCalibrationCampaigns(user.id);

  return (
    <>
      <PageHeader
        title="Calibration du scanner"
        eyebrow="Réservé à l’administrateur"
        backHref="/admin"
        backLabel="Administration"
      />
      <PageSection className="mx-auto max-w-xl pb-12">
        <p className="type-meta mb-4 text-sm">
          Prends simplement les photos. Les recadrages, mesures et résultats sont enregistrés pour que je calibre ensuite le scanner.
        </p>
        <CalibrationPanel
          initialCampaigns={campaigns}
          cardLanguage={preferences.cardLanguage}
          displayCurrency={preferences.displayCurrency}
        />
      </PageSection>
    </>
  );
}
