import type { ReactNode } from 'react';

/**
 * Next requires a root layout, but the real document shell lives in
 * `[locale]/layout.tsx` where the locale is known and can be put on <html lang>.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
