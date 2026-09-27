import sharp from 'sharp';
import { inspectCardPixels, type CardSide } from './card-inspection';

/** Decode one confirmed crop at a time. No disk writes, EXIF forwarding or remote calls. */
export async function inspectPhoto(bytes: Uint8Array, side: CardSide) {
  const input = sharp(bytes, { failOn: 'error', limitInputPixels: 12_000_000 }).rotate();
  const metadata = await input.metadata();
  if ((metadata.pages ?? 1) !== 1) throw new Error('Animated images are unsupported');
  const rotated = (metadata.orientation ?? 1) >= 5;
  const width = (rotated ? metadata.height : metadata.width) ?? 0;
  const height = (rotated ? metadata.width : metadata.height) ?? 0;
  if (width < 630 || height < 880 || width / height < .68 || width / height > .75) {
    throw new Error('Use a confirmed upright card crop of at least 630 × 880 pixels');
  }
  const { data, info } = await input.resize({ width: 1008, height: 1408, fit: 'inside', withoutEnlargement: true })
    .removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  return { ...inspectCardPixels({ rgb: new Uint8Array(data), width: info.width, height: info.height, side }),
    image: { width: info.width, height: info.height } };
}
