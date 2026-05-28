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
export { expoPathForShareTarget } from './expoEntityRoutes';
export {
  resolveNotificationExpoPath,
  type NotificationNavResult,
  type NotificationNavContext,
} from './notificationNavigation';
export { getOrCreateDirectChat } from './directChat';

/** AsyncStorage / SecureStore key for mobile review wizard drafts (parity with web local draft concept). */
export function mobileReviewDraftStorageKey(userId: string): string {
  return `synth.reviewDraft.v1.${userId}`;
}
