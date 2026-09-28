import { z } from 'zod';
import { adminRoute, error, json, readJson } from '@/server/api';
import { LIMITS } from '@/lib/rate-limit';
import {
  calibrationCampaignSchema,
  calibrationCaptureSchema,
  MAX_CALIBRATION_IMAGE_BYTES,
} from '@/lib/scan/calibration';
import {
  addCalibrationCapture,
  createCalibrationCampaign,
  deleteCalibrationCampaign,
  exportCalibrationCampaign,
  listCalibrationCampaigns,
} from '@/server/services/calibration';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const idSchema = z.string().uuid();

export const GET = adminRoute(async ({ user, request }) => {
  const url = new URL(request.url);
  const campaignId = url.searchParams.get('id');
  if (campaignId && url.searchParams.get('export') === '1') {
    const id = idSchema.parse(campaignId);
    const data = await exportCalibrationCampaign(user.id, id);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(data), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="scanner-calibration-${stamp}.json"`,
        'cache-control': 'no-store, private',
      },
    }) as never;
  }
  return json({ campaigns: await listCalibrationCampaigns(user.id) }, {
    headers: { 'cache-control': 'no-store, private' },
  });
}, { limit: LIMITS.adminCalibration, scope: 'admin-calibration-read' });

export const POST = adminRoute(async ({ user, request }) => {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    const input = calibrationCampaignSchema.parse(await readJson(request));
    const id = await createCalibrationCampaign(user.id, input.targetCount);
    return json({ id }, { status: 201 });
  }

  const form = await request.formData();
  const campaignId = idSchema.parse(form.get('campaignId'));
  const metadataValue = form.get('metadata');
  const image = form.get('image');
  if (typeof metadataValue !== 'string' || !(image instanceof File)) {
    return error('Missing image or metadata', 422);
  }
  if (image.size > MAX_CALIBRATION_IMAGE_BYTES) return error('Image is too large', 413);

  const metadata = calibrationCaptureSchema.parse(JSON.parse(metadataValue));
  if (image.type !== metadata.imageMime) return error('Image type does not match metadata', 422);
  const stored = await addCalibrationCapture({
    userId: user.id,
    campaignId,
    image: Buffer.from(await image.arrayBuffer()),
    metadata,
  });
  return json(stored, { status: 201 });
}, { limit: LIMITS.adminCalibration, scope: 'admin-calibration-write' });

export const DELETE = adminRoute(async ({ user, request }) => {
  const campaignId = idSchema.parse(new URL(request.url).searchParams.get('id'));
  await deleteCalibrationCampaign(user.id, campaignId);
  return json({ ok: true });
}, { limit: LIMITS.adminCalibration, scope: 'admin-calibration-delete' });
