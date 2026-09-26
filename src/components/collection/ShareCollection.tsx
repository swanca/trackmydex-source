'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import {
  createCollectionShare,
  revokeCollectionShare,
  updateCollectionShare,
} from '@/lib/api-client';
import { buildShareDestinations, type ShareDestinationId } from '@/lib/collection-share';
import {
  DiscordIcon,
  FacebookIcon,
  InstagramIcon,
  MailIcon,
  RedditIcon,
  ShareIcon,
  XIcon,
} from '@/components/layout/icons';

interface ShareState {
  publicToken: string;
  showValue: boolean;
}

export interface ShareCollectionLabels {
  action: string;
  title: string;
  description: string;
  create: string;
  copy: string;
  copied: string;
  nativeShare: string;
  showValue: string;
  exportCsv: string;
  revoke: string;
  revokeConfirm: string;
  error: string;
  shareTitle: string;
  shareText: string;
  email: string;
  facebook: string;
  x: string;
  reddit: string;
  instagram: string;
  discord: string;
}

export function ShareCollection({
  initialShare,
  locale,
  origin,
  labels,
}: {
  initialShare: ShareState | null;
  locale: string;
  origin: string;
  labels: ShareCollectionLabels;
}) {
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState(initialShare);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const publicUrl = share ? `${origin}/${locale}/shared/${share.publicToken}` : null;
  const destinations = useMemo(
    () => publicUrl
      ? buildShareDestinations({ url: publicUrl, title: labels.shareTitle, text: labels.shareText })
      : [],
    [labels.shareText, labels.shareTitle, publicUrl],
  );

  async function copyLink() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setStatus(labels.copied);
  }

  async function shareOrCopy() {
    if (!publicUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: labels.shareTitle, text: labels.shareText, url: publicUrl });
        return;
      } catch (cause) {
        if ((cause as Error).name === 'AbortError') return;
      }
    }
    await copyLink();
  }

  async function create() {
    setBusy(true);
    setStatus(null);
    try {
      const result = await createCollectionShare();
      setShare(result.share);
    } catch {
      setStatus(labels.error);
    } finally {
      setBusy(false);
    }
  }

  async function toggleValue(showValue: boolean) {
    if (!share) return;
    const previous = share;
    setShare({ ...share, showValue });
    try {
      const result = await updateCollectionShare(showValue);
      setShare(result.share);
    } catch {
      setShare(previous);
      setStatus(labels.error);
    }
  }

  async function revoke() {
    if (!window.confirm(labels.revokeConfirm)) return;
    setBusy(true);
    try {
      await revokeCollectionShare();
      setShare(null);
      setStatus(null);
    } catch {
      setStatus(labels.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" icon={<ShareIcon className="size-4" />} onClick={() => setOpen(true)}>
        {labels.action}
      </Button>
      <Sheet open={open} onClose={() => !busy && setOpen(false)} title={labels.title} description={labels.description}>
        {!share ? (
          <Button fullWidth loading={busy} onClick={create}>{labels.create}</Button>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input readOnly value={publicUrl ?? ''} className="min-w-0 flex-1 rounded-xl border border-hairline bg-surface px-3 text-sm text-paper" />
              <Button variant="secondary" onClick={copyLink}>{labels.copy}</Button>
            </div>

            <Button fullWidth variant="secondary" icon={<ShareIcon className="size-4" />} onClick={shareOrCopy}>
              {labels.nativeShare}
            </Button>

            <label className="surface-flat flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm">
              <span>{labels.showValue}</span>
              <input type="checkbox" checked={share.showValue} onChange={(event) => toggleValue(event.target.checked)} className="size-5 accent-violet" />
            </label>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {destinations.map((destination) => (
                <a key={destination.id} href={destination.href} target={destination.id === 'email' ? undefined : '_blank'} rel="noopener noreferrer nofollow" className="surface-flat flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[0.6875rem] text-muted hover:text-paper">
                  <SocialIcon id={destination.id} />
                  {labels[destination.id]}
                </a>
              ))}
              <button type="button" onClick={shareOrCopy} className="surface-flat flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[0.6875rem] text-muted hover:text-paper">
                <InstagramIcon className="size-5" />{labels.instagram}
              </button>
              <button type="button" onClick={shareOrCopy} className="surface-flat flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[0.6875rem] text-muted hover:text-paper">
                <DiscordIcon className="size-5" />{labels.discord}
              </button>
            </div>

            <a href="/api/collection/export" download className="block">
              <Button type="button" variant="ghost" fullWidth>{labels.exportCsv}</Button>
            </a>
            <Button variant="danger" fullWidth loading={busy} onClick={revoke}>{labels.revoke}</Button>
          </div>
        )}
        {status ? <p role="status" className="mt-3 text-center text-sm text-mint">{status}</p> : null}
      </Sheet>
    </>
  );
}

function SocialIcon({ id }: { id: ShareDestinationId }) {
  const className = 'size-5';
  if (id === 'email') return <MailIcon className={className} />;
  if (id === 'facebook') return <FacebookIcon className={className} />;
  if (id === 'x') return <XIcon className={className} />;
  return <RedditIcon className={className} />;
}
