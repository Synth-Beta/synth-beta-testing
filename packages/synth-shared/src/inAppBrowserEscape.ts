/**
 * Instagram, Threads, and Facebook's in-app browsers intercept taps on
 * apps.apple.com links and silently drop them - neither a Universal Link nor
 * a bare `x-safari-` href reliably escapes their webview. The documented
 * workaround is to detect the host app from the user-agent and navigate to
 * an app-specific escape URL that the host app itself honors.
 *
 * NOTE: api/share.ts can't import this (it's a hand-authored HTML string
 * with an inline <script>, not a bundled module) - its escape script is a
 * parallel, hand-mirrored implementation. Keep the two in sync.
 */

export type InAppBrowserHost = 'instagram' | 'facebook' | 'android-webview';

const INSTAGRAM_UA_RE = /Instagram/i;
const FACEBOOK_UA_RE = /FBAN|FBAV|FB_IAB|Messenger/i;
const IOS_UA_RE = /iPhone|iPad|iPod/i;
const ANDROID_UA_RE = /Android/i;

export function isIOS(userAgent: string): boolean {
  return IOS_UA_RE.test(userAgent);
}

export function isAndroid(userAgent: string): boolean {
  return ANDROID_UA_RE.test(userAgent);
}

/** Which in-app browser (if any) is hosting the current page. */
export function detectInAppBrowser(userAgent: string): InAppBrowserHost | null {
  if (!userAgent) return null;
  const isMeta = INSTAGRAM_UA_RE.test(userAgent) || FACEBOOK_UA_RE.test(userAgent);
  if (!isMeta) return null;
  if (isAndroid(userAgent)) return 'android-webview';
  return INSTAGRAM_UA_RE.test(userAgent) ? 'instagram' : 'facebook';
}

/**
 * Navigates away from the host app's in-app browser toward the device's
 * real browser. Must be called synchronously inside a click handler - iOS
 * drops the navigation if it's deferred (e.g. behind a promise).
 */
export function escapeInAppBrowser(host: InAppBrowserHost, targetUrl: string): void {
  switch (host) {
    case 'instagram':
      // Instagram intercepts this custom scheme and opens Safari; a bare
      // `x-safari-` href is silently swallowed by IG's webview.
      window.location.href = `instagram://extbrowser?url=${encodeURIComponent(targetUrl)}`;
      return;
    case 'facebook':
      window.open(`x-safari-${targetUrl}`, '_blank');
      return;
    case 'android-webview': {
      const noScheme = targetUrl.replace(/^https?:\/\//, '');
      window.location.href = `intent://${noScheme}#Intent;scheme=https;end`;
      return;
    }
  }
}
