import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { parseShareUrl, expoPathForShareTarget } from '@synth/shared';

/**
 * Handles cold start + runtime URLs: `?event=` / `?review=` / … (shared package) and `/event/:id` paths.
 * Run only when the user is signed in (caller gates) so auth redirects stay authoritative.
 */
export function useShareDeepLink(enabled: boolean) {
  const router = useRouter();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const navigateForParsed = (pending: NonNullable<ReturnType<typeof parseShareUrl>>) => {
      switch (pending.type) {
        case 'event':
          router.push(`/event/${pending.id}` as any);
          break;
        case 'review':
          router.push(`/event/${pending.id}` as any);
          break;
        case 'artist':
        case 'venue':
          router.push(expoPathForShareTarget(pending.type, pending.id) as any);
          break;
        default:
          console.warn('[useShareDeepLink] unhandled share link type; ignoring', pending);
      }
    };

    const handle = (raw: string) => {
      if (!raw || handledRef.current === raw) return;

      const pending = parseShareUrl(raw);
      if (pending) {
        handledRef.current = raw;
        navigateForParsed(pending);
        return;
      }

      const parsed = Linking.parse(raw);
      const path = (parsed.path || '').replace(/^\//, '');
      const eventSeg = path.match(/^event\/([^/?#]+)/);
      if (eventSeg?.[1]) {
        handledRef.current = raw;
        router.push(`/event/${eventSeg[1]}`);
        return;
      }

      const chatSeg = path.match(/^chat\/([^/?#]+)/);
      if (chatSeg?.[1]) {
        handledRef.current = raw;
        router.push(`/chat/${chatSeg[1]}`);
      }
    };

    void Linking.getInitialURL().then((u) => {
      if (u) handle(u);
    });

    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, [enabled, router]);
}
