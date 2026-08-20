export type NewsletterPreviewPreset =
  | "active-user"
  | "inactive-with-history"
  | "spotify-connected-user"
  | "apple-connected-user"
  | "interest-signal-user"
  | "brand-new-user"
  | "missing-location-user";

export type NewsletterDerivedState =
  | "active-user"
  | "inactive-with-history"
  | "connected-music-user"
  | "interest-signal-user"
  | "new-or-empty-user"
  | "missing-location-user";

export interface NewsletterEventSummary {
  id: string;
  title: string;
  artistName: string;
  venueName: string;
  eventDate: string;
  city?: string | null;
  state?: string | null;
}

export interface NewsletterReviewSummary {
  id: string;
  rating?: number;
  reviewText?: string | null;
  eventTitle?: string | null;
  eventDate?: string | null;
  createdAt: string;
}

export interface NewsletterPhotoSummary {
  reviewId: string;
  photoUrl: string;
  createdAt: string;
}

export interface NewsletterConnectionSummary {
  userId: string;
  name: string;
  createdAt: string;
}

export interface NewsletterArtistSummary {
  name: string;
  score?: number;
}

export interface NewsletterVenueSummary {
  name: string;
  city?: string | null;
  state?: string | null;
}

export interface NewsletterPersonalizationContext {
  source: "mock" | "real";
  isAdminMockData: boolean;
  containsRealUserData: boolean;
  user: {
    id: string;
    firstName?: string;
    email?: string;
    city?: string;
    location?: string;
  };
  synthActivity: {
    upcomingShows: NewsletterEventSummary[];
    recentlyInterestedEvents: NewsletterEventSummary[];
    recentlyAttendedConcerts: NewsletterEventSummary[];
    recentReviews: NewsletterReviewSummary[];
    recentPhotos: NewsletterPhotoSummary[];
    newConnections: NewsletterConnectionSummary[];
    lifetimeConcertCount: number;
    lifetimeReviewCount: number;
    unreviewedConcerts: NewsletterEventSummary[];
    hasActivityInLast7Days: boolean;
  };
  musicConnections: {
    /** Account/OAuth/profile indicates Spotify is linked. Independent of listening stats. */
    spotifyConnected: boolean;
    /** Derived listening insights (top artists/genres/stats) are available for Spotify. */
    spotifyDataAvailable: boolean;
    /** Account/profile indicates Apple Music is linked. Independent of listening stats. */
    appleMusicConnected: boolean;
    /** Derived listening insights are available for Apple Music. */
    appleMusicDataAvailable: boolean;
    recentArtists: NewsletterArtistSummary[];
    topArtists: NewsletterArtistSummary[];
    genres: string[];
    artistsWithNearbyShows: NewsletterArtistSummary[];
    followedArtists: NewsletterArtistSummary[];
    followedVenues: NewsletterVenueSummary[];
  };
  recommendations: {
    nearbyShows: NewsletterEventSummary[];
    relevantArtists: NewsletterArtistSummary[];
    relevantVenues: NewsletterVenueSummary[];
  };
}

export interface NewsletterModuleExplanation {
  sectionId: string;
  sectionType: string;
  rendered: boolean;
  reason: string;
  sourceLabel: string;
  confidence: "high" | "medium" | "low";
  fallbackUsed: boolean;
}

export interface NewsletterResolvedSectionPreview {
  sectionId: string;
  rendered: boolean;
  reason: string;
}

