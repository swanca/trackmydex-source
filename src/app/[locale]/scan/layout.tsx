import type { Metadata } from 'next';
import type { ReactNode } from 'react';
/** The scanner and pre-grade are public acquisition pages, including signed out. */
export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

export default function ScanLayout({ children }: { children: ReactNode }) {
  return children;
}
