/**
 * Badge Service
 *
 * Historically managed the iOS app icon badge count via the legacy Capacitor
 * native bridge. That bridge no longer exists (the native iOS app now ships
 * via Expo, see mobile/), so this is a no-op stub kept so existing call sites
 * don't need to be torn out individually.
 */

export class BadgeService {
  static async updateBadgeCount(): Promise<void> {
    // No-op: no native badge bridge exists in this web bundle.
  }

  static async clearBadge(): Promise<void> {
    // No-op: no native badge bridge exists in this web bundle.
  }
}
