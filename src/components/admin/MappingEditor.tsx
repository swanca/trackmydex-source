'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveMapping } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import type { UnmappedPrinting } from '@/server/services/admin';

/**
 * Manual marketplace mapping.
 *
 * The fallback for printings the catalog provider could not match to a
 * Cardmarket or TCGplayer product. Saving locks the row so the nightly sync
 * will not overwrite hand-checked work.
 */
export function MappingEditor({
  rows,
  labels,
}: {
  rows: UnmappedPrinting[];
  labels: {
    fix: string;
    cardmarket: string;
    tcgplayer: string;
    save: string;
    saved: string;
    cancel: string;
    locked: string;
  };
}) {
  const router = useRouter();
  const [active, setActive] = useState<UnmappedPrinting | null>(null);
  const [cardmarket, setCardmarket] = useState('');
  const [tcgplayer, setTcgplayer] = useState('');
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  if (rows.length === 0) {
    return <p className="type-meta text-sm">—</p>;
  }

  return (
    <>
      <ul className="surface-flat divide-y divide-[color:var(--color-hairline)] rounded-[var(--radius-tile)]">
        {rows.map((row) => (
          <li key={row.variantId} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[0.8125rem] font-medium">{row.cardName}</p>
              <p className="type-meta truncate text-[0.6875rem]">
                <span className="font-mono">{row.localId}</span> · {row.setName} ·{' '}
                {row.variantType}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setActive(row);
                setCardmarket('');
                setTcgplayer('');
                setSaved(false);
              }}
            >
              {labels.fix}
            </Button>
          </li>
        ))}
      </ul>

      <Sheet
        open={active !== null}
        onClose={() => setActive(null)}
        title={active?.cardName ?? ''}
        description={active ? `${active.setName} · ${active.localId}` : undefined}
        footer={
          <Button
            fullWidth
            loading={pending}
            disabled={!cardmarket && !tcgplayer}
            onClick={() =>
              start(async () => {
                if (!active) return;
                await saveMapping({
                  cardVariantId: active.variantId,
                  cardmarketProductId: cardmarket ? Number(cardmarket) : null,
                  tcgplayerProductId: tcgplayer ? Number(tcgplayer) : null,
                });
                setSaved(true);
                setActive(null);
                router.refresh();
              })
            }
          >
            {labels.save}
          </Button>
        }
      >
        <div className="space-y-4">
          <Input
            label={labels.cardmarket}
            type="number"
            inputMode="numeric"
            value={cardmarket}
            onChange={(event) => setCardmarket(event.target.value)}
          />
          <Input
            label={labels.tcgplayer}
            type="number"
            inputMode="numeric"
            value={tcgplayer}
            onChange={(event) => setTcgplayer(event.target.value)}
          />
          <p className="type-meta text-[0.75rem]">{labels.locked}</p>
        </div>
      </Sheet>

      {saved ? (
        <p role="status" className="mt-2 text-[0.8125rem] text-mint">
          {labels.saved}
        </p>
      ) : null}
    </>
  );
}
