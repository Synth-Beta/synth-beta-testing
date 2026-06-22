import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ArtistFollowService } from '@/services/artistFollowService';
import { ShareService } from '@/services/shareService';

export type GlobalDetailModalState =
  | { open: false }
  | { open: true; type: 'artist'; artistId: string; artistName: string }
  | { open: true; type: 'venue'; venueId: string; venueName: string }
  | { open: true; type: 'profile'; userId: string; userName: string };

export function useGlobalDetailModal(
  userId: string | undefined,
  handleEventClickFromVenue: (eventId: string) => void,
) {
  const [detailModal, setDetailModal] = useState<GlobalDetailModalState>({ open: false });
  const [manualArtistDetail, setManualArtistDetail] = useState<{
    open: boolean;
    artistId?: string;
    artistName?: string;
    following?: boolean;
  }>({ open: false });
  const [isEventDetailsOpen, setIsEventDetailsOpen] = useState(false);

  useEffect(() => {
    const openArtist = async (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      let artistId: string | null = detail.artistId || null;
      let artistName: string = detail.artistName || '';

      if (artistId && !artistName) {
        try {
          const { data } = await supabase.from('artists').select('name').eq('id', artistId).maybeSingle();
          if (data?.name) artistName = data.name;
        } catch {
          // Non-fatal; modal can still open with fallback name
        }
      }

      if (!artistId && artistName) {
        try {
          const { data } = await supabase.from('artists').select('id, name').ilike('name', artistName).limit(1).maybeSingle();
          if (data?.id) artistId = data.id;
          if (data?.name) artistName = data.name;
        } catch {
          // Ignore
        }
      }

      if (artistId) {
        try {
          const { data: artistRow } = await supabase
            .from('artists')
            .select('id, name, identifier')
            .eq('id', artistId)
            .maybeSingle();

          if (artistRow?.identifier?.startsWith('manual:')) {
            if (!userId) return;
            const following = await ArtistFollowService.isFollowingArtist(artistId, userId);
            setManualArtistDetail({
              open: true,
              artistId,
              artistName: artistRow.name || artistName || 'Artist',
              following,
            });
            return;
          }
        } catch (error) {
          console.error('Error fetching manual artist row:', error);
          // Continue to open the standard modal even if the manual check fails
        }

        setDetailModal({
          open: true,
          type: 'artist',
          artistId,
          artistName: artistName || 'Artist',
        });
      }
    };

    const openVenue = async (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      let venueId: string | null = detail.venueId || null;
      let venueName: string = detail.venueName || '';

      if (venueId && !venueName) {
        try {
          const { data } = await supabase.from('venues').select('name').eq('id', venueId).maybeSingle();
          if (data?.name) venueName = data.name;
        } catch {
          // Non-fatal
        }
      }

      if (!venueId && venueName) {
        try {
          const { data } = await supabase.from('venues').select('id, name').ilike('name', venueName).limit(1).maybeSingle();
          if (data?.id) venueId = data.id;
          if (data?.name) venueName = data.name;
        } catch {
          // Ignore
        }
      }

      if (venueId) {
        setDetailModal({
          open: true,
          type: 'venue',
          venueId,
          venueName: venueName || 'Venue',
        });
      }
    };

    const handleEventDetailsOpen = () => setIsEventDetailsOpen(true);
    const handleEventDetailsClose = () => setIsEventDetailsOpen(false);
    const handleOpenEventDetails = (e: Event) => {
      const detail = (e as CustomEvent).detail as { eventId?: string };
      if (detail?.eventId) {
        setDetailModal({ open: false });
        handleEventClickFromVenue(detail.eventId);
      }
    };

    window.addEventListener('open-artist-card', openArtist as EventListener);
    window.addEventListener('open-venue-card', openVenue as EventListener);
    window.addEventListener('event-details-open', handleEventDetailsOpen as EventListener);
    window.addEventListener('event-details-close', handleEventDetailsClose as EventListener);
    window.addEventListener('open-event-details', handleOpenEventDetails as EventListener);
    return () => {
      window.removeEventListener('open-artist-card', openArtist as EventListener);
      window.removeEventListener('open-venue-card', openVenue as EventListener);
      window.removeEventListener('event-details-open', handleEventDetailsOpen as EventListener);
      window.removeEventListener('event-details-close', handleEventDetailsClose as EventListener);
      window.removeEventListener('open-event-details', handleOpenEventDetails as EventListener);
    };
  }, [handleEventClickFromVenue, userId]);

  const handleCloseGlobalDetail = useCallback(() => setDetailModal({ open: false }), []);

  const handleShareGlobalDetail = useCallback(async () => {
    if (!detailModal.open) return;
    try {
      if (detailModal.type === 'artist') {
        await ShareService.shareArtist(
          detailModal.artistId,
          `${detailModal.artistName} on Synth`,
          `Check out ${detailModal.artistName} on Synth.`,
        );
      } else if (detailModal.type === 'venue') {
        await ShareService.shareVenue(
          detailModal.venueId,
          `${detailModal.venueName} on Synth`,
          `Check out ${detailModal.venueName} on Synth.`,
        );
      }
    } catch (error) {
      console.error('Error sharing detail:', error);
    }
  }, [detailModal]);

  const closeManualArtistDetail = useCallback(() => setManualArtistDetail({ open: false }), []);

  const toggleManualArtistFollow = useCallback(async () => {
    if (!userId || !manualArtistDetail.artistId) return;
    const currentlyFollowing = manualArtistDetail.following === true;
    try {
      await ArtistFollowService.setArtistFollow(userId, manualArtistDetail.artistId, !currentlyFollowing);
      setManualArtistDetail((prev) =>
        prev.open ? { ...prev, following: !currentlyFollowing } : prev,
      );
    } catch (error) {
      console.error('Error toggling manual artist follow:', error);
    }
  }, [userId, manualArtistDetail]);

  return {
    detailModal,
    setDetailModal,
    manualArtistDetail,
    isEventDetailsOpen,
    handleCloseGlobalDetail,
    handleShareGlobalDetail,
    closeManualArtistDetail,
    toggleManualArtistFollow,
  };
}
