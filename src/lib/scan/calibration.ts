import { z } from 'zod';

export const MAX_CALIBRATION_IMAGE_BYTES = 750_000;
export const MAX_CALIBRATION_CAPTURES = 500;

export const calibrationCampaignSchema = z.object({
  targetCount: z.coerce.number().int().min(1).max(MAX_CALIBRATION_CAPTURES),
});

const finite = z.number().finite();

export const calibrationCaptureSchema = z.object({
  fingerprint: z.string().regex(/^[0-9a-f]{32}$/i),
  imageMime: z.enum(['image/jpeg', 'image/webp']),
  imageWidth: z.number().int().min(100).max(4_096),
  imageHeight: z.number().int().min(100).max(4_096),
  imageSize: z.number().int().min(1).max(MAX_CALIBRATION_IMAGE_BYTES),
  metrics: z.object({
    edgeScore: finite.min(0).max(255),
    darkRatio: finite.min(0).max(1),
    brightRatio: finite.min(0).max(1),
    fill: finite.min(0).max(1),
    stability: z.boolean(),
    captureMs: finite.int().min(0).max(120_000),
  }),
  candidates: z.array(z.object({
    cardId: z.string().min(1).max(160),
    name: z.string().max(200).optional(),
    localId: z.string().max(32).optional(),
    setId: z.string().max(64).optional(),
    setName: z.string().max(200).optional(),
    distance: z.number().int().min(0).max(128),
    confident: z.boolean(),
  })).max(12),
  device: z.object({
    userAgent: z.string().max(500),
    viewportWidth: z.number().int().min(1).max(10_000),
    viewportHeight: z.number().int().min(1).max(10_000),
    cameraWidth: z.number().int().min(1).max(10_000),
    cameraHeight: z.number().int().min(1).max(10_000),
  }),
});

export type CalibrationCaptureInput = z.infer<typeof calibrationCaptureSchema>;
