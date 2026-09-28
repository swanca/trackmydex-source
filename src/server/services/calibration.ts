import { and, asc, eq, sql } from 'drizzle-orm';
import { db, type SqlRow } from '@/db';
import { calibrationCampaign, calibrationCapture } from '@/db/schema';
import type { CalibrationCaptureInput } from '@/lib/scan/calibration';

export interface CalibrationCampaignRow {
  id: string;
  targetCount: number;
  captureCount: number;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

export async function listCalibrationCampaigns(userId: string): Promise<CalibrationCampaignRow[]> {
  const result = await db.execute<SqlRow<CalibrationCampaignRow>>(sql`
    select c.id, c.target_count as "targetCount", count(x.id)::int as "captureCount",
           c.status, c.created_at::text as "createdAt", c.completed_at::text as "completedAt"
    from calibration_campaign c
    left join calibration_capture x on x.campaign_id = c.id
    where c.created_by = ${userId}
    group by c.id
    order by c.created_at desc
    limit 20
  `);
  return result.rows;
}

export async function createCalibrationCampaign(userId: string, targetCount: number) {
  const [campaign] = await db
    .insert(calibrationCampaign)
    .values({ createdBy: userId, targetCount })
    .returning({ id: calibrationCampaign.id });
  if (!campaign) throw new Error('Could not create calibration campaign');
  return campaign.id;
}

export async function addCalibrationCapture(input: {
  userId: string;
  campaignId: string;
  image: Buffer;
  metadata: CalibrationCaptureInput;
}) {
  if (input.image.byteLength !== input.metadata.imageSize) {
    throw new CalibrationInputError('Image size does not match metadata');
  }

  return db.transaction(async (tx) => {
    const locked = await tx.execute<{
      target_count: number;
      status: string;
    }>(sql`
      select target_count, status
      from calibration_campaign
      where id = ${input.campaignId} and created_by = ${input.userId}
      for update
    `);
    const campaign = locked.rows[0];
    if (!campaign) throw new CalibrationNotFoundError();

    const counted = await tx.execute<{ count: number }>(sql`
      select count(*)::int as count
      from calibration_capture
      where campaign_id = ${input.campaignId}
    `);
    const count = Number(counted.rows[0]?.count ?? 0);
    const target = Number(campaign.target_count);
    if (campaign.status !== 'active' || count >= target) throw new CalibrationClosedError();

    const sequence = count + 1;
    await tx.insert(calibrationCapture).values({
      campaignId: input.campaignId,
      sequence,
      image: input.image,
      imageMime: input.metadata.imageMime,
      imageWidth: input.metadata.imageWidth,
      imageHeight: input.metadata.imageHeight,
      imageSize: input.metadata.imageSize,
      fingerprint: input.metadata.fingerprint.toLowerCase(),
      metrics: input.metadata.metrics,
      candidates: input.metadata.candidates,
      device: input.metadata.device,
    });

    const complete = sequence >= target;
    if (complete) {
      await tx
        .update(calibrationCampaign)
        .set({ status: 'complete', completedAt: new Date() })
        .where(eq(calibrationCampaign.id, input.campaignId));
    }

    return { sequence, targetCount: target, complete };
  });
}

export async function deleteCalibrationCampaign(userId: string, campaignId: string) {
  const removed = await db
    .delete(calibrationCampaign)
    .where(and(
      eq(calibrationCampaign.id, campaignId),
      eq(calibrationCampaign.createdBy, userId),
    ))
    .returning({ id: calibrationCampaign.id });
  if (removed.length === 0) throw new CalibrationNotFoundError();
}

export async function exportCalibrationCampaign(userId: string, campaignId: string) {
  const [campaign] = await db
    .select()
    .from(calibrationCampaign)
    .where(and(
      eq(calibrationCampaign.id, campaignId),
      eq(calibrationCampaign.createdBy, userId),
    ))
    .limit(1);
  if (!campaign) throw new CalibrationNotFoundError();

  const captures = await db
    .select()
    .from(calibrationCapture)
    .where(eq(calibrationCapture.campaignId, campaignId))
    .orderBy(asc(calibrationCapture.sequence));

  return {
    campaign: {
      id: campaign.id,
      targetCount: campaign.targetCount,
      status: campaign.status,
      createdAt: campaign.createdAt,
      completedAt: campaign.completedAt,
    },
    captures: captures.map(({ image, ...capture }) => ({
      ...capture,
      imageBase64: image.toString('base64'),
    })),
  };
}

export class CalibrationNotFoundError extends Error {
  override name = 'NotFoundError';
  constructor() {
    super('Calibration campaign not found');
  }
}

export class CalibrationClosedError extends Error {
  override name = 'CalibrationClosedError';
  constructor() {
    super('Calibration campaign is complete');
  }
}

export class CalibrationInputError extends Error {
  override name = 'CalibrationInputError';
}
