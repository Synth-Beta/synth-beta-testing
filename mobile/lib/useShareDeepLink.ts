import { useCallback, useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import {
  parseShareUrl,
  expoPathForShareTarget,
  type PendingShareLink,
} from '@synth/shared';
import {
  storePendingShareLink,
  loadPendingShareLink,
  clearPendingShareLink,
} from './shareDeepLinkStorage';

function pendingFromPath(path: string): PendingShareLink | null {
  const normalized = path.replace(/^\//, '');
  const eventSeg = normalized.match(/^event\/([^/?#]+)/);
  if (eventSeg?.[1]) {
    return { type: 'event', id: eventSeg[1], referrerId: null };
  }
  const reviewSeg = normalized.match(/^review\/([^/?#]+)/);
  if (reviewSeg?.[1]) {
    return { type: 'review', id: reviewSeg[1], referrerId: null };
  }
  return null;
}

/**
 * Captures share URLs on cold start + runtime (even when logged out).
 * Navigates to event/review/artist/venue routes when `navigateEnabled` is true.
 */
export function useShareDeepLink(navigateEnabled: boolean) {
  const router = useRouter();
  const navigateEnabledRef = useRef(navigateEnabled);
  const lastCapturedRef = useRef<string | null>(null);

  navigateEnabledRef.current = navigateEnabled;

  const navigateForPending = useCallback(
    async (pending: PendingShareLink) => {
      await clearPendingShareLink();
      router.push(expoPathForShareTarget(pending.type, pending.id) as any);
    },
    [router]
  );

  const captureFromUrl = useCallback(
    async (raw: string) => {
      if (!raw || lastCapturedRef.current === raw) return;

      let pending = parseShareUrl(raw);
      if (!pending) {
        const parsed = Linking.parse(raw);
        const path = parsed.path || '';
        pending = pendingFromPath(path);
      }

      if (!pending) {
        const parsed = Linking.parse(raw);
        const path = (parsed.path || '').replace(/^\//, '');
        const chatSeg = path.match(/^chat\/([^/?#]+)/);
        if (chatSeg?.[1] && navigateEnabledRef.current) {
          lastCapturedRef.current = raw;
          router.push(`/chat/${chatSeg[1]}`);
        }
        return;
      }

      lastCapturedRef.current = raw;
      await storePendingShareLink(pending);

      if (navigateEnabledRef.current) {
        await navigateForPending(pending);
      }
    },
    [router, navigateForPending]
  );

  // Always listen for incoming URLs (persist before auth).
  useEffect(() => {
    void Linking.getInitialURL().then((u) => {
      if (u) void captureFromUrl(u);
    });

    const sub = Linking.addEventListener('url', ({ url }) => {
      void captureFromUrl(url);
    });
    return () => sub.remove();
  }, [captureFromUrl]);

  // After sign-in + onboarding, process any pending share stored earlier.
  useEffect(() => {
    if (!navigateEnabled) return;

    void (async () => {
      const pending = await loadPendingShareLink();
      if (pending) {
        await navigateForPending(pending);
      }
    })();
  }, [navigateEnabled, navigateForPending]);
}
