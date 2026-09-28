import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';

export function CollectionTabs({ active, labels }: { active: 'collection' | 'wishlist'; labels: { collection: string; wishlist: string } }) {
  return <nav aria-label={labels.collection} className="flex gap-2">
    <Tab href="/collection" active={active === 'collection'}>{labels.collection}</Tab>
    <Tab href="/wishlist" active={active === 'wishlist'}>{labels.wishlist}</Tab>
  </nav>;
}

function Tab({ href, active, children }: { href: '/collection' | '/wishlist'; active: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-current={active ? 'page' : undefined} className={cn(
    'inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold transition-colors',
    active ? 'border-[rgb(139_92_246/0.4)] bg-[rgb(139_92_246/0.13)] text-paper' : 'border-hairline text-muted hover:text-paper',
  )}>{children}</Link>;
}
