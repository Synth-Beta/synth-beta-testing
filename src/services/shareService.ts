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
}


