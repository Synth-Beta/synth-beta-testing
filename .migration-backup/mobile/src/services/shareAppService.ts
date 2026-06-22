import { Platform, Share } from 'react-native';
import { getExpoSiteUrl } from '../utils/siteUrl';

/** App Store link for Synth. Append ?referral=<code> when available for attribution. */
export const SYNTH_APP_STORE_URL =
  'https://apps.apple.com/us/app/synth-for-live-music-lovers/id6757408095';

/** Optional Play Store URL (set when Android listing is live). */
const SYNTH_PLAY_STORE_URL = process.env.EXPO_PUBLIC_PLAY_STORE_URL?.trim() || '';

/** Message when sharing from the review flow (who you went with). */
export const SHARE_APP_MESSAGE_EVENT_TOGETHER =
  "We went to an event together! I'm sharing it on Synth — check it out:";

/** Default message for general app share (e.g. banner). */
export const SHARE_APP_MESSAGE_DEFAULT =
  "I've been using Synth to discover concerts and share live music with friends. Join me —";

export class ShareAppService {
  static getStoreUrl(referralCode?: string | null): string {
    const base =
      Platform.OS === 'android'
        ? (SYNTH_PLAY_STORE_URL || getExpoSiteUrl())
        : SYNTH_APP_STORE_URL;
    if (referralCode?.trim()) {
      const joiner = base.includes('?') ? '&' : '?';
      return `${base}${joiner}referral=${encodeURIComponent(referralCode.trim())}`;
    }
    return base;
  }

  static async shareApp(
    referralCode?: string | null,
    options?: { message?: string }
  ): Promise<string> {
    const url = this.getStoreUrl(referralCode);
    const message = options?.message ?? SHARE_APP_MESSAGE_DEFAULT;
    const text = `${message} ${url}`;

    try {
      await Share.share({ message: text });
    } catch {
      // ignore user cancel
    }

    return url;
  }
}

