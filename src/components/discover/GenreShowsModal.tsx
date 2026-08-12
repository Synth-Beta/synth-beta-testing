import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import {
  iosModal,
  iosModalBackdrop,
  iosHeader,
  iosIconButton,
  textStyles,
} from '@/styles/glassmorphism';
import { useDetailModalLayout, DETAIL_MODAL_Z } from '@/hooks/useDetailModalLayout';
import { CompactEventCard } from '@/components/home/CompactEventCard';
import { UserEventService } from '@/services/userEventService';
import { ShareService } from '@/services/shareService';
import type { GenreConfig } from '@/services/genreChatService';
import type { JamBaseEvent } from '@/types/eventTypes';

interface GenreShowsModalProps {
  isOpen: boolean;
  onClose: () => void;
  genre: GenreConfig | undefined;
  events: JamBaseEvent[];
  loading: boolean;
  currentUserId: string;
  onEventClick: (event: JamBaseEvent) => void;
}

/**
 * Full-screen list of upcoming shows for a genre chat, opened from GenreChatEventsButton.
 * Uses the same card design as the home feed (@/components/home/CompactEventCard) — full-bleed
 * hero cards with working Interested/Share actions — rather than the smaller discover-style row.
 */
export const GenreShowsModal: React.FC<GenreShowsModalProps> = ({
  isOpen,
  onClose,
  genre,
  events,
  loading,
  currentUserId,
  onEventClick,
}) => {
  const { isWebDesktop, railWidth } = useDetailModalLayout();
  const [interestedIds, setInterestedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen || events.length === 0) return;
    let cancelled = false;
    void UserEventService.getUserInterestedEventIdSet(
      currentUserId,
      events.map((e) => e.id)
    ).then((ids) => {
      if (!cancelled) setInterestedIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, events, currentUserId]);

  if (!isOpen) return null;

  const title = genre ? `${genre.emoji} Upcoming ${genre.name} Shows` : 'Upcoming Shows';
  const desktopOffset = isWebDesktop
    ? { left: `${railWidth}px`, width: `calc(100% - ${railWidth}px)` }
    : {};

  const handleInterestClick = async (event: JamBaseEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = !interestedIds.has(event.id);
    setInterestedIds((prev) => {
      const next = new Set(prev);
      if (newState) next.add(event.id);
      else next.delete(event.id);
      return next;
    });
    try {
      await UserEventService.setEventInterest(currentUserId, event.id, newState);
    } catch (error) {
      console.error('Error toggling interest from genre shows modal:', error);
      // Revert on failure
      setInterestedIds((prev) => {
        const next = new Set(prev);
        if (newState) next.delete(event.id);
        else next.add(event.id);
        return next;
      });
    }
  };

  const handleShareClick = async (event: JamBaseEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await ShareService.shareEventNative({
        eventId: event.id,
        title: event.title,
        artistName: event.artist_name,
        venueName: event.venue_name,
        venueCity: event.venue_city,
        eventDate: event.event_date,
        imageUrl: event.images?.[0]?.url,
        referrerId: currentUserId,
      });
    } catch (error) {
      console.error('Error sharing event from genre shows modal:', error);
    }
  };

  return createPortal(
    <>
      <div
        style={{
          ...iosModalBackdrop,
          zIndex: DETAIL_MODAL_Z.backdropOwnHeader,
          ...desktopOffset,
        }}
        onClick={onClose}
      />
      <div
        className="fixed inset-0 overflow-hidden"
        style={{
          ...iosModal,
          zIndex: DETAIL_MODAL_Z.contentOwnHeader,
          display: 'flex',
          flexDirection: 'column',
          ...(isWebDesktop
            ? { ...desktopOffset, maxWidth: 'none', margin: 0 }
            : {}),
        }}
      >
        <div style={{ ...iosHeader, zIndex: DETAIL_MODAL_Z.internalHeader }}>
          <button
            onClick={onClose}
            style={{ ...iosIconButton, width: 40, height: 40 }}
            aria-label="Close"
            type="button"
          >
            <ChevronLeft size={22} style={{ color: 'var(--neutral-900)' }} />
          </button>
          <h2
            style={{
              ...textStyles.title1,
              color: 'var(--neutral-900)',
              margin: 0,
              flex: 1,
              textAlign: 'center',
              paddingRight: 40,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </h2>
        </div>

        <div className="swift-ui-feed" style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--neutral-600)', marginTop: 40 }}>
              Loading shows…
            </p>
          ) : events.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--neutral-600)', marginTop: 40 }}>
              No upcoming shows found for this genre yet.
            </p>
          ) : (
            events.map((event) => {
              const distanceMiles = (event as unknown as Record<string, unknown>).distanceMiles;
              const distanceLabel =
                typeof distanceMiles === 'number' ? `${Math.round(distanceMiles)} mi` : undefined;
              return (
                <div key={event.id} className="swift-ui-feed-item">
                  <CompactEventCard
                    event={event}
                    distanceLabel={distanceLabel}
                    isInterested={interestedIds.has(event.id)}
                    onInterestClick={(e) => handleInterestClick(event, e)}
                    onShareClick={(e) => handleShareClick(event, e)}
                    onClick={() => onEventClick(event)}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </>,
    document.body
  );
};
