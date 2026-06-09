/**
 * expo-notifications@55 BadgeModule.swift uses RCTSharedApplication() without importing
 * React headers, so Swift archive builds fail with "Cannot find RCTSharedApplication in scope".
 * UIApplication.shared is the correct equivalent for the main app target.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const badgeModule = path.join(
  mobileRoot,
  'node_modules/expo-notifications/ios/ExpoNotifications/Badge/BadgeModule.swift',
);

if (!fs.existsSync(badgeModule)) {
  process.exit(0);
}

const original = fs.readFileSync(badgeModule, 'utf8');
if (!original.includes('RCTSharedApplication')) {
  process.exit(0);
}

const patched = original.replaceAll(
  'RCTSharedApplication()?.applicationIconBadgeNumber',
  'UIApplication.shared.applicationIconBadgeNumber',
);

if (patched === original) {
  console.warn('[patch-expo-notifications-badge] no changes applied');
  process.exit(1);
}

fs.writeFileSync(badgeModule, patched);
console.log('[patch-expo-notifications-badge] patched BadgeModule.swift');
