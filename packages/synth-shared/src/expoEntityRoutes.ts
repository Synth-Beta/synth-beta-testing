import type { ShareContentType } from './shareUrl';

/**
 * Expo Router paths for shared deep links (web uses in-app modals; Expo uses stack routes).
 */
export function expoPathForShareTarget(type: ShareContentType, id: string): string {
  switch (type) {
    case 'event':
      return `/event/${id}`;
    case 'review':
      return `/review/${id}`;
    case 'artist':
      return `/artist/${id}`;
    case 'venue':
      return `/venue/${id}`;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}
