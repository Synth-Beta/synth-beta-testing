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
  SCENE_ROOM_STORAGE_ENTITY_TYPE,
  SCENE_ROOM_IDS,
  SCENE_ROOM_LEGACY_ALIASES,
  SCENE_ROOMS,
  REQUIRED_SCENE_ROOM,
  OPTIONAL_SCENE_ROOM,
  ONBOARDING_MAX_ROOM_JOINS,
  OPTIONAL_SCENE_ROOM_2_ENABLED,
  ONBOARDING_PREFERENCE_IDS,
  ONBOARDING_PREFERENCE_OPTIONS,
  isDcCity,
  canonicalizeSceneRoomId,
  isReservedSceneRoomId,
  buildOnboardingJoinPlan,
  pickFeaturedShowForPreference,
  type SceneRoomId,
  type SceneRoomDefinition,
  type OnboardingPreferenceId,
  type OnboardingJoinPlan,
  type FeaturedShowCandidate,
} from './sceneRooms';
export {
  applyOnboardingRoomJoins,
  type ApplyOnboardingRoomJoinsInput,
  type ApplyOnboardingRoomJoinsResult,
} from './onboardingRoomJoin';
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
export {
  getUpcomingEventsForGenreChat,
  getUpcomingEventsForGenreUmbrella,
  type NearbyParams,
  type GenreChatEventRow,
} from './genreEvents';
export { GENRE_CHAT_TAG_MAP } from './genreChatTagMap';
export { needsContactEmail } from './contactEmailGate';
export {
  resolveLocation,
  type Coordinates,
  type ResolvedLocation,
  type LocationResolutionInputs,
} from './locationResolution';
export {
  groupTravelPinsByLocation,
  type TravelPinLocation,
  type TravelLocationGroup,
} from './travelMapGrouping';

export {
  FEATURED_METRO_DC,
  FEATURED_MIN,
  FEATURED_MAX,
  FEATURED_TARGET,
  featuredShowChatKey,
  dcWeekStartDate,
  dcWeekId,
  validateFeaturedPins,
  type FeaturedMetro,
  type FeaturedSetStatus,
  type FeaturedPinInput,
  type FeaturedSetValidation,
} from './weeklyFeatured';
export {
  WARMTH_CONTRACT_VERSION,
  WARMTH_MEMBER_THRESHOLD,
  WARMTH_HUMAN_MSG_24H_THRESHOLD,
  DEFAULT_DEMO_SEED_LIVE_KEYS,
  computeWarmthSnapshot,
  fetchChatWarmthSnapshot,
  fetchHomeWarmChats,
  publishDemoSeedLiveSet,
  ensureDensityDemoChats,
  setChatSeedLive,
  setUserSeedProxy,
  syncFeaturedShowChatsForWeek,
  archiveFeaturedShowChatsPastDoors,
  fetchDemoWarmthRoomDirectory,
  type ChatWarmthKind,
  type WarmthFailReason,
  type ChatWarmthGate,
  type ChatWarmthSnapshot,
  type HomeWarmChatsResponse,
  type DemoSeedLiveSetResult,
  type WarmthEvalInput,
} from './chatWarmth';
