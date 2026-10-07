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
  /** Only set when the track name comes from stored listening data. */
  trackName?: string | null;
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
  /** Other public 5-star reviews of an artist this reader rated highly, excluding the reader. */
  otherFiveStarArtists: string[];
}

export interface EditionSource {
  kind: "event" | "news" | "listen" | "account";
  url: string;
  retrievedAt: string;
  label: string;
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
  shows: ShowCard[];
  updates: StoryCard[];
  listen?: StoryCard;
  connect?: StoryCard;
  sources: EditionSource[];
}
