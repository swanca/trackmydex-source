import { publicRoute, error, json } from '@/server/api';
import { LIMITS } from '@/lib/rate-limit';
import { inspectPhoto } from '@/lib/grade/inspect-photo';
import { estimateCardGrade } from '@/lib/grade/card-grade';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_REQUEST_BYTES = 2 * MAX_FILE_BYTES + 64 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const POST = publicRoute(async ({ request }) => {
  // Bound actual streamed bytes, even when Content-Length is missing or dishonest.
  if (!request.body) return error('Upload front and back card photos', 422);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_REQUEST_BYTES) { await reader.cancel(); return error('Photos are too large', 413); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
    }).formData();
  } catch { return error('Invalid photo upload', 422); }
  const front = form.get('front'), back = form.get('back');
  if (!(front instanceof File) || !(back instanceof File)) return error('Both front and back photos are required', 422);
  for (const file of [front, back]) {
    if (!TYPES.has(file.type)) return error('Use JPEG, PNG or WebP photos', 415);
    if (!file.size || file.size > MAX_FILE_BYTES) return error('Each photo must be below 8 MB', 413);
  }
  try {
    const frontResult = await inspectPhoto(new Uint8Array(await front.arrayBuffer()), 'front');
    const backResult = await inspectPhoto(new Uint8Array(await back.arrayBuffer()), 'back');
    const grade = estimateCardGrade(frontResult, backResult);
    const response = json({
      engine: 'local-card-inspection-v1', grade,
      front: frontResult, back: backResult,
      limitations: ['not-a-trained-ai-grader', 'surface-requires-angled-light', 'marks-require-visual-confirmation'],
      source: 'https://www.psacard.com/gradingstandards',
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch { return error('Photos could not be inspected. Confirm sharp, upright crops of both sides.', 422); }
}, { scope: 'scan-pregrade', limit: LIMITS.pregrade });
