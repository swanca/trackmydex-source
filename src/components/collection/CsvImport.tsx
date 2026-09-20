'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { cn } from '@/lib/cn';

interface PreviewRow {
  line: number;
  status: 'ready' | 'duplicate' | 'error';
  message?: string;
  cardName?: string;
  setName?: string;
  quantity?: number;
  language?: string;
  condition?: string;
  existingQuantity?: number;
}

interface Preview {
  rows: PreviewRow[];
  counts: { ready: number; duplicate: number; error: number };
  truncated: boolean;
}

/**
 * CSV import.
 *
 * Nothing is written until the user has seen what will happen. The file is
 * parsed and every row resolved to a real printing server-side, the result is
 * shown as a preview, and only then does the user choose how duplicates are
 * handled and confirm.
 *
 * The file content is re-sent on commit rather than parked in a server-side
 * session. That keeps the flow stateless - no orphaned uploads to expire, no
 * cross-request store to secure - at the cost of one more upload of a file
 * that is measured in kilobytes.
 */
export function CsvImport() {
  // Translations are read here rather than passed in. A server component
  // cannot hand a client component a function, and pluralised labels like
  // "3 rows ready" need the count at render time - which only exists on the
  // client. next-intl's client hook gives full ICU plurals without the
  // prop-drilling that broke this page.
  const t = useTranslations();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [strategy, setStrategy] = useState<'skip' | 'add' | 'replace'>('skip');
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onFile(file: File) {
    setError(null);
    setResult(null);
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);

    start(async () => {
      try {
        const response = await fetch('/api/collection/import/preview', {
          method: 'POST',
          headers: { 'content-type': 'text/csv' },
          body: text,
        });
        if (!response.ok) throw new Error((await response.json()).error ?? t('app.error'));
        setPreview((await response.json()) as Preview);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t('app.error'));
      }
    });
  }

  function commit() {
    if (!csv) return;
    setError(null);
    start(async () => {
      try {
        const response = await fetch('/api/collection/import/commit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ csv, strategy }),
        });
        if (!response.ok) throw new Error((await response.json()).error ?? t('app.error'));
        const body = (await response.json()) as { imported: number; skipped: number };
        setResult(body);
        setPreview(null);
        setCsv(null);
        setFileName(null);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t('app.error'));
      }
    });
  }

  const importable = preview
    ? preview.counts.ready + (strategy === 'skip' ? 0 : preview.counts.duplicate)
    : 0;

  return (
    <div className="space-y-4">
      <div>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
        <Button variant="secondary" onClick={() => fileInput.current?.click()} loading={pending}>
          {t('csv.chooseFile')}
        </Button>
        {fileName ? <span className="ml-3 text-[0.8125rem] text-muted">{fileName}</span> : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[rgb(240_87_111/0.3)] bg-[rgb(240_87_111/0.08)] px-3.5 py-2.5 text-[0.8125rem] text-rose"
        >
          {error}
        </p>
      ) : null}

      {result ? (
        <p className="rounded-xl border border-[rgb(52_211_153/0.3)] bg-[rgb(52_211_153/0.08)] px-3.5 py-2.5 text-[0.8125rem] text-mint">
          {t('csv.importDone', { imported: result.imported, skipped: result.skipped })}
        </p>
      ) : null}

      {preview ? (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Tally tone="positive" text={t('csv.rowsValid', { count: preview.counts.ready })} />
            {preview.counts.duplicate > 0 ? (
              <Tally tone="warning" text={t('csv.rowsDuplicate', { count: preview.counts.duplicate })} />
            ) : null}
            {preview.counts.error > 0 ? (
              <Tally tone="danger" text={t('csv.rowsInvalid', { count: preview.counts.error })} />
            ) : null}
          </div>

          {preview.counts.duplicate > 0 ? (
            <Select
              label={t('csv.duplicateStrategy')}
              value={strategy}
              onChange={(event) => setStrategy(event.target.value as typeof strategy)}
            >
              <option value="skip">{t('csv.duplicateSkip')}</option>
              <option value="add">{t('csv.duplicateAdd')}</option>
              <option value="replace">{t('csv.duplicateReplace')}</option>
            </Select>
          ) : null}

          <div className="surface-flat max-h-[320px] overflow-y-auto rounded-[var(--radius-tile)]">
            <table className="w-full text-left text-[0.8125rem]">
              <tbody>
                {preview.rows.slice(0, 200).map((row) => (
                  <tr key={row.line} className="border-b border-hairline last:border-0">
                    <td className="w-14 px-3 py-2 font-mono text-[0.6875rem] text-faint">
                      {row.line}
                    </td>
                    <td className="px-1 py-2">
                      {row.status === 'error' ? (
                        <span className="text-rose">{row.message}</span>
                      ) : (
                        <>
                          <span className="font-medium text-paper">{row.cardName}</span>
                          <span className="ml-2 text-[0.6875rem] text-faint">{row.setName}</span>
                        </>
                      )}
                    </td>
                    <td className="w-20 px-3 py-2 text-right">
                      {row.status === 'duplicate' ? (
                        <span className="tnum text-amber">
                          {row.existingQuantity} → {row.quantity}
                        </span>
                      ) : row.status === 'ready' ? (
                        <span className="tnum text-muted">×{row.quantity}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setPreview(null);
                setCsv(null);
                setFileName(null);
              }}
            >
              {t('app.cancel')}
            </Button>
            <Button onClick={commit} loading={pending} disabled={importable === 0} fullWidth>
              {pending ? t('csv.importing') : t('csv.confirmImport', { count: importable })}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Tally({ tone, text }: { tone: 'positive' | 'warning' | 'danger'; text: string }) {
  return (
    <span
      className={cn(
        'rounded-[var(--radius-pill)] border px-2.5 py-1 text-[0.75rem] font-medium',
        tone === 'positive' && 'border-[rgb(52_211_153/0.3)] bg-[rgb(52_211_153/0.1)] text-mint',
        tone === 'warning' && 'border-[rgb(245_181_68/0.3)] bg-[rgb(245_181_68/0.1)] text-amber',
        tone === 'danger' && 'border-[rgb(240_87_111/0.3)] bg-[rgb(240_87_111/0.1)] text-rose',
      )}
    >
      {text}
    </span>
  );
}
