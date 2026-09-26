import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { getPublicCollection } from '@/server/services/collection-share';
import { formatMoney } from '@/lib/pricing/money';

export const alt = 'TrackMyDex collection';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  const [collection, t] = await Promise.all([
    getPublicCollection(token, locale),
    getTranslations({ locale, namespace: 'share' }),
  ]);

  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, color: '#f8fafc', background: 'linear-gradient(135deg,#070a16,#15102b 58%,#09233a)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ display: 'flex', width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#8b5cf6,#38bdf8)', fontSize: 34, fontWeight: 800 }}>T</div>
        <div style={{ display: 'flex', fontSize: 34, fontWeight: 800 }}>TrackMyDex</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', fontSize: 64, fontWeight: 800 }}>{t('publicTitle')}</div>
        {collection ? (
          <div style={{ display: 'flex', gap: 44, fontSize: 28, color: '#cbd5e1' }}>
            <span>{t('ogCards', { count: collection.summary.totalCards })}</span>
            <span>{t('ogSets', { count: collection.summary.setCount })}</span>
            {collection.summary.totalValue ? <span>{formatMoney(collection.summary.totalValue, locale)}</span> : null}
          </div>
        ) : (
          <div style={{ display: 'flex', fontSize: 28, color: '#cbd5e1' }}>{t('ogGeneric')}</div>
        )}
      </div>
      <div style={{ display: 'flex', fontSize: 22, color: '#94a3b8' }}>trackmydex.com</div>
    </div>,
    size,
  );
}
