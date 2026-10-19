export type Availability =
  | "available"
  | "sold_out"
  | "unverified";

export interface EditionEvent {
  id: string;
  artistName: string;
  venueName: string;
  city: string;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  eventDate: string;
  doorsTime?: string | null;
  ticketAvailable?: boolean | null;
  ticketUrl?: string | null;
  genres?: string[];
}

export interface EditionNews {
  id: string;
  title: string;
  url: string;
  source?: string | null;
  publishedAt: string;
  /** First sentence from the feed, when the source included one. */
  summary?: string | null;
}

export interface EditionReview {
  artistName: string;
  venueName?: string | null;
  eventDate?: string | null;
  rating?: number | null;
  text?: string | null;
}

export interface EditionListen {
  artistName: string;
  /** A real recording title. Generic artist recommendations are not listens. */
  trackName?: string | null;
  url?: string | null;
  reason?: string | null;
  /** A sourced live recording that is not this week's news. */
  evergreen?: boolean;
  sourceUrl?: string | null;
  genres?: string[];
}

export interface EditionReader {
  userId: string;
  email: string;
  firstName?: string | null;
  city?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  reviews: EditionReview[];
  lifetimeShowCount: number;
  fiveStarCount: number;
  topArtists: string[];
  genres: string[];
  /** Artists this reader follows on Synth. */
  followedArtists?: string[];
  /** Venues this reader follows on Synth. */
  followedVenues?: string[];
  /** Other public 5-star reviews of an artist this reader rated highly, excluding the reader. */
  otherFiveStarArtists: string[];
  interestedEventIds?: string[];
  goingEventIds?: string[];
}

export interface EditionQualityReport {
  sections: string[];
  sourceCounts: {
    reviews: number;
    fiveStarReviews: number;
    streamingArtists: number;
    candidateEvents: number;
    newsStories: number;
    personalListens: number;
  };
  personalizationEvidence: string[];
  missingData: string[];
  warnings: string[];
  featuredArtists: string[];
}

export interface EditionSource {
  kind: "event" | "news" | "listen" | "account" | "editorial" | "quality";
  url: string;
  retrievedAt: string;
  label: string;
  report?: EditionQualityReport;
}

export interface ShowCard {
  eyebrow: string;
  title: string;
  body: string;
  availabilityNote?: string;
  ctaLabel: string;
  ctaUrl: string;
  caution: boolean;
}

export interface StoryCard {
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  tone: "white" | "pink" | "yellow";
  links?: Array<{ label: string; url: string }>;
}

export interface ComposedEdition {
  subject: string;
  preheader: string;
  issueLabel: string;
  headline: string;
  intro: string;
  yourSynth?: { headline: string; body: string };
  showsHeading?: string;
  showsDek?: string;
  /** Shown when the dates are general hub picks, not the reader's city. */
  locationPrompt?: { label: string; url: string };
  shows: ShowCard[];
  updates: StoryCard[];
  features?: StoryCard[];
  listen?: StoryCard;
  history?: StoryCard;
  connect?: StoryCard;
  sources: EditionSource[];
  editorialFlags?: string[];
  qualityReport: EditionQualityReport;
}
