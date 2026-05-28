/**
 * useShareDeepLink
 *
 * Handles the full share deep-link lifecycle inside MainApp:
 *
 *  On mount (all platforms):
 *    - Reads ?event/review/artist/venue + ?ref from location.search
 *    - Stores as PendingShareLink in sessionStorage
 *    - Cleans the URL
 *    - On iOS native: signals to Swift that the web layer is ready
 *      (so any Universal Link that arrived before React mounted gets fired back)
 *
 *  On every URL-open event (iOS native):
 *    - Listens to Capacitor 'appUrlOpen' for Universal Links
 *    - Listens to 'synthDeepLink' CustomEvent from SynthDeepLinkRouter
 *    - Parses and stores the link
 *
 *  After auth (user is logged in):
 *    - Calls processPendingShareLink()
 *    - Auto-sends friend request to referrer
 *    - Calls onNavigate() with what to open
 *    - Shows welcome toast if a referrer was found
 */

import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import {
  parseShareUrl,
  storePendingLink,
  processPendingShareLink,
  type NavigationInstruction,
} from '@/services/shareDeepLinkService';

interface UseShareDeepLinkOptions {
  userId:     string | null | undefined;
  loading:    boolean;
  onNavigate: (instruction: NavigationInstruction) => void;
}

export function useShareDeepLink({
  userId,
  loading,
  onNavigate,
}: UseShareDeepLinkOptions) {
  const location    = useLocation();
  const navigate    = useNavigate();
  const isNative    = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  const processedRef = useRef(false); // ensure we only process once per auth session

  // ── Step 1: Capture link from URL params (/?event= after ShareLinkBootstrap) ──
  useEffect(() => {
    const link =
      parseShareUrl(location.search) ||
      parseShareUrl(window.location.href);

    if (link) {
      storePendingLink(link);
      if (location.search) {
        navigate(location.pathname, { replace: true });
      }
    }

    if (isNative && typeof (window as any).synthSignalDeepLinkReady === 'function') {
      (window as any).synthSignalDeepLinkReady();
    }
  }, [location.pathname, location.search, navigate, isNative]);

  // ── Step 2: Listen for Universal Links arriving while app is running ─────
  useEffect(() => {
    if (!isNative) return;

    // Capacitor fires this when app is foregrounded via a universal link
    let capHandle: { remove: () => void } | null = null;
    CapApp.addListener('appUrlOpen', ({ url }: { url: string }) => {
      const link = parseShareUrl(url);
      if (link) storePendingLink(link);
    }).then(h => { capHandle = h; });

    // SynthDeepLinkRouter fires this for links that arrived before React mounted
    const handleSynthDeepLink = (e: Event) => {
      const url = (e as CustomEvent<{ url: string }>).detail?.url;
      if (!url) return;
      const link = parseShareUrl(url);
      if (link) storePendingLink(link);
    };
    window.addEventListener('synthDeepLink', handleSynthDeepLink);

    return () => {
      capHandle?.remove();
      window.removeEventListener('synthDeepLink', handleSynthDeepLink);
    };
  }, [isNative]);

  // ── Step 3: Process pending link once user is authenticated ─────────────
  useEffect(() => {
    if (loading || !userId || processedRef.current) return;

    // Small delay so the feed and modal listeners are mounted first
    const timer = setTimeout(async () => {
      const instruction = await processPendingShareLink(userId);
      if (!instruction) return;

      processedRef.current = true;

      // Show welcome toast if someone referred this user
      if (instruction.referrer) {
        const name =
          instruction.referrer.display_name ||
          (instruction.referrer.username ? `@${instruction.referrer.username}` : null);
        if (name) {
          toast(`${name} shared this with you on Synth 🎶`, {
            description: 'A friend request has been sent automatically.',
            duration: 5000,
          });
        }
      }

      onNavigate(instruction);
    }, 700);

    return () => clearTimeout(timer);
  }, [loading, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset processed flag when user logs out so a new session can process links
  useEffect(() => {
    if (!userId) processedRef.current = false;
  }, [userId]);
}
