import type { ReviewThumbnailCrop } from '@/hooks/useReviewForm';

export const REVIEW_THUMBNAIL_ASPECT_RATIO = 353 / 250;
// Slightly > 1 so users can pan immediately (profile-like),
// while still guaranteeing "cover" (no blank space).
export const DEFAULT_THUMBNAIL_SCALE = 1.08;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function createDefaultThumbnailCrop(
  aspectRatio: number = REVIEW_THUMBNAIL_ASPECT_RATIO
): ReviewThumbnailCrop {
  return {
    scale: DEFAULT_THUMBNAIL_SCALE,
    offsetX: 0.5,
    offsetY: 0.5,
    aspectRatio,
  };
}

/**
 * Default "center-crop cover" framing used when the user never cropped.
 * (No extra zoom beyond cover.)
 */
export function createDefaultCoverThumbnailCrop(
  aspectRatio: number = REVIEW_THUMBNAIL_ASPECT_RATIO
): ReviewThumbnailCrop {
  return {
    scale: 1,
    offsetX: 0.5,
    offsetY: 0.5,
    aspectRatio,
  };
}

export function clampThumbnailCrop(
  crop: ReviewThumbnailCrop,
  options: { minScale?: number; maxScale?: number } = {}
): ReviewThumbnailCrop {
  const minScale = typeof options.minScale === 'number' ? options.minScale : 1;
  const maxScale = typeof options.maxScale === 'number' ? options.maxScale : 4;
  const nextScale =
    typeof crop.scale === 'number' && Number.isFinite(crop.scale) ? clamp(crop.scale, minScale, maxScale) : 1;
  const nextOffsetX =
    typeof crop.offsetX === 'number' && Number.isFinite(crop.offsetX) ? clamp(crop.offsetX, 0, 1) : 0.5;
  const nextOffsetY =
    typeof crop.offsetY === 'number' && Number.isFinite(crop.offsetY) ? clamp(crop.offsetY, 0, 1) : 0.5;
  const nextAspect =
    typeof crop.aspectRatio === 'number' && Number.isFinite(crop.aspectRatio) && crop.aspectRatio > 0
      ? crop.aspectRatio
      : REVIEW_THUMBNAIL_ASPECT_RATIO;

  return {
    scale: nextScale,
    offsetX: nextOffsetX,
    offsetY: nextOffsetY,
    aspectRatio: nextAspect,
  };
}

export function computeCoverScale(params: {
  containerWidth: number;
  containerHeight: number;
  imageWidth: number;
  imageHeight: number;
}) {
  const { containerWidth, containerHeight, imageWidth, imageHeight } = params;
  if (containerWidth <= 0 || containerHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) return 1;
  return Math.max(containerWidth / imageWidth, containerHeight / imageHeight);
}

export function computeMaxOffsetsPx(params: {
  containerWidth: number;
  containerHeight: number;
  baseWidth: number;
  baseHeight: number;
  scale: number;
}) {
  const { containerWidth, containerHeight, baseWidth, baseHeight, scale } = params;
  const displayedWidth = baseWidth * scale;
  const displayedHeight = baseHeight * scale;
  const maxX = Math.max(0, (displayedWidth - containerWidth) / 2);
  const maxY = Math.max(0, (displayedHeight - containerHeight) / 2);
  return { maxX, maxY };
}

export function offsetsNormToPx(params: { offsetNorm: number; maxPx: number }) {
  const { offsetNorm, maxPx } = params;
  if (!(maxPx > 0)) return 0;
  // offsetNorm is 0..1, where 0.5 is centered.
  return (offsetNorm - 0.5) * 2 * maxPx;
}

export function offsetsPxToNorm(params: { offsetPx: number; maxPx: number }) {
  const { offsetPx, maxPx } = params;
  if (!(maxPx > 0)) return 0.5;
  const raw = offsetPx / (2 * maxPx) + 0.5;
  return clamp(raw, 0, 1);
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('Failed to load image')));
    image.src = url;
  });
}

async function createImageFromFetch(url: string): Promise<{ image: HTMLImageElement; objectUrl: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await createImage(objectUrl);
    return { image, objectUrl };
  } catch (e) {
    URL.revokeObjectURL(objectUrl);
    throw e;
  }
}

export async function generateThumbnailBlob(params: {
  imageUrl: string;
  crop: ReviewThumbnailCrop;
  outputWidth: number;
  outputHeight: number;
  mimeType?: string;
  quality?: number;
}): Promise<Blob> {
  const { imageUrl, crop } = params;
  const outputWidth = Math.round(params.outputWidth);
  const outputHeight = Math.round(params.outputHeight);
  const mimeType = params.mimeType ?? 'image/jpeg';
  const quality = params.quality ?? 0.85;

  const { image, objectUrl } = await createImageFromFetch(imageUrl);
  try {
    const imgW = image.naturalWidth || image.width;
    const imgH = image.naturalHeight || image.height;

    const safeCrop = clampThumbnailCrop(crop);

    const coverScale = computeCoverScale({
      containerWidth: outputWidth,
      containerHeight: outputHeight,
      imageWidth: imgW,
      imageHeight: imgH,
    });

    const baseW = imgW * coverScale;
    const baseH = imgH * coverScale;

    const { maxX, maxY } = computeMaxOffsetsPx({
      containerWidth: outputWidth,
      containerHeight: outputHeight,
      baseWidth: baseW,
      baseHeight: baseH,
      scale: safeCrop.scale,
    });

    const offsetPxX = offsetsNormToPx({ offsetNorm: safeCrop.offsetX, maxPx: maxX });
    const offsetPxY = offsetsNormToPx({ offsetNorm: safeCrop.offsetY, maxPx: maxY });

    // Invert the screen transform to get source rectangle in original image coordinates.
    const totalScale = coverScale * safeCrop.scale;
    const srcW = outputWidth / totalScale;
    const srcH = outputHeight / totalScale;
    const srcX = (0 - outputWidth / 2 - offsetPxX) / totalScale + imgW / 2;
    const srcY = (0 - outputHeight / 2 - offsetPxY) / totalScale + imgH / 2;

    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create canvas context');

    ctx.drawImage(image, srcX, srcY, srcW, srcH, 0, 0, outputWidth, outputHeight);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error('Failed to generate thumbnail'));
        },
        mimeType,
        quality
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

