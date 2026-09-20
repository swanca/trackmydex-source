import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth';

/** Better Auth owns every /api/auth/* endpoint: sign-in, reset, OAuth callbacks. */
export const { GET, POST } = toNextJsHandler(auth);
