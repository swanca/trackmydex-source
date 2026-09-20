'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Bottom sheet — the app's only modal pattern on phones.
 *
 * The brief asks for minimal modal complexity and mobile-friendly filters, so
 * everything that would be a dialog on desktop is a sheet here: it rises from
 * the thumb, it is dismissed by tapping away or pressing Escape, and it never
 * covers the whole screen, so context stays visible behind it.
 *
 * Built on <dialog> for free focus trapping, inertness of the page behind, and
 * Escape handling that works with a hardware keyboard.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Clicking the backdrop (the dialog element itself) closes; clicking the
        // panel does not.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        'm-0 w-full max-w-none bg-transparent p-0 text-paper backdrop:bg-black/70',
        'mt-auto max-h-[92dvh] sm:m-auto sm:max-w-lg',
        'backdrop:backdrop-blur-[2px]',
      )}
    >
      <div
        className={cn(
          'surface flex max-h-[92dvh] flex-col rounded-t-[26px] sm:rounded-[var(--radius-card)]',
          '[animation:vault-sheet-in_260ms_var(--ease-out)] sm:[animation:vault-rise_200ms_var(--ease-out)]',
          size === 'lg' ? 'min-h-[60dvh]' : '',
        )}
      >
        {/* Grab handle: a physical affordance for the thumb, and a visual cue
            that this panel came from the bottom edge. */}
        <div className="flex justify-center pt-3 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-[rgb(148_163_208/0.25)]" />
        </div>

        <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h2 id={titleId} className="type-section truncate">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="type-meta mt-1">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-[rgb(148_163_208/0.1)] hover:text-paper"
          >
            <svg viewBox="0 0 20 20" className="size-4.5" aria-hidden>
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>

        {footer ? (
          <footer
            className="hairline-t px-5 pt-3"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
          >
            {footer}
          </footer>
        ) : (
          <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
        )}
      </div>
    </dialog>
  );
}
