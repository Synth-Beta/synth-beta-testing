import { buildShareLandingUrl } from '@synth/shared';

/** App Store link for Synth. Append ?referral=<code> when available for attribution. */
export const SYNTH_APP_STORE_URL = 'https://apps.apple.com/us/app/synth-for-live-music-lovers/id6757408095';

/** Message when sharing from the review flow (who you went with). */
export const SHARE_APP_MESSAGE_EVENT_TOGETHER =
  "We went to an event together! I'm sharing it on Synth — check it out:";

/** Default message for general app share (e.g. banner). */
export const SHARE_APP_MESSAGE_DEFAULT =
  "I've been using Synth to discover shows and share live music moments. Thought you'd like it — ";

// ─── Native share payload types ─────────────────────────────────────────────

/** Data sent to the native iOS share handler for an event. */
export interface NativeEventSharePayload {
  eventId:        string;
  title:          string;
  artistName?:    string;
  venueName?:     string;
  venueCity?:     string;
  eventDate?:     string;
  imageUrl?:      string;
  posterImageUrl?: string;
  shareType:      'event';
  reviewId?:      undefined;
  reviewerName?:  undefined;
  overallRating?: undefined;
  reviewQuote?:   undefined;
}

/** Data sent to the native iOS share handler for a review (superset of event). */
export interface NativeReviewSharePayload {
  eventId:        string;
  title:          string;
  artistName?:    string;
  venueName?:     string;
  venueCity?:     string;
  eventDate?:     string;
  imageUrl?:      string;
  posterImageUrl?: string;
  shareType:      'review';
  reviewId:       string;
  reviewerName?:  string;
  overallRating?: number;   // 0–5
  reviewQuote?:   string;
}

export type NativeSharePayload = NativeEventSharePayload | NativeReviewSharePayload;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true when running inside the Synth iOS native shell. */
function isNativeIOS(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as any).webkit?.messageHandlers?.eventShare
  );
}

/** Fires the native iOS share sheet with a rendered card. */
function fireNativeShare(payload: NativeSharePayload): void {
  (window as any).webkit.messageHandlers.eventShare.postMessage(payload);
}

// ─── Share Service ────────────────────────────────────────────────────────────

export class ShareService {
  private static getBaseUrl(): string {
    const envBase =
      (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim() ||
      (import.meta.env.VITE_SITE_URL as string | undefined)?.trim() ||
      (import.meta.env.VITE_WEB_BASE_URL as string | undefined)?.trim() ||
      '';

    if (envBase) return envBase.replace(/\/+$/, '');

    if (typeof window !== 'undefined' && window.location) {
      return window.location.origin;
    }

    return 'https://join.getsynth.app';
  }

  // ── URL builders ─────────────────────────────────────────────────────────

  static getEventUrl(eventId: string, referrerId?: string | null): string {
    return buildShareLandingUrl(this.getBaseUrl(), 'event', eventId, referrerId);
  }

  static getReviewUrl(reviewId: string, referrerId?: string | null): string {
    return buildShareLandingUrl(this.getBaseUrl(), 'review', reviewId, referrerId);
  }

  static getArtistUrl(artistId: string, referrerId?: string | null): string {
    return buildShareLandingUrl(this.getBaseUrl(), 'artist', artistId, referrerId);
  }

  static getVenueUrl(venueId: string, referrerId?: string | null): string {
    return buildShareLandingUrl(this.getBaseUrl(), 'venue', venueId, referrerId);
  }

  // ── Native share (iOS card renderer) ─────────────────────────────────────

  /**
   * Share an event using the native iOS share card renderer.
   * On iOS: opens the Synth bottom-sheet → renders a card image → UIActivityViewController.
   * On web: falls back to navigator.share or clipboard.
   */
  /**
   * Share an event using the native iOS share card renderer.
   * Pass `referrerId` (the current user's Supabase ID) so the share URL includes ?ref=
   * enabling auto-friend when a new user installs from the link.
   */
  static async shareEventNative(opts: {
    eventId:        string;
    title:          string;
    artistName?:    string;
    venueName?:     string;
    venueCity?:     string;
    eventDate?:     string;
    imageUrl?:      string;
    posterImageUrl?: string;
    referrerId?:    string;  // current user's ID — added to ?ref= param
  }): Promise<string> {
    const url = this.getEventUrl(opts.eventId, opts.referrerId);

    if (isNativeIOS()) {
      fireNativeShare({ ...opts, shareType: 'event' });
      return url;
    }

    return this._webShare(url, opts.title || 'Synth Event');
  }

  /**
   * Share a review using the native iOS share card renderer (shows star rating on card).
   * Pass `referrerId` to enable auto-friend attribution.
   */
  static async shareReviewNative(opts: {
    reviewId:       string;
    eventId:        string;
    title:          string;
    artistName?:    string;
    venueName?:     string;
    venueCity?:     string;
    eventDate?:     string;
    imageUrl?:      string;
    posterImageUrl?: string;
    reviewerName?:  string;
    overallRating?: number;
    reviewQuote?:   string;
    referrerId?:    string;  // current user's ID
  }): Promise<string> {
    const url = this.getReviewUrl(opts.reviewId, opts.referrerId);

    if (isNativeIOS()) {
      fireNativeShare({ ...opts, shareType: 'review' });
      return url;
    }

    return this._webShare(url, opts.artistName
      ? `${opts.artistName} — Review on Synth`
      : opts.title || 'Synth Review'
    );
  }

  // ── Legacy / web share methods (kept for non-native contexts) ─────────────

  static async shareEvent(eventId: string, title?: string, text?: string): Promise<string> {
    const url = this.getEventUrl(eventId);
    return this._webShare(url, title || 'Synth Event', text);
  }

  static async shareReview(reviewId: string, title?: string, text?: string): Promise<string> {
    const url = this.getReviewUrl(reviewId);
    return this._webShare(url, title || 'Synth Review', text);
  }

  static async shareArtist(artistId: string, title?: string, text?: string): Promise<string> {
    const url = this.getArtistUrl(artistId);
    return this._webShare(url, title || 'Synth Artist', text);
  }

  static async shareVenue(venueId: string, title?: string, text?: string): Promise<string> {
    const url = this.getVenueUrl(venueId);
    return this._webShare(url, title || 'Synth Venue', text);
  }

  // ── App share ─────────────────────────────────────────────────────────────

  /** Share the Synth app (App Store link). Optional referralCode for ?referral= attribution. */
  static getAppStoreUrl(referralCode?: string | null): string {
    if (referralCode?.trim()) {
      return `${SYNTH_APP_STORE_URL}?referral=${encodeURIComponent(referralCode.trim())}`;
    }
    return SYNTH_APP_STORE_URL;
  }

  /**
   * Share the Synth app. Optional custom message; use SHARE_APP_MESSAGE_EVENT_TOGETHER for review flow.
   * When openMessages is true, opens SMS/Messages with body pre-filled (user picks contact and sends).
   */
  static async shareApp(
    referralCode?: string | null,
    options?: { message?: string; openMessages?: boolean }
  ): Promise<string> {
    const url     = this.getAppStoreUrl(referralCode);
    const message = options?.message ?? SHARE_APP_MESSAGE_DEFAULT;
    const text    = `${message} ${url}`;

    if (options?.openMessages && typeof window !== 'undefined') {
      try {
        window.location.href = `sms:?body=${encodeURIComponent(text)}`;
      } catch {
        // fallback to share sheet
      }
      return url;
    }

    try {
      if (navigator.share) {
        await navigator.share({ title: 'Synth: For Live Music Lovers', text, url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // ignore user cancel
    }
    return url;
  }

  // ── Private web-share helper ──────────────────────────────────────────────

  private static async _webShare(url: string, title: string, text?: string): Promise<string> {
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // ignore user cancel
    }
    return url;
  }
}
