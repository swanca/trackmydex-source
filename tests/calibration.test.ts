import { describe, expect, it } from 'vitest';
import {
  calibrationCaptureSchema,
  calibrationCampaignSchema,
  MAX_CALIBRATION_IMAGE_BYTES,
} from '@/lib/scan/calibration';

describe('scanner calibration input', () => {
  it('accepts a bounded campaign size', () => {
    expect(calibrationCampaignSchema.parse({ targetCount: 100 })).toEqual({ targetCount: 100 });
    expect(() => calibrationCampaignSchema.parse({ targetCount: 0 })).toThrow();
    expect(() => calibrationCampaignSchema.parse({ targetCount: 501 })).toThrow();
  });

  it('keeps only useful capture metadata and no network identity', () => {
    const parsed = calibrationCaptureSchema.parse({
      fingerprint: '0123456789abcdef0123456789abcdef',
      imageMime: 'image/jpeg',
      imageWidth: 720,
      imageHeight: 1008,
      imageSize: 123_456,
      metrics: {
        edgeScore: 8.2,
        darkRatio: 0.03,
        brightRatio: 0.01,
        fill: 0.62,
        stability: true,
        captureMs: 742,
      },
      candidates: [{ cardId: 'swsh11-130', distance: 9, confident: true }],
      device: {
        userAgent: 'Mobile Safari',
        viewportWidth: 393,
        viewportHeight: 852,
        cameraWidth: 1920,
        cameraHeight: 1080,
      },
      ip: 'must-not-be-stored',
    });

    expect(parsed).not.toHaveProperty('ip');
    expect(parsed.candidates).toHaveLength(1);
  });

  it('rejects oversized images and unbounded candidate payloads', () => {
    const base = {
      fingerprint: '0123456789abcdef0123456789abcdef',
      imageMime: 'image/jpeg' as const,
      imageWidth: 720,
      imageHeight: 1008,
      metrics: {
        edgeScore: 8,
        darkRatio: 0.1,
        brightRatio: 0.1,
        fill: 0.5,
        stability: true,
        captureMs: 500,
      },
      candidates: [],
      device: {
        userAgent: 'test',
        viewportWidth: 390,
        viewportHeight: 844,
        cameraWidth: 1920,
        cameraHeight: 1080,
      },
    };

    expect(() => calibrationCaptureSchema.parse({
      ...base,
      imageSize: MAX_CALIBRATION_IMAGE_BYTES + 1,
    })).toThrow();
    expect(() => calibrationCaptureSchema.parse({
      ...base,
      imageSize: 100,
      candidates: Array.from({ length: 13 }, (_, index) => ({
        cardId: `card-${index}`,
        distance: index,
        confident: false,
      })),
    })).toThrow();
  });
});
