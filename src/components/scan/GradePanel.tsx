'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { GradePhoto } from './GradePhoto';
import type { CardInspection } from '@/lib/grade/card-inspection';
import type { EstimatedCardGrade } from '@/lib/grade/card-grade';

interface Report { front: CardInspection; back: CardInspection; grade: EstimatedCardGrade | null }

function InspectionPhoto({ file, inspection, label }: { file: File; inspection: CardInspection; label: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]);
  return url ? <div className="relative mx-auto max-w-[280px]">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={url} alt={label} className="w-full rounded-lg" />
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {inspection.anomalies.map((mark, index) => <rect key={index}
        x={Math.max(0, mark.x * 100 - .4)} y={Math.max(0, mark.y * 100 - .4)}
        width={mark.width * 100 + .8} height={mark.height * 100 + .8}
        fill="none" stroke="#fb7185" strokeWidth=".5" />)}
    </svg>
  </div> : null;
}

/** Public recto-verso inspection with a clearly limited photo-based estimate. */
export function GradePanel() {
  const t = useTranslations('scan');
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const labels = { choose: t('choosePhoto'), camera: t('inspection.camera'), gallery: t('inspection.gallery'), corners: t('inspection.cropHelp'), confirm: t('inspection.confirm'),
    ready: t('inspection.ready'), error: t('inspection.photoError'), corner: t('inspection.corner') };
  async function submit() {
    if (!front || !back || busy) return;
    setBusy(true); setError(false); setReport(null);
    try {
      const form = new FormData(); form.set('front', front); form.set('back', back);
      const response = await fetch('/api/scan/pregrade', { method: 'POST', body: form });
      if (!response.ok) throw new Error('inspection');
      setReport(await response.json() as Report);
    } catch { setError(true); }
    finally { setBusy(false); }
  }

  return <section id="grade" className="surface-flat scroll-mt-20 space-y-4 rounded-[var(--radius-card)] p-4 sm:p-5">
    <h2 className="text-lg font-semibold">{t('gradeTitle')}</h2>
    <div className="grid gap-6 sm:grid-cols-2">
      <GradePhoto label={t('inspection.front')} labels={labels} disabled={busy}
        onChange={file => { setFront(file); setReport(null); setError(false); }} />
      <GradePhoto label={t('inspection.back')} labels={labels} disabled={busy}
        onChange={file => { setBack(file); setReport(null); setError(false); }} />
    </div>
    <Button type="button" disabled={!front || !back} loading={busy} onClick={() => void submit()}>
      {busy ? t('analyzing') : t('analyze')}
    </Button>
    {error && <p role="alert" className="text-sm text-rose">{t('gradeError')}</p>}
    {report && front && back && <div className="space-y-4" aria-live="polite">
      {report.grade ? <GradeScore grade={report.grade} labels={{
        estimated: t('inspection.estimatedGrade'), limited: t('inspection.limitedConfidence'),
        centering: t('inspection.centering'), corners: t('inspection.corners'),
        edges: t('inspection.edges'), surface: t('inspection.surfaceProvisional'),
        disclaimer: t('gradeDisclaimer'),
      }} /> : null}
      <h3 className="font-semibold">{t('inspection.report')}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {(['front', 'back'] as const).map(side => {
          const inspection = report[side];
          const centering = inspection.centering;
          const ratio = (values?: [number, number]) => values?.map(value => value.toFixed(1)).join(' / ');
          return <div key={side} className="space-y-3 rounded-xl border border-line p-3">
            <h4 className="font-semibold">{t(`inspection.${side}`)}</h4>
            <InspectionPhoto file={side === 'front' ? front : back} inspection={inspection} label={t(`inspection.${side}`)} />
            {!inspection.quality.accepted && <p className="text-sm text-rose">{t('inspection.qualityRejected')}</p>}
            <h5 className="text-sm font-semibold">{t('inspection.centering')}</h5>
            {centering.status === 'measured' ? <>
              <p className="text-sm tnum">{t('inspection.horizontal')}: {ratio(centering.horizontal)}<br />
                {t('inspection.vertical')}: {ratio(centering.vertical)}</p>
              <p className="text-xs text-muted">{t('inspection.tolerance', { ratio: side === 'front' ? '55/45' : '75/25' })}</p>
              <p className="text-xs">{centering.psa10CenteringTolerance?.withinTolerance
                ? t('inspection.within') : t('inspection.outside')}</p>
            </> : <p className="text-sm text-muted">{t('inspection.unmeasured')}</p>}
            <h5 className="text-sm font-semibold">{t('inspection.edgesCorners')}</h5>
            <p className="text-sm text-muted">{side === 'front' ? t('inspection.frontReview')
              : inspection.anomalies.length ? t('inspection.marks', { count: inspection.anomalies.length }) : t('inspection.noMarks')}</p>
            {inspection.anomalies.length > 0 && <p className="text-xs text-muted">{t('inspection.markTypes', {
              corners: inspection.anomalies.filter(mark => mark.region === 'corner').length,
              edges: inspection.anomalies.filter(mark => mark.region === 'edge').length,
            })}</p>}
          </div>;
        })}
      </div>
      <a href="https://www.psacard.com/gradingstandards" target="_blank" rel="noopener noreferrer"
        className="inline-block text-sm text-azure underline underline-offset-2">{t('inspection.psaSource')}</a>
    </div>}
  </section>;
}

function GradeScore({ grade, labels }: {
  grade: EstimatedCardGrade;
  labels: { estimated: string; limited: string; centering: string; corners: string; edges: string; surface: string; disclaimer: string };
}) {
  const rows = [
    [labels.centering, grade.scores.centering], [labels.corners, grade.scores.corners],
    [labels.edges, grade.scores.edges], [labels.surface, grade.scores.surface],
  ] as const;
  return <div className="rounded-2xl border border-[rgb(74_222_128/0.28)] bg-[rgb(74_222_128/0.06)] p-4">
    <div className="flex items-center gap-4">
      <div className="grid size-20 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-400 text-3xl font-black text-white shadow-lg">
        {grade.overall.toFixed(grade.overall % 1 ? 1 : 0)}
      </div>
      <div>
        <p className="type-eyebrow">{labels.estimated}</p>
        <p className="mt-1 text-xl font-bold text-paper">{grade.label}</p>
        <p className="mt-1 text-xs text-amber">{labels.limited}</p>
      </div>
    </div>
    <div className="mt-5 space-y-3">
      {rows.map(([label, score]) => <div key={label}>
        <div className="mb-1 flex justify-between gap-3 text-sm"><span>{label}</span><span className="tnum font-semibold">{score.toFixed(score % 1 ? 1 : 0)}/10</span></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-hi"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${score * 10}%` }} /></div>
      </div>)}
    </div>
    <p className="mt-4 text-xs text-muted">{labels.disclaimer}</p>
  </div>;
}
