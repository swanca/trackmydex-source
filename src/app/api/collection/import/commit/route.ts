import { z } from 'zod';
import { authed, json, readJson } from '@/server/api';
import { LIMITS } from '@/lib/rate-limit';
import { commitImport, previewImport } from '@/server/services/csv';

const bodySchema = z.object({
  csv: z.string().min(1).max(4 * 1024 * 1024),
  strategy: z.enum(['skip', 'add', 'replace']).default('skip'),
});

/**
 * Applies an import.
 *
 * Re-derives the preview server-side rather than trusting a client-supplied
 * one: the browser could otherwise post a fabricated row list pointing at
 * arbitrary printings with arbitrary quantities.
 */
export const POST = authed(
  async ({ user, request }) => {
    const { csv, strategy } = bodySchema.parse(await readJson(request));
    const preview = await previewImport(user.id, csv);
    const result = await commitImport(user.id, preview, strategy);
    return json(result);
  },
  { scope: 'import', limit: LIMITS.csvImport },
);
