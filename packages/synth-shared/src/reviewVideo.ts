/**
 * One video per review, short and small, so review videos don't eat storage.
 * The review-videos bucket enforces the size limit server-side too.
 */
export const REVIEW_VIDEO_MAX_SECONDS = 30;
export const REVIEW_VIDEO_MAX_MB = 25;

/** Error message to show, or null when the clip is fine. Unknown values pass. */
export function checkReviewVideo(v: { durationSec?: number | null; sizeBytes?: number | null }): string | null {
  // Players report 30.2s for a 30s clip; don't reject on rounding.
  if (v.durationSec != null && v.durationSec > REVIEW_VIDEO_MAX_SECONDS + 0.5) {
    return `Videos can be up to ${REVIEW_VIDEO_MAX_SECONDS} seconds. Trim it and try again.`;
  }
  if (v.sizeBytes != null && v.sizeBytes > REVIEW_VIDEO_MAX_MB * 1024 * 1024) {
    return `That video is over ${REVIEW_VIDEO_MAX_MB}MB. Try a shorter clip.`;
  }
  return null;
}
