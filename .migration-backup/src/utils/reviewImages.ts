import { storageService } from '@/services/storageService';

export function getPreferredReviewThumbnailUrls(data: any): {
  derivedUrl: string | null;
  fallbackUrl: string | null;
} {
  const reviewId = typeof data?.id === 'string' ? (data.id as string) : null;
  const photos = Array.isArray(data?.photos) ? (data.photos as any[]) : null;
  const fallbackUrl = photos && typeof photos[0] === 'string' ? (photos[0] as string) : null;

  const versionKey =
    (typeof data?.updated_at === 'string' && data.updated_at) ||
    (typeof data?.created_at === 'string' && data.created_at) ||
    null;
  const derivedUrl = reviewId ? storageService.getReviewThumbnailPublicUrl(reviewId, versionKey ?? Date.now()) : null;

  return { derivedUrl, fallbackUrl };
}

