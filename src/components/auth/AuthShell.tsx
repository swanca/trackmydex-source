import type { ReactNode } from 'react';
import { LogoMark } from '@/components/layout/Logo';

/**
 * Auth page frame.
 *
 * Narrow, centred, and without the app chrome: on a phone the bottom nav would
 * sit under the keyboard during sign-in, and there is nothing to navigate to
 * until you are in.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="pt-safe mx-auto flex min-h-[80dvh] w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 flex items-center gap-2.5">
        <LogoMark className="size-8" />
        <span className="font-display text-[1.0625rem] font-bold tracking-[-0.02em]">
          TrackMyDex
        </span>
      </div>

      <h1 className="type-title mb-1.5">{title}</h1>
      <p className="type-meta mb-7 text-[0.9375rem]">{subtitle}</p>

      {children}

      {footer ? <div className="mt-6 text-[0.8125rem] text-muted">{footer}</div> : null}
    </div>
  );
}
