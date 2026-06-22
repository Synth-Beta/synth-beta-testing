import React, { Suspense } from 'react';
import type { GlobalDetailModalState } from '@/hooks/useGlobalDetailModal';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { UserEventService } from '@/services/userEventService';

const ArtistDetailModal = React.lazy(() =>
  import('@/components/discover/modals/ArtistDetailModal').then(m => ({ default: m.ArtistDetailModal }))
);
const VenueDetailModal = React.lazy(() =>
  import('@/components/discover/modals/VenueDetailModal').then(m => ({ default: m.VenueDetailModal }))
);

interface GlobalDetailModalsProps {
  userId: string;
  detailModal: GlobalDetailModalState;
  manualArtistDetail: { open: boolean; artistId?: string; artistName?: string; following?: boolean };
  eventDetailsFromVenueOpen: boolean;
  selectedEventFromVenue: any;
  selectedEventFromVenueInterested: boolean;
  onCloseDetailModal: () => void;
  onCloseEventDetailsFromVenue: () => void;
  onEventFromVenueChange: (event: any, isInterested?: boolean) => void;
  onInterestToggle: (eventId: string, interested: boolean) => Promise<void>;
  onNavigateToProfile: (userId?: string, tab?: 'timeline' | 'interested') => void;
  onNavigateToChat: (userIdOrChatId: string) => void;
  onEventClickFromVenue: (eventId: string) => void;
  closeManualArtistDetail: () => void;
  toggleManualArtistFollow: () => void;
}

export const GlobalDetailModals = ({
  userId,
  detailModal,
  manualArtistDetail,
  eventDetailsFromVenueOpen,
  selectedEventFromVenue,
  selectedEventFromVenueInterested,
  onCloseDetailModal,
  onCloseEventDetailsFromVenue,
  onEventFromVenueChange,
  onInterestToggle,
  onNavigateToProfile,
  onNavigateToChat,
  onEventClickFromVenue,
  closeManualArtistDetail,
  toggleManualArtistFollow,
}: GlobalDetailModalsProps) => {
  return (
    <>
      <Suspense fallback={null}>
        {detailModal.open && detailModal.type === 'artist' && detailModal.artistId && (
          <ArtistDetailModal
            isOpen={detailModal.open}
            onClose={onCloseDetailModal}
            artistId={detailModal.artistId}
            artistName={detailModal.artistName || 'Artist'}
            currentUserId={userId}
          />
        )}
        {detailModal.open && detailModal.type === 'venue' && detailModal.venueId && (
          <VenueDetailModal
            isOpen={detailModal.open}
            onClose={onCloseDetailModal}
            venueId={detailModal.venueId}
            venueName={detailModal.venueName || 'Venue'}
            currentUserId={userId}
            onEventClick={onEventClickFromVenue}
          />
        )}
      </Suspense>

      {/* Event Details Modal (opened from global venue modal event cards) */}
      {eventDetailsFromVenueOpen && selectedEventFromVenue && (
        <EventDetailsModal
          isOpen={eventDetailsFromVenueOpen}
          onClose={onCloseEventDetailsFromVenue}
          event={selectedEventFromVenue}
          currentUserId={userId}
          isInterested={selectedEventFromVenueInterested}
          onEventChange={onEventFromVenueChange}
          onInterestToggle={async (eventId, interested) => {
            try {
              await UserEventService.setEventInterest(userId, eventId, interested);
              onInterestToggle(eventId, interested);
            } catch (error) {
              console.error('Error toggling interest:', error);
            }
          }}
          onReview={() => {
            const ev = selectedEventFromVenue;
            onCloseEventDetailsFromVenue();
            window.dispatchEvent(new CustomEvent('open-review-modal', { detail: { event: ev } }));
          }}
          onNavigateToProfile={onNavigateToProfile}
          onNavigateToChat={onNavigateToChat}
        />
      )}
      {manualArtistDetail.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeManualArtistDetail} />
          <div
            className="relative bg-white w-full max-w-sm mx-4 rounded-2xl p-4 shadow-xl"
            style={{ minHeight: '150px' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex justify-end">
              <button
                type="button"
                className="flex items-center justify-center rounded-full"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: 'transparent',
                }}
                onClick={closeManualArtistDetail}
                aria-label="Close manual artist detail"
              >
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    lineHeight: 1,
                    color: 'var(--neutral-900)',
                  }}
                >
                  ✕
                </span>
              </button>
            </div>
            <div className="text-center mt-2">
              <h2
                className="font-semibold"
                style={{
                  fontSize: '20px',
                  lineHeight: '28px',
                  color: 'var(--neutral-900)',
                }}
              >
                {manualArtistDetail.artistName || 'Artist'}
              </h2>
            </div>
            <div className="mt-4">
              <button
                type="button"
                className="w-full rounded-2xl px-4 py-3 font-semibold"
                style={{
                  backgroundColor: 'var(--neutral-900)',
                  color: 'var(--neutral-50)',
                }}
                onClick={toggleManualArtistFollow}
              >
                {manualArtistDetail.following ? 'Following' : 'Follow'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
