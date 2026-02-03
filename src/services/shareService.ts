/** App Store link for Synth. Append ?referral=<code> when available for attribution. */
export const SYNTH_APP_STORE_URL = 'https://apps.apple.com/us/app/synth-for-live-music-lovers/id6757408095';

/** Message when sharing from the review flow (who you went with). */
export const SHARE_APP_MESSAGE_EVENT_TOGETHER =
  "We went to an event together! I'm sharing it on Synth — check it out:";

/** Default message for general app share (e.g. banner). */
export const SHARE_APP_MESSAGE_DEFAULT =
  "I've been using Synth to discover shows and share live music moments. Thought you'd like it — ";

export class ShareService {
  private static getBaseUrl(): string {
    if (typeof window !== 'undefined' && window.location) {
      return window.location.origin;
    }
    return 'https://plusone.app';
  }

  static getEventUrl(eventId: string): string {
    const origin = this.getBaseUrl();
    return `${origin}/?event=${encodeURIComponent(eventId)}`;
  }

  static getReviewUrl(reviewId: string): string {
    const origin = this.getBaseUrl();
    return `${origin}/?review=${encodeURIComponent(reviewId)}`;
  }

  static getArtistUrl(artistId: string): string {
    const origin = this.getBaseUrl();
    return `${origin}/?artist=${encodeURIComponent(artistId)}`;
  }

  static getVenueUrl(venueId: string): string {
    const origin = this.getBaseUrl();
    return `${origin}/?venue=${encodeURIComponent(venueId)}`;
  }

  static async shareEvent(eventId: string, title?: string, text?: string): Promise<string> {
    const url = this.getEventUrl(eventId);
    try {
      if (navigator.share) {
        await navigator.share({ title: title || 'PlusOne Event', text, url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // ignore user cancel
    }
    return url;
  }

  static async shareReview(reviewId: string, title?: string, text?: string): Promise<string> {
    const url = this.getReviewUrl(reviewId);
    try {
      if (navigator.share) {
        await navigator.share({ title: title || 'PlusOne Review', text, url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // ignore user cancel
    }
    return url;
  }

  static async shareArtist(artistId: string, title?: string, text?: string): Promise<string> {
    const url = this.getArtistUrl(artistId);
    try {
      if (navigator.share) {
        await navigator.share({ title: title || 'Synth Artist', text, url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // ignore user cancel
    }
    return url;
  }

  static async shareVenue(venueId: string, title?: string, text?: string): Promise<string> {
    const url = this.getVenueUrl(venueId);
    try {
      if (navigator.share) {
        await navigator.share({ title: title || 'Synth Venue', text, url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // ignore user cancel
    }
    return url;
  }

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
    const url = this.getAppStoreUrl(referralCode);
    const message = options?.message ?? SHARE_APP_MESSAGE_DEFAULT;
    const text = `${message} ${url}`;

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
}


