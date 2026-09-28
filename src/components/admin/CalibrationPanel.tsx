'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Surface } from '@/components/ui/Surface';
import { cn } from '@/lib/cn';
import { CARD_ASPECT } from '@/lib/images';
import { detectCards, type DetectedCard } from '@/lib/scan/detect';
import { assessFraming, READY_FRAMES, type FramingState } from '@/lib/scan/framing';
import { isDetectionStable, measureCaptureQuality, type CaptureQuality } from '@/lib/scan/capture-quality';
import { fingerprint } from '@/lib/scan/phash';
import { rectifyCard } from '@/lib/scan/rectify';
import { projectObjectCoverBox, type ProjectedBox } from '@/lib/scan/viewport';
import type { CalibrationCampaignRow } from '@/server/services/calibration';

const LOOK_INTERVAL = 320;

interface MatchCandidate {
  cardId: string;
  name: string;
  localId: string;
  setId: string;
  setName: string;
  distance: number;
}

interface MatchResult {
  candidates: MatchCandidate[];
  confident: boolean;
}

export function CalibrationPanel({
  initialCampaigns,
  cardLanguage,
  displayCurrency,
}: {
  initialCampaigns: CalibrationCampaignRow[];
  cardLanguage: string;
  displayCurrency: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureInFlightRef = useRef(false);
  const armedRef = useRef(true);

  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [campaign, setCampaign] = useState<CalibrationCampaignRow | null>(
    initialCampaigns.find((item) => item.status === 'active') ?? null,
  );
  const [targetCount, setTargetCount] = useState(100);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [framing, setFraming] = useState<FramingState>('searching');
  const [captureReady, setCaptureReady] = useState(false);
  const [guideBox, setGuideBox] = useState<ProjectedBox | null>(null);
  const [waitingForChange, setWaitingForChange] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setActive(false);
    setCaptureReady(false);
    setGuideBox(null);
  }, []);

  useEffect(() => stop, [stop]);

  async function refreshCampaigns(preferredId?: string) {
    const response = await fetch('/api/admin/calibration', { cache: 'no-store' });
    if (!response.ok) throw new Error('Impossible de rafraîchir les campagnes.');
    const body = await response.json() as { campaigns: CalibrationCampaignRow[] };
    setCampaigns(body.campaigns);
    const preferred = preferredId
      ? body.campaigns.find((item) => item.id === preferredId)
      : body.campaigns.find((item) => item.status === 'active');
    setCampaign(preferred ?? null);
  }

  async function createCampaign() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/calibration', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetCount }),
      });
      if (!response.ok) throw new Error('Impossible de créer la campagne.');
      const body = await response.json() as { id: string };
      await refreshCampaigns(body.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erreur inconnue');
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!campaign || campaign.status !== 'active') return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities = track.getCapabilities() as MediaTrackCapabilities & { focusMode?: string[] };
        if (capabilities.focusMode?.includes('continuous')) {
          await track.applyConstraints({
            advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
          }).catch(() => undefined);
        }
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      armedRef.current = true;
      setWaitingForChange(false);
      setActive(true);
      setGuideBox(null);
    } catch {
      setError("La caméra arrière n'est pas accessible.");
    }
  }

  function look(): {
    frame: ImageData;
    box: DetectedCard | null;
    state: FramingState;
    fill: number;
    quality: CaptureQuality | null;
  } | null {
    const video = videoRef.current;
    const canvas = analysisCanvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return null;
    canvas.width = Math.min(640, video.videoWidth);
    canvas.height = Math.max(1, Math.round(video.videoHeight / video.videoWidth * canvas.width));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    const framingResult = assessFraming(detectCards(frame), frame.width, frame.height);
    return {
      frame,
      ...framingResult,
      quality: framingResult.box ? measureCaptureQuality(frame, framingResult.box) : null,
    };
  }

  const saveCapture = useCallback(async (sample: ReturnType<typeof look> & {}) => {
    const currentCampaign = campaign;
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!currentCampaign || !video || !canvas || captureInFlightRef.current) return;

    captureInFlightRef.current = true;
    setBusy(true);
    const startedAt = performance.now();
    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas indisponible.');
      context.drawImage(video, 0, 0);
      const fullFrame = context.getImageData(0, 0, canvas.width, canvas.height);
      const fullFraming = assessFraming(detectCards(fullFrame), fullFrame.width, fullFrame.height);
      if (!fullFraming.box?.corners) throw new Error('Carte perdue avant la prise, nouvel essai.');

      const rectified = rectifyCard(fullFrame, fullFraming.box.corners, 720, 1008);
      canvas.width = rectified.width;
      canvas.height = rectified.height;
      const cropContext = canvas.getContext('2d');
      if (!cropContext) throw new Error('Canvas indisponible.');
      cropContext.putImageData(
        new ImageData(new Uint8ClampedArray(rectified.data), rectified.width, rectified.height),
        0,
        0,
      );

      let blob = await canvasBlob(canvas, 0.82);
      if (blob.size > 750_000) blob = await canvasBlob(canvas, 0.65);
      if (blob.size > 750_000) throw new Error('Photo trop lourde après compression.');
      const hash = fingerprint(rectified);

      const matchResponse = await fetch('/api/scan/match', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fingerprints: [hash],
          cardLanguage,
          displayCurrency,
        }),
      });
      if (!matchResponse.ok) throw new Error('Identification indisponible.');
      const matchBody = await matchResponse.json() as { results: MatchResult[] };
      const match = matchBody.results[0];

      const metadata = {
        fingerprint: hash,
        imageMime: blob.type,
        imageWidth: rectified.width,
        imageHeight: rectified.height,
        imageSize: blob.size,
        metrics: {
          edgeScore: sample.quality?.edgeScore ?? 0,
          darkRatio: sample.quality?.darkRatio ?? 0,
          brightRatio: sample.quality?.brightRatio ?? 0,
          fill: sample.fill,
          stability: true,
          captureMs: Math.round(performance.now() - startedAt),
        },
        candidates: (match?.candidates ?? []).slice(0, 12).map((candidate) => ({
          cardId: candidate.cardId,
          name: candidate.name,
          localId: candidate.localId,
          setId: candidate.setId,
          setName: candidate.setName,
          distance: candidate.distance,
          confident: Boolean(match?.confident),
        })),
        device: {
          userAgent: navigator.userAgent,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          cameraWidth: video.videoWidth,
          cameraHeight: video.videoHeight,
        },
      };

      const form = new FormData();
      form.set('campaignId', currentCampaign.id);
      form.set('metadata', JSON.stringify(metadata));
      form.set('image', blob, `capture-${currentCampaign.captureCount + 1}.jpg`);
      const response = await fetch('/api/admin/calibration', { method: 'POST', body: form });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'Enregistrement impossible.');
      }
      const stored = await response.json() as { sequence: number; targetCount: number; complete: boolean };
      const updated = {
        ...currentCampaign,
        captureCount: stored.sequence,
        status: stored.complete ? 'complete' : 'active',
      };
      setCampaign(updated);
      setCampaigns((items) => items.map((item) => item.id === updated.id ? updated : item));
      armedRef.current = false;
      setWaitingForChange(!stored.complete);
      if (stored.complete) stop();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erreur inconnue');
    } finally {
      captureInFlightRef.current = false;
      setCaptureReady(false);
      setBusy(false);
    }
  }, [campaign, cardLanguage, displayCurrency, stop]);

  useEffect(() => {
    if (!active || !campaign || campaign.status !== 'active') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let steady = 0;
    let absent = 0;
    let previousBox: DetectedCard | null = null;

    const tick = async () => {
      if (cancelled) return;
      const sample = look();
      if (!sample) {
        timer = setTimeout(tick, LOOK_INTERVAL);
        return;
      }
      setFraming(sample.state);
      const video = videoRef.current;
      setGuideBox(sample.box && video
        ? projectObjectCoverBox(
          sample.box,
          { width: sample.frame.width, height: sample.frame.height },
          { width: video.clientWidth, height: video.clientHeight },
        )
        : null);

      if (!armedRef.current) {
        if (sample.state !== 'ready') absent += 1;
        else absent = 0;
        if (absent >= 2) {
          armedRef.current = true;
          setWaitingForChange(false);
          previousBox = null;
        }
        timer = setTimeout(tick, LOOK_INTERVAL);
        return;
      }

      if (sample.state !== 'ready' || !sample.box || !sample.quality?.acceptable) {
        steady = 0;
        previousBox = sample.box;
        setCaptureReady(false);
        timer = setTimeout(tick, LOOK_INTERVAL);
        return;
      }
      const stable = Boolean(previousBox && isDetectionStable(
        previousBox,
        sample.box,
        sample.frame.width,
        sample.frame.height,
      ));
      previousBox = sample.box;
      if (!stable) {
        steady = 0;
        timer = setTimeout(tick, LOOK_INTERVAL);
        return;
      }
      steady += 1;
      setCaptureReady(steady >= READY_FRAMES);
      if (steady >= READY_FRAMES) {
        await saveCapture(sample);
        steady = 0;
        previousBox = null;
      }
      if (!cancelled) timer = setTimeout(tick, LOOK_INTERVAL);
    };

    timer = setTimeout(tick, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, campaign, saveCapture]);

  async function removeCampaign(id: string) {
    if (!window.confirm('Supprimer cette campagne et toutes ses photos ?')) return;
    stop();
    const response = await fetch(`/api/admin/calibration?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      setError('Suppression impossible.');
      return;
    }
    await refreshCampaigns();
  }

  const progress = campaign ? campaign.captureCount / campaign.targetCount : 0;

  return (
    <div className="space-y-5">
      {!campaign ? (
        <Surface className="space-y-4">
          <div>
            <label htmlFor="calibration-count" className="mb-1 block text-sm font-semibold">
              Nombre de tests
            </label>
            <input
              id="calibration-count"
              type="number"
              min={1}
              max={500}
              value={targetCount}
              onChange={(event) => setTargetCount(Number(event.target.value))}
              className="h-11 w-full rounded-xl border border-line bg-slate-hi px-3 text-paper"
            />
          </div>
          <Button onClick={createCampaign} loading={busy} fullWidth>
            Créer la campagne
          </Button>
        </Surface>
      ) : (
        <>
          <Surface className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="type-eyebrow">Campagne privée</p>
                <p className="tnum text-2xl font-bold text-paper">
                  Test {Math.min(campaign.captureCount + 1, campaign.targetCount)} / {campaign.targetCount}
                </p>
              </div>
              <p className={cn('text-sm font-semibold', campaign.status === 'complete' ? 'text-mint' : 'text-azure')}>
                {campaign.status === 'complete' ? 'Terminée' : `${campaign.captureCount} enregistrés`}
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-hi">
              <div className="h-full bg-[linear-gradient(90deg,var(--color-violet),var(--color-azure))]" style={{ width: `${progress * 100}%` }} />
            </div>
          </Surface>

          {campaign.status === 'active' ? (
            <div className="surface relative w-full overflow-hidden rounded-[var(--radius-card)] bg-ink-soft" style={{ aspectRatio: '3 / 4' }}>
              <video ref={videoRef} playsInline muted className={cn('size-full object-cover', active ? 'block' : 'hidden')} />
              {!active ? (
                <div className="flex size-full items-center justify-center p-6 text-center text-muted">
                  Démarre la caméra puis présente une carte. La photo part automatiquement quand le cadre devient vert.
                </div>
              ) : null}
              {active ? (
                <div className="pointer-events-none absolute inset-0">
                  <div
                    className={cn(
                      'rounded-xl border-2 transition-colors',
                      captureReady ? 'border-mint' : 'border-dashed border-white/60',
                    )}
                    style={guideBox
                      ? {
                        left: guideBox.left,
                        top: guideBox.top,
                        width: guideBox.width,
                        height: guideBox.height,
                        position: 'absolute',
                      }
                      : {
                        height: '72%',
                        aspectRatio: String(CARD_ASPECT),
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                      }}
                  />
                </div>
              ) : null}
              {active ? (
                <p className={cn(
                  'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-4 text-center text-sm font-semibold',
                  captureReady ? 'text-mint' : 'text-white',
                )}>
                  {waitingForChange
                    ? 'Change de carte pour le test suivant'
                    : framing === 'closer'
                      ? 'Rapproche la carte'
                      : framing === 'farther'
                        ? 'Éloigne légèrement la carte'
                        : framing === 'ready'
                          ? 'Ne bouge plus…'
                          : 'Place la carte dans le cadre'}
                </p>
              ) : null}
              <canvas ref={analysisCanvasRef} className="hidden" />
              <canvas ref={captureCanvasRef} className="hidden" />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            {campaign.status === 'active' ? (
              <Button onClick={active ? stop : start} loading={busy} fullWidth>
                {active ? 'Arrêter' : 'Démarrer'}
              </Button>
            ) : (
              <Button onClick={() => setCampaign(null)} fullWidth>Nouvelle campagne</Button>
            )}
            <a
              href={`/api/admin/calibration?id=${encodeURIComponent(campaign.id)}&export=1`}
              download
              className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-slate-hi px-4 text-sm font-semibold text-paper"
            >
              Exporter
            </a>
            <Button variant="danger" onClick={() => void removeCampaign(campaign.id)} className="col-span-2">
              Supprimer la campagne
            </Button>
          </div>
        </>
      )}

      {error ? <p role="alert" className="rounded-xl border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">{error}</p> : null}

      {campaigns.length > 1 ? (
        <Surface className="space-y-2">
          <p className="type-eyebrow">Campagnes précédentes</p>
          {campaigns.filter((item) => item.id !== campaign?.id).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCampaign(item)}
              className="flex w-full items-center justify-between rounded-xl border border-line px-3 py-2 text-left text-sm"
            >
              <span>{new Date(item.createdAt).toLocaleDateString('fr-FR')}</span>
              <span className="tnum text-muted">{item.captureCount}/{item.targetCount}</span>
            </button>
          ))}
        </Surface>
      ) : null}
    </div>
  );
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Compression impossible.')), 'image/jpeg', quality);
  });
}
