import type { Metadata } from 'next';
import { NoIndexLayout } from '@/components/seo/NoIndexLayout';
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default NoIndexLayout;
