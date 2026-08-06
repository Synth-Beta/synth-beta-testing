/**
 * useShareDeepLink
 *
 * Handles the share deep-link lifecycle inside MainApp:
 *
 *  On mount:
 *    - Reads ?event/review/artist/venue + ?ref from location.search
 *    - Stores as PendingShareLink in sessionStorage
 *    - Cleans the URL
 *
 *  After auth (user is logged in):
 *    - Calls processPendingShareLink()
 *    - Auto-sends friend request to referrer
 *    - Calls onNavigate() with what to open
 *    - Shows welcome toast if a referrer was found
 */

import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
  const processedRef = useRef(false);

  const tryProcessPending = async () => {
    if (loading || !userId || processedRef.current) return;

    const instruction = await processPendingShareLink(userId);
    if (!instruction) return;

    processedRef.current = true;

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
  };

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
  }, [location.pathname, location.search, navigate]);

  // ── Step 2: Open event/review card once authenticated (retry until feed is ready) ──
  useEffect(() => {
    if (loading || !userId) return;

    void tryProcessPending();
    const t1 = setTimeout(() => void tryProcessPending(), 400);
    const t2 = setTimeout(() => void tryProcessPending(), 1200);

    const onPending = () => void tryProcessPending();
    window.addEventListener('synth-pending-share', onPending);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('synth-pending-share', onPending);
    };
  }, [loading, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!userId) processedRef.current = false;
  }, [userId]);
}
