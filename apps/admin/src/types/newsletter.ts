export interface NewsletterLink {
  label: string;
  url: string;
}

export interface NewsletterStoryCard {
  id: string;
  label: string;
  title: string;
  body: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

export type NewsletterTokenName =
  | "firstName"
  | "city"
  | "upcomingShowCount"
  | "recentConcertCount"
  | "lifetimeConcertCount"
  | "lifetimeReviewCount"
  | "topArtist"
  | "topGenre"
  | "nextShowArtist"
  | "nextShowVenue"
  | "followedArtist"
  | "followedVenue";

export type NewsletterPersonalizationDataField =
  | "user.firstName"
  | "user.city"
  | "synthActivity.upcomingShows"
  | "synthActivity.recentlyInterestedEvents"
  | "synthActivity.recentlyAttendedConcerts"
  | "synthActivity.recentReviews"
  | "synthActivity.recentPhotos"
  | "synthActivity.newConnections"
  | "musicConnections.spotifyConnected"
  | "musicConnections.spotifyDataAvailable"
  | "musicConnections.appleMusicConnected"
  | "musicConnections.appleMusicDataAvailable"
  | "musicConnections.topArtists"
  | "musicConnections.followedArtists"
  | "musicConnections.followedVenues"
  | "recommendations.nearbyShows";

export interface NewsletterListItem {
  id: string;
  title: string;
  body: string;
}

export interface NewsletterSectionFallbackContent {
  label?: string;
  eyebrowText?: string;
  headline?: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  listItems?: NewsletterListItem[];
  cards?: NewsletterStoryCard[];
}

export type NewsletterCtaStyle = "button" | "link";

export type NewsletterPersonalizationConfidence = "high" | "medium" | "low";

export type NewsletterSectionSourceLabel =
  | "Personalized"
  | "Streaming-based"
  | "Location-based"
  | "Admin-selected"
  | "Evergreen fallback";

export interface NewsletterSectionPersonalization {
  requiredDataFields?: NewsletterPersonalizationDataField[];
  displayIfStates?: string[];
  requiresLocation?: boolean;
  fallbackSectionId?: string;
  fallbackContent?: NewsletterSectionFallbackContent;
  sourceLabel?: NewsletterSectionSourceLabel;
  minimumConfidence?: NewsletterPersonalizationConfidence;
}

export type NewsletterSectionType =
  | "hero"
  | "intro"
  | "yourSynth"
  | "concertHistory"
  | "yourMusic"
  | "aroundYou"
  | "communitySpotlight"
  | "featuredStory"
  | "quickStories"
  | "featuredEvent"
  | "featuredArtist"
  | "featuredVenue"
  | "discoverTip"
  | "productUpdate"
  | "cta"
  | "footer";

export type NewsletterBackgroundStyle =
  | "default"
  | "pink"
  | "blue"
  | "purple"
  | "green"
  | "yellow"
  | "dark";

export interface NewsletterSection {
  id: string;
  type: NewsletterSectionType;
  hidden?: boolean;
  label?: string;
  eyebrowText?: string;
  headline?: string;
  body?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Primary actions use pill buttons; editorial links may stay text. */
  ctaStyle?: NewsletterCtaStyle;
  backgroundStyle?: NewsletterBackgroundStyle;
  cards?: NewsletterStoryCard[];
  listItems?: NewsletterListItem[];
  /** Required when communitySpotlight claims a real member story. */
  contentSourceUrl?: string;
  personalization?: NewsletterSectionPersonalization;
}

export interface NewsletterIssue {
  id: string;
  slug: string;
  title: string;
  issueNumber: string;
  publishDate: string;
  subjectLine: string;
  preheader: string;
  description: string;
  coverImage: string;
  status?: "draft" | "published" | "archived";
  createdAt?: string;
  lastEditedAt?: string;
  archivedAt?: string | null;
  isPublicSample: boolean;
  sections: NewsletterSection[];
}
