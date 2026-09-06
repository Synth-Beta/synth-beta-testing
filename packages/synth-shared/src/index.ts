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
  createChatCrypto,
  isEncrypted,
  isMessageEncrypted,
  type ChatCrypto,
  type ChatCryptoDeps,
  type ChatKeyStorage,
  type EncryptedMessageRef,
} from './chatCrypto';
export {
  createChatCore,
  looksLikeOpaquePreview,
  normalizeChatSenderProfile,
  resolveSenderDisplayName,
  parseMessageMetadata,
  CHAT_SENDER_NAME_FALLBACK,
  DEFAULT_MESSAGE_LIMIT,
  type ChatCore,
  type ChatCoreDeps,
  type ChatMessageType,
  type ChatAuthorType,
  type ChatSenderProfile,
  type SharedChatMessage,
  type SharedUserChat,
  type FetchUserChatsOptions,
  quotePreview,
  __resetReplyColumnProbe,
  type QuotedMessage,
} from './chatCore';
export {
  joinChatPresence,
  formatTypingIndicator,
  TYPING_TIMEOUT_MS,
  TYPING_BROADCAST_INTERVAL_MS,
  type ChatPresenceHandle,
  type ChatPresenceOptions,
  type TypingUser,
} from './chatPresence';
export {
  createChatReactions,
  summarizeReactions,
  __resetReactionsTableProbe,
  DEFAULT_REACTION_EMOJIS,
  type ChatReactions,
  type MessageReactionRow,
  type ReactionSummary,
  type ReactionsByMessage,
} from './chatReactions';
export {
  CHAT_NOTIFICATION_TYPES,
  ENTITY_CHAT_TYPES,
  DEFAULT_CHAT_NOTIFICATION_SETTINGS,
  isChatNotificationType,
  isEntityChatType,
  wouldNotify,
  muteReason,
  type ChatNotificationType,
  type EntityChatType,
  type ChatNotificationSettings,
} from './chatNotificationPolicy';
export {
  isChatMuted,
  setChatMuted,
  fetchMutedChatIds,
} from './chatMute';
export {
  SCENE_ROOM_STORAGE_ENTITY_TYPE,
  SCENE_ROOM_IDS,
  SCENE_ROOMS,
  REQUIRED_SCENE_ROOM,
  OPTIONAL_SCENE_ROOM,
  ONBOARDING_MAX_ROOM_JOINS,
  OPTIONAL_SCENE_ROOM_2_ENABLED,
  ONBOARDING_PREFERENCE_IDS,
  ONBOARDING_PREFERENCE_OPTIONS,
  isDcCity,
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
  type BucketListFeedOptions,
  type RankedBucketArtist,
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
