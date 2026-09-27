import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { getCurrentUser } from '@/lib/session';
import { resolvePreferences } from '@/lib/user-prefs';
import { convert, formatMoney, money } from '@/lib/pricing/money';
import { tcgplayerProductUrl } from '@/lib/pricing/links';
import { getFxRates } from '@/server/services/fx';
import { getSealedProduct } from '@/server/services/sealed';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SealedQuantityStepper } from '@/components/sealed/SealedQuantityStepper';
import { localizedAlternates } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string; productId: string }> }): Promise<Metadata> {
  const { locale, productId } = await params;
  const product = await getSealedProduct(null, decodeURIComponent(productId), locale);
  const t = await getTranslations({ locale, namespace: 'sealed' });
  return product
    ? { title: product.name, description: t('detailsDescription', { name: product.name }), alternates: localizedAlternates(locale, `/sealed/${product.id}`) }
    : { title: t('title'), alternates: localizedAlternates(locale, '/sealed') };
}

export default async function SealedDetailPage({ params }: { params: Promise<{ locale: string; productId: string }> }) {
  const { locale, productId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const user = await getCurrentUser();
  const prefs = resolvePreferences(user, locale);
  const product = await getSealedProduct(user?.id ?? null, decodeURIComponent(productId), prefs.displayLanguage);
  if (!product) notFound();
  const rates = await getFxRates();
  const listed = product.marketPrice && product.marketCurrency
    ? money(Number(product.marketPrice), product.marketCurrency as 'EUR' | 'USD')
    : null;
  const shown = listed ? convert(listed, prefs.displayCurrency, rates) : null;

  return (
    <>
      <PageHeader title={product.name} eyebrow={t('sealed.detailsTitle')} backHref="/sealed" backLabel={t('sealed.backToSealed')} />
      <PageSection className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-[minmax(180px,280px)_1fr]">
          <div className="overflow-hidden rounded-[var(--radius-card)] bg-slate p-3">
            {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="mx-auto max-h-[420px] w-full object-contain" /> : <div className="grid aspect-square place-items-center text-faint">{t('sealed.noImage')}</div>}
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">{t(`sealed.kind.${product.kind}`)}</Badge>
              {product.language !== 'en' ? <Badge tone="neutral">{product.language.toUpperCase()}</Badge> : null}
            </div>
            <p className="type-meta">{product.setLabel ?? product.groupName}</p>
            {product.releasedOn ? <p className="type-meta">{t('sealed.released', { date: product.releasedOn })}</p> : null}
            {shown ? <div><p className="type-eyebrow">{t('sealed.marketPrice')}</p><p className="tnum font-display text-2xl font-bold">{formatMoney(shown, locale)}</p></div> : <p className="type-meta">{t('sealed.noPrice')}</p>}
            {user ? <SealedQuantityStepper sealedProductId={product.id} quantity={product.ownedQuantity} size="md" /> : <Link href="/auth/sign-in"><Button>{t('nav.signIn')}</Button></Link>}
            <div className="flex flex-wrap gap-2">
              <a href={product.productUrl ?? tcgplayerProductUrl(product.sourceProductId)} target="_blank" rel="noopener noreferrer"><Button variant="secondary" size="sm">{t('sealed.viewProduct')}</Button></a>
            </div>
          </div>
        </div>
      </PageSection>
    </>
  );
}
