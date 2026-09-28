import { Link } from '@/i18n/routing';

export function GradeCta({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: string;
}) {
  return (
    <section className="surface-flat relative overflow-hidden rounded-[var(--radius-card)] p-4 sm:p-5">
      <div aria-hidden className="absolute inset-y-0 left-0 w-1 bg-[linear-gradient(180deg,var(--color-violet),var(--color-azure))]" />
      <div className="flex items-center gap-4 pl-1 sm:gap-5">
        <div className="relative grid size-16 shrink-0 place-items-center rounded-2xl border border-[rgb(139_92_246/0.35)] bg-[rgb(139_92_246/0.1)] text-azure sm:size-20">
          <GradeGlyph className="size-9 sm:size-11" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base leading-tight font-bold text-paper sm:text-lg">{title}</h2>
          <p className="type-meta mt-1 text-xs sm:text-sm">{body}</p>
          <Link
            href="/grade"
            className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-[linear-gradient(100deg,var(--color-violet),var(--color-azure))] px-5 text-sm font-semibold text-white shadow-[0_12px_28px_-18px_rgb(59_130_246/0.9)] transition-transform active:scale-[0.98]"
          >
            {action}
          </Link>
        </div>
      </div>
    </section>
  );
}

function GradeGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="5" width="24" height="34" rx="4" transform="rotate(-7 20 22)" />
      <rect x="16" y="9" width="24" height="34" rx="4" transform="rotate(5 28 26)" />
      <circle cx="28" cy="27" r="5" />
      <path d="m33 13 1.2 2.8L37 17l-2.8 1.2L33 21l-1.2-2.8L29 17l2.8-1.2L33 13Z" />
    </svg>
  );
}
