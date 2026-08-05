export {
  parseShareUrl,
  buildShareLandingUrl,
  buildWebAppUrlFromShare,
  buildWebAppUrlFromShareCanonical,
  PENDING_SHARE_STORAGE_KEY,
  type ShareContentType,
  type PendingShareLink,
} from './shareUrl';
export { getAuthRedirectOrigin } from './siteOrigin';
export type { SynthSupabaseClient } from './supabaseClientType';
export {
  FRIEND_ACCEPTED_RETENTION_MS,
  FRIENDS_HUB_NOTIFICATION_TYPES,
  type FriendsHubNotificationType,
  isFriendsHubNotificationType,
  requestIdFromFriendRequestData,
  friendIdFromFriendAcceptedData,
  deleteExpiredFriendAcceptedNotifications,
  deleteFriendRequestNotificationsByRequestId,
  pruneStaleFriendRequestNotifications,
  acceptFriendRequest,
  declineFriendRequest,
  type MinimalFriendRequestNotification,
} from './friendNotifications';
export {
  type SharedFriendSuggestion,
  getRecommendedFriendsFallback,
  getSimilarUsersToFriend,
  rankFriendSuggestionsForRail,
  createFriendRequest,
  type CreateFriendRequestOutcome,
} from './friendSuggestions';
export {
  type PassportUnlockEntry,
  type PassportUnlockProgress,
  fetchPassportUnlockProgress,
} from './passportProgress';
export { type ProfileStatsSummary, fetchProfileStatsSummary } from './profileStatsCore';
export {
  type ProfileReviewTimelineItem,
  fetchProfileReviewTimeline,
} from './reviewTimelineCore';
export {
  type UserStreamingStatsSnapshot,
  fetchUserStreamingStatsSnapshot,
} from './streamingStatsCore';
export {
  type StreamingProvider,
  type StreamingLinkStatus,
  getStreamingLinkStatus,
} from './streamingLinkStatus';
export {
  type SpotifyTimeRange,
  type TopGenreEntry,
  hasPerRangeData,
  hasNonEmptyPerRangeData,
  countPerRangeItems,
  streamingProfileNeedsTrackResync,
  getSpotifyTimeRangeList,
  computeTopGenresFromArtists,
  computeTopGenresFromArtistList,
  computeTopGenresForTimeRange,
  pickTopGenresSnapshot,
  enrichProfileDataWithGenres,
  formatTopGenresForDisplay,
  SPOTIFY_TIME_RANGE_LABELS,
} from './streamingProfileData';
export { expoPathForShareTarget } from './expoEntityRoutes';
export {
  resolveNotificationExpoPath,
  type NotificationNavResult,
  type NotificationNavContext,
} from './notificationNavigation';
export { getOrCreateDirectChat } from './directChat';
export { getOrCreateGenreChat } from './genreChat';
export {
  type InAppBrowserHost,
  isIOS,
  isAndroid,
  detectInAppBrowser,
  escapeInAppBrowser,
} from './inAppBrowserEscape';

/** AsyncStorage / SecureStore key for mobile review wizard drafts (parity with web local draft concept). */
export function mobileReviewDraftStorageKey(userId: string): string {
  return `synth.reviewDraft.v1.${userId}`;
}

export {
  ACQUISITION_SOURCE_CANONICAL_ORDER,
  type AcquisitionSource,
} from './acquisitionSources';
export {
  type BucketListFeedEvent,
  getEventsFromRankedArtists,
} from './bucketListFeed';
