import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireUser } from '@/lib/session';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { Surface } from '@/components/ui/Surface';
import { CsvImport } from '@/components/collection/CsvImport';
import { CSV_COLUMNS } from '@/server/services/csv';

export default async function ImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();
  await requireUser(locale, '/collection/import');

  return (
    <>
      <PageHeader
        backHref="/collection"
        backLabel={t('collection.title')}
        title={t('csv.importTitle')}
      />

      <PageSection className="space-y-5">
        <p className="type-meta max-w-[60ch] text-[0.9375rem]">{t('csv.importBody')}</p>

        <CsvImport />

        <Surface className="p-4">
          <p className="type-eyebrow mb-2">{t('csv.columnMapping')}</p>
          <p className="type-meta mb-3 text-[0.8125rem]">
            A row is matched on <code className="type-code text-paper">card_variant_id</code>, or{' '}
            <code className="type-code text-paper">card_id</code> plus{' '}
            <code className="type-code text-paper">variant</code>, or{' '}
            <code className="type-code text-paper">set_id</code> plus{' '}
            <code className="type-code text-paper">card_number</code>. Card names are never matched
            on their own, because two sets can share a name and a wrong match is worse than a
            skipped row.
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {CSV_COLUMNS.map((column) => (
              <li
                key={column}
                className="type-code rounded-md border border-hairline bg-[rgb(148_163_208/0.06)] px-1.5 py-0.5 text-faint"
              >
                {column}
              </li>
            ))}
          </ul>
          <a
            href="/api/collection/template"
            download="trackmydex-template.csv"
            className="mt-3 inline-block text-[0.8125rem] text-muted underline decoration-hairline-strong underline-offset-2 hover:text-paper"
          >
            {t('csv.downloadTemplate')}
          </a>
        </Surface>
      </PageSection>
    </>
  );
}
