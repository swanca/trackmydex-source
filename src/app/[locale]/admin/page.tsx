import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/session';
import { formatNumber } from '@/lib/pricing/money';
import {
  getCatalogStats,
  getProviderStatuses,
  getRecentErrors,
  getRecentRuns,
  getUnmappedPrintings,
  listUsers,
} from '@/server/services/admin';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { SectionHeader, Stat, Surface } from '@/components/ui/Surface';
import { Badge } from '@/components/ui/Badge';
import { SyncControls } from '@/components/admin/SyncControls';
import { MappingEditor } from '@/components/admin/MappingEditor';
import { formatDateTime } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();
  await requireAdmin(locale);

  const [stats, providers, runs, errors, unmapped, users] = await Promise.all([
    getCatalogStats(),
    getProviderStatuses(),
    getRecentRuns(8),
    getRecentErrors(20),
    getUnmappedPrintings(30),
    listUsers(100),
  ]);

  return (
    <>
      <PageHeader title={t('admin.title')} eyebrow={t('admin.subtitle')} />

      <PageSection className="space-y-8">
        {/* There is no analytics in this product and the privacy policy says
            so, so the accounts themselves are the only honest answer to
            "who is using this". */}
        <section>
          <SectionHeader
            title={t('admin.users')}
            eyebrow={t('admin.userCount', { count: users.length })}
          />
          <Surface className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-left text-[0.8125rem]">
              <thead className="type-eyebrow border-b border-hairline">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t('admin.userEmail')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('admin.userJoined')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('admin.userLastSeen')}</th>
                  <th className="tnum px-4 py-2.5 text-right font-medium">
                    {t('admin.userCards')}
                  </th>
                  <th className="tnum px-4 py-2.5 text-right font-medium">
                    {t('nav.wishlist')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((person) => (
                  <tr key={person.email} className="border-b border-hairline last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="block truncate text-paper">{person.email}</span>
                      {person.role === 'admin' ? (
                        <Badge tone="accent">{t('nav.admin')}</Badge>
                      ) : null}
                    </td>
                    <td className="type-meta px-4 py-2.5">{person.createdAt}</td>
                    <td className="type-meta px-4 py-2.5">
                      {person.lastSeen
                        ? formatDateTime(person.lastSeen, locale)
                        : t('admin.userNeverSeen')}
                    </td>
                    <td className="tnum px-4 py-2.5 text-right text-paper">{person.cards}</td>
                    <td className="tnum px-4 py-2.5 text-right text-muted">{person.wishlist}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        </section>

        <section>
          <SectionHeader title={t('admin.catalogSize')} />
          <Surface className="p-4">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label={t('admin.catalog')} value={formatNumber(stats.sets, locale)} hint={t('admin.setCount', { count: stats.sets })} />
              <Stat label="Cards" value={formatNumber(stats.cards, locale)} />
              <Stat label="Printings" value={formatNumber(stats.variants, locale)} />
              <Stat label={t('admin.pricing')} value={formatNumber(stats.priced, locale)} tone="accent" />
              <Stat label={t('admin.unmatched')} value={formatNumber(stats.unmapped, locale)} />
              <Stat label="Series" value={formatNumber(stats.series, locale)} />
            </dl>

            {stats.languages.length > 0 ? (
              <div className="mt-5 border-t border-hairline pt-4">
                <p className="type-eyebrow mb-2">{t('admin.languageCoverage')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {stats.languages.map((entry) => (
                    <Badge key={entry.language} mono>
                      {entry.language.toUpperCase()} {formatNumber(entry.cards, locale)}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </Surface>
        </section>

        <section>
          <SectionHeader title={t('admin.dataSources')} />
          <ul className="space-y-2">
            {providers.map((provider) => (
              <li
                key={provider.key}
                className="surface-flat flex items-center justify-between gap-4 rounded-[var(--radius-tile)] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.875rem] font-semibold">{provider.displayName}</p>
                  <p className="type-meta truncate text-[0.6875rem]">
                    <span className="font-mono">{provider.key}</span> · {provider.detail}
                  </p>
                </div>
                <Badge tone={!provider.enabled ? 'neutral' : provider.ok ? 'positive' : 'warning'}>
                  {!provider.enabled
                    ? t('admin.providerDisabled')
                    : provider.ok
                      ? t('admin.providerOk')
                      : t('admin.providerDown')}
                </Badge>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionHeader title={t('admin.runs')} />
          <SyncControls
            labels={{
              catalog: t('admin.triggerCatalog'),
              translations: t('admin.triggerTranslations'),
              prices: t('admin.triggerPrices'),
              sealed: t('admin.sealed'),
              snapshot: t('admin.triggerSnapshot'),
              triggered: t('admin.triggered'),
              running: t('admin.running'),
              generic: t('app.error'),
            }}
          />

          <ul className="mt-4 space-y-2">
            {runs.map((run) => (
              <li
                key={run.id}
                className="surface-flat flex items-center justify-between gap-4 rounded-[var(--radius-tile)] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-[0.875rem] font-semibold capitalize">{run.kind}</p>
                  <p className="type-meta truncate text-[0.6875rem]">
                    {formatDateTime(run.startedAt, locale)} ·{' '}
                    {run.finishedAt
                      ? `${Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s`
                      : '…'}{' '}
                    · {formatStats(run.stats as Record<string, number>)}
                  </p>
                </div>
                <Badge
                  tone={
                    run.status === 'success'
                      ? 'positive'
                      : run.status === 'running'
                        ? 'accent'
                        : 'warning'
                  }
                >
                  {run.status}
                </Badge>
              </li>
            ))}
            {runs.length === 0 ? <li className="type-meta text-sm">{t('admin.noErrors')}</li> : null}
          </ul>
        </section>

        {errors.length > 0 ? (
          <section>
            <SectionHeader title={t('admin.errors')} />
            <ul className="surface-flat divide-y divide-[color:var(--color-hairline)] rounded-[var(--radius-tile)]">
              {errors.map((error) => (
                <li key={error.id} className="px-4 py-2.5">
                  <p className="text-[0.8125rem] text-rose">{error.message}</p>
                  <p className="type-meta text-[0.6875rem]">
                    <span className="font-mono">{error.scope}</span>
                    {error.ref ? <span className="font-mono"> · {error.ref}</span> : null} ·{' '}
                    {formatDateTime(error.createdAt, locale)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <SectionHeader title={t('admin.unmatched')} />
          <p className="type-meta mb-3 max-w-[68ch] text-[0.8125rem]">{t('admin.unmatchedBody')}</p>
          <MappingEditor
            rows={unmapped}
            labels={{
              fix: t('admin.fixMapping'),
              cardmarket: t('admin.cardmarketId'),
              tcgplayer: t('admin.tcgplayerId'),
              save: t('app.save'),
              saved: t('admin.mappingSaved'),
              cancel: t('app.cancel'),
              locked: t('admin.mappingLocked'),
            }}
          />
        </section>
      </PageSection>
    </>
  );
}

function formatStats(stats: Record<string, number> | null): string {
  if (!stats) return '';
  return Object.entries(stats)
    .slice(0, 4)
    .map(([key, value]) => `${key} ${value}`)
    .join(', ');
}
