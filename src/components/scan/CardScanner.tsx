'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { cardmarketSearchUrl } from '@/lib/pricing/links';
import { cn } from '@/lib/cn';
import { detectCards, wholeFrame, type DetectedCard } from '@/lib/scan/detect';
import { assessFraming, READY_FRAMES, type FramingState } from '@/lib/scan/framing';
import { fingerprint } from '@/lib/scan/phash';
import { formatMoney, type Money } from '@/lib/pricing/money';
import { cardImage, CARD_ASPECT } from '@/lib/images';
import { adjustQuantity } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';

interface Candidate {
  cardId: string;
  name: string;
  localId: string;
  setId: string;
  setName: string;
  /** The printing's own language, used when adding it. */
  setLanguage: string;
  setCode: string | null;
  imageBaseUrl: string | null;
  rarity: string | null;
  distance: number;
  defaultVariantId: string | null;
  price: Money | null;
}

interface MatchResult {
  candidates: Candidate[];
  confident: boolean;
  margin: number;
  indexSize: number;
}

export interface ScannerLabels {
  start: string;
  stop: string;
  capture: string;
  retake: string;
  scanning: string;
  noCamera: string;
  permissionDenied: string;
  noMatch: string;
  noMatchBody: string;
  detected: string;
  confirmTitle: string;
  confirmBody: string;
  add: string;
  added: string;
  skip: string;
  close: string;
  uncertain: string;
  language: string;
  tipsTitle: string;
  tips: string[];
  indexIncomplete: string;
  viewMarket: string;
  /** Live framing guidance, shown over the viewfinder while hunting. */
  hintSearching: string;
  hintCloser: string;
  hintFarther: string;
  hintReady: string;
}

/**
 * Photograph cards and identify them.
 *
 * The honest shape of this feature, which drives the whole design:
 *
 *  - Artwork hashing gets the right card first try roughly 70% of the time on
 *    published benchmarks. So the scanner proposes, the user disposes: nothing
 *    is ever added without a tap, and the shortlist is always visible.
 *  - Artwork cannot tell you the printed language or distinguish a reprint. The
 *    language comes from the user's setting, shown and changeable here.
 *  - Several cards in one frame only works if each is cropped out first, so
 *    detection runs before hashing and the UI shows what it found.
 *
 * Everything runs on-device. Frames never leave the phone; only a 32-character
 * fingerprint is sent.
 */
/**
 * How often the viewfinder is examined.
 *
 * Detection alone is local and cheap, so this can be brisk enough for the
 * guidance to feel live. The old loop ran at 900ms because every tick also
 * hashed and posted a frame; now that only happens once the card is framed.
 */
const LOOK_INTERVAL = 320;

export function CardScanner({
  labels,
  locale,
  cardLanguage,
  displayCurrency,
  signedIn,
  indexComplete,
}: {
  labels: ScannerLabels;
  locale: string;
  cardLanguage: string;
  displayCurrency: string;
  signedIn: boolean;
  indexComplete: boolean;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<DetectedCard[]>([]);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [shot, setShot] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [framing, setFraming] = useState<FramingState>('searching');

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => stop, [stop]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Rear camera, and as much resolution as the device will give: the
        // artwork crop is a fraction of the frame, so detail matters.
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
      setResults([]);
      setShot(null);
      setFraming('searching');
    } catch (cause) {
      const name = (cause as { name?: string })?.name;
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? labels.permissionDenied
          : labels.noCamera,
      );
    }
  }

  /**
   * Look at the current frame without touching the network.
   *
   * Detection is local and cheap, so this runs several times a second to
   * drive the on-screen guidance. Only when the card is actually well framed
   * does the expensive half - hashing and the lookup - happen.
   */
  function look(): { regions: DetectedCard[]; state: FramingState } | null {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(video, 0, 0);

    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    const detected = detectCards(frame);
    const { state } = assessFraming(detected, frame.width, frame.height);
    return { regions: detected.length > 0 ? detected : [wholeFrame(frame)], state };
  }

  /**
   * Take one frame and try to identify what is in it.
   *
   * Returns true when the answer is good enough to stop looking. `quiet` is
   * set by the automatic loop, where a miss is the normal case and must not
   * paint an error over the viewfinder - the next frame is a fraction of a
   * second away.
   */
  async function capture(quiet = false): Promise<boolean> {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return false;

    setBusy(true);
    if (!quiet) setError(null);
    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('canvas');
      context.drawImage(video, 0, 0);

      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      const detected = detectCards(frame);
      const regions = detected.length > 0 ? detected : [wholeFrame(frame)];

      // Hash each detected region separately - a fingerprint of the whole
      // frame would describe the table, not a card.
      const fingerprints = regions.map((box) => {
        const region = context.getImageData(box.x, box.y, box.width, box.height);
        return fingerprint({
          data: region.data,
          width: region.width,
          height: region.height,
        });
      });

      const response = await fetch('/api/scan/match', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fingerprints, cardLanguage, displayCurrency }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? 'match failed');

      const body = (await response.json()) as { results: MatchResult[] };
      const confident = body.results.some((result) => result.confident);

      // The automatic loop only settles on a confident read. Anything less and
      // it keeps looking, because the next frame - a steadier hand, better
      // light - is usually better than asking the user to judge a bad one.
      if (quiet && !confident) return false;

      setResults(body.results);
      setBoxes(regions);
      setShot(canvas.toDataURL('image/jpeg', 0.7));
      stop();
      return true;
    } catch (cause) {
      if (!quiet) setError(cause instanceof Error ? cause.message : labels.noMatch);
      return false;
    } finally {
      setBusy(false);
    }
  }

  /**
   * Keep scanning while the camera is on.
   *
   * Asking someone to hold a card steady with one hand and press a button with
   * the other is the wrong shape for this job. The loop stops the moment it
   * recognises something, so the interaction is: point, and it is done.
   *
   * Frames are taken about once a second. Faster spends battery and CPU on
   * near-identical images; slower feels unresponsive.
   */
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let steady = 0;

    const tick = async () => {
      if (cancelled) return;

      const seen = look();
      if (!seen) {
        timer = setTimeout(tick, LOOK_INTERVAL);
        return;
      }
      setFraming(seen.state);

      // Not framed well enough to be worth a lookup. Say what to change and
      // come back shortly - this is the common case, and it costs nothing.
      if (seen.state !== 'ready') {
        steady = 0;
        timer = setTimeout(tick, LOOK_INTERVAL);
        return;
      }

      // Well framed, but wait for it to hold: a card swinging past passes
      // through "ready" on its way, and grabbing that gives a blurred hash.
      steady += 1;
      if (steady < READY_FRAMES) {
        timer = setTimeout(tick, LOOK_INTERVAL);
        return;
      }

      const found = await capture(true);
      if (!cancelled && !found) {
        steady = 0;
        timer = setTimeout(tick, LOOK_INTERVAL);
      }
    };

    // Give the camera a moment to expose and focus before the first frame.
    timer = setTimeout(tick, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- capture reads
    // refs and setState only; re-creating the loop on every render would
    // restart the timer forever.
  }, [active]);

  async function add(candidate: Candidate) {
    if (!candidate.defaultVariantId) return;
    await adjustQuantity({
      cardVariantId: candidate.defaultVariantId,
      // The printing's own language, not the viewer's preference. A Japanese
      // card recognised from its artwork was previously filed as English
      // because that was the default in the picker.
      language: candidate.setLanguage ?? cardLanguage,
      delta: 1,
    });
    setAddedIds((previous) => new Set(previous).add(candidate.cardId));
    router.refresh();
  }

  const anyMatches = results.some((result) => result.candidates.length > 0);

  return (
    <div className="space-y-4">
      {!indexComplete ? (
        <p className="rounded-xl border border-[rgb(245_181_68/0.28)] bg-[rgb(245_181_68/0.08)] px-3.5 py-2.5 text-[0.8125rem] text-amber">
          {labels.indexIncomplete}
        </p>
      ) : null}

      <div
        className="surface relative w-full overflow-hidden rounded-[var(--radius-card)] bg-ink-soft"
        style={{ aspectRatio: '3 / 4' }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className={cn('size-full object-cover', active ? 'block' : 'hidden')}
        />

        {shot && !active ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot} alt="" className="size-full object-cover opacity-70" />
        ) : null}

        {!active && !shot ? (
          <div className="flex size-full flex-col items-center justify-center gap-4 p-6 text-center">
            <CameraGlyph />
            <p className="type-meta max-w-[34ch] text-[0.8125rem]">{labels.tipsTitle}</p>
          </div>
        ) : null}

        {/* Framing guide: a card-shaped cutout tells the user what to aim for
            far better than a sentence does - and it turns green and stops
            being dashed the moment the shot is good, so the sentence below
            is confirmation rather than instruction. */}
        {active ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div
              className={cn(
                'rounded-xl border-2 transition-colors duration-200',
                framing === 'ready'
                  ? 'border-solid border-[rgb(52_211_153/0.95)]'
                  : 'border-dashed border-[rgb(255_255_255/0.55)]',
              )}
              style={{ height: '72%', aspectRatio: String(CARD_ASPECT) }}
            />
          </div>
        ) : null}

        {/* What to do about it, in words. */}
        {active ? (
          <p
            aria-live="polite"
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 px-4 py-3 text-center',
              'text-[0.875rem] font-semibold',
              'bg-gradient-to-t from-[rgb(0_0_0/0.72)] to-transparent',
              framing === 'ready' ? 'text-mint' : 'text-white',
            )}
          >
            {framing === 'ready'
              ? labels.hintReady
              : framing === 'closer'
                ? labels.hintCloser
                : framing === 'farther'
                  ? labels.hintFarther
                  : labels.hintSearching}
          </p>
        ) : null}

        {/* Boxes the detector found, drawn over the captured still. */}
        {!active && shot && boxes.length > 0 ? (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {boxes.map((box, index) => {
              const canvas = canvasRef.current;
              if (!canvas) return null;
              return (
                <span
                  key={index}
                  className="absolute rounded-md border-2 border-[var(--color-azure)] shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]"
                  style={{
                    left: `${(box.x / canvas.width) * 100}%`,
                    top: `${(box.y / canvas.height) * 100}%`,
                    width: `${(box.width / canvas.width) * 100}%`,
                    height: `${(box.height / canvas.height) * 100}%`,
                  }}
                />
              );
            })}
          </div>
        ) : null}

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-[rgb(240_87_111/0.3)] bg-[rgb(240_87_111/0.08)] px-3.5 py-2.5 text-[0.8125rem] text-rose">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        {!active ? (
          <Button onClick={start} fullWidth size="lg">
            {shot ? labels.retake : labels.start}
          </Button>
        ) : (
          <>
            <Button onClick={() => void capture(false)} loading={busy} fullWidth size="lg">
              {busy ? labels.scanning : labels.capture}
            </Button>
            <Button variant="secondary" size="lg" onClick={stop}>
              {labels.stop}
            </Button>
          </>
        )}
      </div>

      {results.length > 0 ? (
        <section className="space-y-3">
          <p className="type-eyebrow">{labels.detected.replace('{count}', String(results.length))}</p>

          {!anyMatches ? (
            <div className="surface-flat rounded-[var(--radius-tile)] px-4 py-5 text-center">
              <p className="text-[0.875rem] font-medium">{labels.noMatch}</p>
              <p className="type-meta mx-auto mt-1.5 max-w-[42ch] text-xs">{labels.noMatchBody}</p>
            </div>
          ) : null}

          {results.map((result, index) => {
            const best = result.candidates[0];
            if (!best) return null;
            const added = addedIds.has(best.cardId);

            return (
              <div
                key={index}
                className="surface-flat flex items-center gap-3 rounded-[var(--radius-tile)] p-2.5"
              >
                <div
                  className="relative w-[52px] shrink-0 overflow-hidden rounded-lg bg-ink-soft"
                  style={{ aspectRatio: String(CARD_ASPECT) }}
                >
                  {best.imageBaseUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cardImage(best.imageBaseUrl, 'low') ?? ''}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.875rem] font-semibold">{best.name}</p>
                  <p className="type-meta truncate text-[0.6875rem]">
                    <span className="font-mono">{best.localId}</span> · {best.setName}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {best.price ? (
                      <span className="tnum text-[0.75rem] font-semibold">
                        {formatMoney(best.price, locale)}
                      </span>
                    ) : null}
                    {!result.confident ? (
                      <span className="text-[0.625rem] text-amber">{labels.uncertain}</span>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col gap-1">
                  {signedIn ? (
                    <Button
                      size="sm"
                      variant={added ? 'secondary' : 'primary'}
                      disabled={added || !best.defaultVariantId}
                      onClick={() => add(best)}
                    >
                      {added ? labels.added : labels.add}
                    </Button>
                  ) : (
                    <Link href={`/cards/${encodeURIComponent(best.cardId)}`}>
                      <Button size="sm" variant="secondary">
                        {labels.add}
                      </Button>
                    </Link>
                  )}
                  <a
                    href={cardmarketSearchUrl(best.name, best.localId, best.setCode, locale)}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-center text-[0.6875rem] text-muted underline decoration-hairline-strong underline-offset-2 hover:text-paper"
                  >
                    {labels.viewMarket}
                  </a>
                  {result.candidates.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setOpenIndex(index)}
                      className="text-[0.6875rem] text-muted underline decoration-hairline-strong underline-offset-2 hover:text-paper"
                    >
                      {labels.skip}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      {/* Full shortlist, because rank 1 is wrong often enough that the other
          candidates are not a curiosity - they are the fix. */}
      <Sheet
        open={openIndex !== null}
        onClose={() => setOpenIndex(null)}
        title={labels.confirmTitle}
        description={labels.confirmBody}
      >
        <ul className="space-y-2">
          {(openIndex !== null ? (results[openIndex]?.candidates ?? []) : []).map((candidate) => (
            <li
              key={candidate.cardId}
              className="surface-flat flex items-center gap-3 rounded-[var(--radius-tile)] p-2.5"
            >
              <div
                className="relative w-[44px] shrink-0 overflow-hidden rounded-lg bg-ink-soft"
                style={{ aspectRatio: String(CARD_ASPECT) }}
              >
                {candidate.imageBaseUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cardImage(candidate.imageBaseUrl, 'low') ?? ''}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.8125rem] font-semibold">{candidate.name}</p>
                <p className="type-meta truncate text-[0.625rem]">
                  <span className="font-mono">{candidate.localId}</span> · {candidate.setName}
                </p>
              </div>
              {signedIn ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={addedIds.has(candidate.cardId) || !candidate.defaultVariantId}
                  onClick={() => add(candidate)}
                >
                  {addedIds.has(candidate.cardId) ? labels.added : labels.add}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Sheet>

      <section className="surface-flat rounded-[var(--radius-tile)] p-4">
        <p className="type-eyebrow mb-2">{labels.tipsTitle}</p>
        <ul className="space-y-1.5">
          {labels.tips.map((tip) => (
            <li key={tip} className="type-meta flex gap-2 text-[0.8125rem]">
              <span aria-hidden className="text-faint">
                ·
              </span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function CameraGlyph() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="size-12 text-faint">
      <rect x="5" y="13" width="38" height="27" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M17 13l3-5h8l3 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="24" cy="26" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
