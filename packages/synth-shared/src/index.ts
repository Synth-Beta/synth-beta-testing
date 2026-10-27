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
  STREAMING_PROVIDER_LABELS,
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
export {
  buildAppleMusicProfile,
  type AppleMusicProfileArtist,
  type AppleMusicProfileTrack,
} from './appleMusicProfile';
export { expoPathForShareTarget } from './expoEntityRoutes';
export {
  resolveNotificationExpoPath,
  type NotificationNavResult,
  type NotificationNavContext,
} from './notificationNavigation';
export {
  COMMENT_MENTION_TOKEN_RE,
  buildCommentMentionToken,
  buildReplyMentionPrefill,
  extractMentionedUserIds,
  materializeReplyMention,
  parseCommentMentionSegments,
  commentTextToPlain,
  type CommentMentionSegment,
} from './commentMentions';
export {
  buildCommentThreads,
  resolveThreadRootId,
  visibleReplyCountForFocus,
  nextVisibleReplyCount,
  DEFAULT_VISIBLE_REPLIES,
  SEE_MORE_REPLY_BATCH,
  type ThreadableComment,
  type CommentThread,
} from './commentThreads';
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
  weaveBucketListIntoFeed,
  BUCKET_LIST_SPACING,
  BUCKET_LIST_TOP_LIMIT,
} from './bucketListFeed';
export {
  type RatingHighlight,
  type ReviewHighlights,
  type HighlightReviewRow,
  summarizeReviewHighlights,
  fetchReviewHighlights,
  EMPTY_REVIEW_HIGHLIGHTS,
  QUOTE_MIN_RATING,
} from './reviewHighlights';
export {
  type WovenEntry,
  type NaturalWeaveOptions,
  weaveNaturally,
  planNaturalWeave,
  seededRandom,
  dailySeed,
} from './naturalWeave';
export { type ReviewMatch, reviewEventMatch, reviewQuoteFor } from './reviewMatch';
export {
  weaveJustAnnouncedIntoFeed,
  JUST_ANNOUNCED_LABEL,
  JUST_ANNOUNCED_PIN_LIMIT,
  JUST_ANNOUNCED_SPACING,
  logJustAnnounced,
} from './justAnnouncedFeed';
export {
  type ArtistAffinity,
  getUserArtistAffinity,
  boostEventsByArtistAffinity,
  __resetArtistAffinityCache,
} from './artistAffinity';
export {
  getUpcomingEventsForGenreChat,
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
  searchArtistsFuzzy,
  searchVenuesFuzzy,
  searchUsersFuzzy,
  searchEventsFuzzy,
  searchPastEventsForReview,
  scoreNameMatch,
  forgivingIlikePatterns,
  type FuzzyArtistRow,
  type FuzzyVenueRow,
  type FuzzyUserRow,
  type FuzzyEventRow,
  type ReviewEventSearchRow,
} from './forgivingNameSearch';
export {
  PICK5_ORIGIN,
  PICK5_BANDS,
  pick5BandUrl,
  findPick5Band,
  type Pick5Band,
} from './pick5';
export { type ProfileSaveError, describeProfileSaveError } from './profileSaveError';
export { type OnboardingProfileInput, type OnboardingField, ONBOARDING_MIN_AGE, ONBOARDING_BIO_MAX, validateOnboardingProfile, pickPreselected, normalizeBirthday, isPlaceholderName } from './onboardingRules';
export { isEmptySpotifySync, streamingRowHasData, SPOTIFY_EMPTY_SYNC_MESSAGE } from './spotifySyncGuard';
export { checkReviewVideo, REVIEW_VIDEO_MAX_SECONDS, REVIEW_VIDEO_MAX_MB } from './reviewVideo';
export { isEmailNotConfirmedError, EMAIL_CONFIRM_RESEND_COOLDOWN_SEC, EMAIL_CONFIRM_POLL_MS, EMAIL_CONFIRM_POLL_MAX_MS } from './emailConfirm';
export {
  type MusicImportSource,
  type MusicImportArtist,
  type MusicImportTrack,
  type SpotifyExportSummary,
  type MusicImportResult,
  type MusicImportRequest,
  SPOTIFY_EXPORT_URL,
  SPOTIFY_EXPORT_STEPS,
  LASTFM_SPOTIFY_TIP,
  isSpotifyHistoryFile,
  readSpotifyExportFiles,
  summarizeSpotifyExport,
  postMusicImport,
} from './musicImports';
