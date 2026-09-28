import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';

export function CatalogTabs({
  active,
  labels,
}: {
  active: 'sets' | 'sealed';
  labels: { sets: string; sealed: string };
}) {
  return (
    <nav
      aria-label={labels.sets}
      className="surface-flat mb-4 grid grid-cols-2 rounded-[var(--radius-tile)] p-1"
    >
      <CatalogTab href="/sets" active={active === 'sets'}>
        {labels.sets}
      </CatalogTab>
      <CatalogTab href="/sealed" active={active === 'sealed'}>
        {labels.sealed}
      </CatalogTab>
    </nav>
  );
}

function CatalogTab({
  href,
  active,
  children,
}: {
  href: '/sets' | '/sealed';
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-11 items-center justify-center rounded-[calc(var(--radius-tile)-4px)] px-3 text-sm font-semibold transition-colors',
        active
          ? 'bg-[linear-gradient(100deg,var(--color-violet),var(--color-azure))] text-white shadow-[0_10px_24px_-16px_rgb(59_130_246/0.8)]'
          : 'text-muted hover:bg-[rgb(148_163_208/0.07)] hover:text-paper',
      )}
    >
      {children}
    </Link>
  );
}
