'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { rectifyCard, type Point } from '@/lib/scan/rectify';

type Corners = [Point, Point, Point, Point];
const INITIAL: Corners = [{ x: .1, y: .1 }, { x: .9, y: .1 }, { x: .9, y: .9 }, { x: .1, y: .9 }];

export interface GradePhotoLabels {
  choose: string; camera: string; gallery: string; corners: string; confirm: string; ready: string; error: string; corner: string;
}

/** A confirmed four-corner crop keeps table/sleeve pixels out of border measurements. */
export function GradePhoto({ label, labels, disabled, onChange, minCropWidth = 630 }: {
  label: string; labels: GradePhotoLabels; disabled: boolean; onChange: (file: File | null) => void;
  minCropWidth?: number;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);
  const generation = useRef(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [corners, setCorners] = useState<Corners>(INITIAL);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => () => { generation.current++; }, []);

  async function load(file?: File) {
    const version = ++generation.current;
    onChange(null); setReady(false); setError(false); setPreview(null); canvas.current = null;
    if (!file) return;
    if (file.size > 20 * 1024 * 1024 || !file.type.startsWith('image/')) { setError(true); return; }
    setBusy(true);
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      if (version !== generation.current) return;
      if (bitmap.width * bitmap.height > 40_000_000) throw new Error('dimensions');
      const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
      const next = document.createElement('canvas');
      next.width = Math.round(bitmap.width * scale); next.height = Math.round(bitmap.height * scale);
      const context = next.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('canvas');
      context.drawImage(bitmap, 0, 0, next.width, next.height);
      canvas.current = next;
      setCorners(INITIAL); setPreview(next.toDataURL('image/jpeg', .94));
    } catch { if (version === generation.current) setError(true); }
    finally { bitmap?.close(); if (version === generation.current) setBusy(false); }
  }

  function move(index: number, x: number, y: number) {
    if (disabled || busy || ready) return;
    setCorners((previous) => previous.map((point, i) => i === index
      ? { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) } : point) as Corners);
    setError(false);
  }

  async function confirm() {
    const input = canvas.current;
    const context = input?.getContext('2d');
    if (!input || !context) return;
    setBusy(true); setError(false);
    const version = generation.current;
    try {
      const points = corners.map(p => ({ x: p.x * (input.width - 1), y: p.y * (input.height - 1) })) as Corners;
      const edge = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
      const width = Math.floor(Math.min(1260, edge(points[0], points[1]), edge(points[3], points[2]),
        edge(points[0], points[3]) * 63 / 88, edge(points[1], points[2]) * 63 / 88));
      if (width < minCropWidth) throw new Error('resolution');
      const height = Math.round(width * 88 / 63);
      const pixels = rectifyCard(context.getImageData(0, 0, input.width, input.height), points, width, height);
      const output = document.createElement('canvas'); output.width = width; output.height = height;
      const target = output.getContext('2d');
      if (!target) throw new Error('canvas');
      target.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), width, height), 0, 0);
      const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, 'image/jpeg', .97));
      if (version !== generation.current) return;
      if (!blob) throw new Error('encode');
      setPreview(output.toDataURL('image/jpeg', .94)); setReady(true);
      onChange(new File([blob], 'card.jpg', { type: 'image/jpeg' }));
    } catch { if (version === generation.current) setError(true); }
    finally { if (version === generation.current) setBusy(false); }
  }

  return <fieldset disabled={disabled || busy} className="min-w-0 space-y-2">
    <legend className="mb-2 font-semibold">{label}</legend>
    <div className="grid grid-cols-2 gap-2">
      <label className="surface-flat flex min-h-11 cursor-pointer items-center justify-center rounded-xl px-3 text-center text-sm font-semibold">
        {labels.camera}
        <input className="sr-only" type="file" accept="image/*" capture="environment"
          onChange={e => { void load(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      <label className="surface-flat flex min-h-11 cursor-pointer items-center justify-center rounded-xl px-3 text-center text-sm font-semibold">
        {labels.gallery}
        <input className="sr-only" type="file" accept="image/*"
          onChange={e => { void load(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
    </div>
    {preview && <>
      {!ready && <p className="text-xs text-muted">{labels.corners}</p>}
      <div ref={frame} className="relative mx-auto w-full max-w-[360px]">
        {/* Local, metadata-free preview, never a remote resource. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt={label} className="block w-full rounded-lg" draggable={false} />
        {!ready && <>
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <polygon points={corners.map(p => `${p.x * 100},${p.y * 100}`).join(' ')} fill="rgb(0 160 255 / .12)" stroke="#38bdf8" strokeWidth=".5" />
          </svg>
          {corners.map((point, index) => <button key={index} type="button" aria-label={`${labels.corner} ${index + 1}`}
            className="absolute flex size-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 border-white bg-black/70 text-white"
            style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
            onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)}
            onPointerMove={e => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              const box = frame.current?.getBoundingClientRect();
              if (box) move(index, (e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
            }}
            onPointerUp={e => e.currentTarget.releasePointerCapture(e.pointerId)}
            onKeyDown={e => {
              const step = e.shiftKey ? .001 : .005;
              const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
              const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
              if (dx || dy) { e.preventDefault(); move(index, point.x + dx, point.y + dy); }
            }}>{index + 1}</button>)}
        </>}
      </div>
      {ready ? <p className="text-sm text-mint">{labels.ready}</p>
        : <Button type="button" fullWidth loading={busy} onClick={() => void confirm()}>{labels.confirm}</Button>}
    </>}
    {error && <p role="alert" className="text-sm text-rose">{labels.error}</p>}
  </fieldset>;
}
