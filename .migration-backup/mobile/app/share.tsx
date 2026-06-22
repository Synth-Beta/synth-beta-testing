import { useEffect } from 'react';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { parseShareUrl, expoPathForShareTarget } from '@synth/shared';
import { storePendingShareLink } from '../lib/shareDeepLinkStorage';
import { AppLoadingSkeleton } from '../src/components/AppLoadingSkeleton';

/**
 * Universal-link entry for https://join.getsynth.app/share?event=… (and review/artist/venue).
 * Without this route, Expo Router falls through to home and drops the share target.
 */
export default function ShareGateScreen() {
  const params = useGlobalSearchParams();
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      const qs = new URLSearchParams();
      const event = params.event;
      const review = params.review;
      const artist = params.artist;
      const venue = params.venue;
      const ref = params.ref;

      if (typeof event === 'string') qs.set('event', event);
      else if (Array.isArray(event) && event[0]) qs.set('event', event[0]);
      if (typeof review === 'string') qs.set('review', review);
      else if (Array.isArray(review) && review[0]) qs.set('review', review[0]);
      if (typeof artist === 'string') qs.set('artist', artist);
      else if (Array.isArray(artist) && artist[0]) qs.set('artist', artist[0]);
      if (typeof venue === 'string') qs.set('venue', venue);
      else if (Array.isArray(venue) && venue[0]) qs.set('venue', venue[0]);
      if (typeof ref === 'string') qs.set('ref', ref);
      else if (Array.isArray(ref) && ref[0]) qs.set('ref', ref[0]);

      const pending = parseShareUrl(`?${qs.toString()}`);
      if (!pending) {
        router.replace('/(tabs)');
        return;
      }

      await storePendingShareLink(pending);
      router.replace(expoPathForShareTarget(pending.type, pending.id) as never);
    })();
  }, [params, router]);

  return <AppLoadingSkeleton />;
}
