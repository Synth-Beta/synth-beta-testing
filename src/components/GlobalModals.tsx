import React from 'react';
import { SettingsModal } from './SettingsModal';
import type { SettingsModalView } from './SettingsModal';
import { EventReviewModal } from './EventReviewModal';
import { FriendTaggedReviewInviteModal } from './reviews/FriendTaggedReviewInviteModal';
import type { PrefillEvent } from './reviews/FriendTaggedReviewInviteModal';
import { NewFriendCelebrationModal } from './NewFriendCelebrationModal';
import type { CelebrationData } from './NewFriendCelebrationModal';
import { NotificationService } from '@/services/notificationService';

interface GlobalModalsProps {
  userId: string;
  userEmail?: string;
  showSettings: boolean;
  settingsInitialView: SettingsModalView;
  onCloseSettings: () => void;
  onSignOut: () => void;
  showEventReviewModal: boolean;
  eventReviewPrefill: PrefillEvent | null;
  onCloseEventReview: () => void;
  onReviewSubmitted: () => void;
  showFriendTaggedInviteModal: boolean;
  friendTaggedInviteNotification: any;
  onCloseFriendTaggedInviteModal: () => void;
  onWriteReview: (prefill: PrefillEvent) => void;
  friendCelebration: { notificationId: string; friendName: string; data: CelebrationData } | null;
  onCloseFriendCelebration: () => void;
  onCelebrationEventClick: (eventId: string) => void;
  onCelebrationArtistClick: (artistId: string, artistName: string) => void;
  onCelebrationVenueClick: (venueId: string, venueName: string) => void;
}

export const GlobalModals = ({
  userId,
  userEmail,
  showSettings,
  settingsInitialView,
  onCloseSettings,
  onSignOut,
  showEventReviewModal,
  eventReviewPrefill,
  onCloseEventReview,
  onReviewSubmitted,
  showFriendTaggedInviteModal,
  friendTaggedInviteNotification,
  onCloseFriendTaggedInviteModal,
  onWriteReview,
  friendCelebration,
  onCloseFriendCelebration,
  onCelebrationEventClick,
  onCelebrationArtistClick,
  onCelebrationVenueClick,
}: GlobalModalsProps) => {
  return (
    <>
      <SettingsModal
        isOpen={showSettings}
        onClose={onCloseSettings}
        onSignOut={onSignOut}
        userEmail={userEmail}
        initialView={settingsInitialView}
      />

      {/* Friend Tagged in Review Invite Modal - shows on login when user was tagged */}
      {friendTaggedInviteNotification && (
        <FriendTaggedReviewInviteModal
          notification={friendTaggedInviteNotification}
          isOpen={showFriendTaggedInviteModal}
          onClose={async () => {
            const notifId = friendTaggedInviteNotification?.id;
            onCloseFriendTaggedInviteModal();
            if (notifId) {
              try {
                await NotificationService.markAsRead(notifId);
              } catch {}
            }
          }}
          onWriteReview={(prefillEvent) => {
            const notifId = friendTaggedInviteNotification?.id;
            onWriteReview(prefillEvent);
            if (notifId) {
              NotificationService.markAsRead(notifId).catch(() => {});
            }
          }}
        />
      )}

      {/* New Friend Celebration Modal - shows on login or realtime when friend_accepted */}
      {friendCelebration && (
        <NewFriendCelebrationModal
          friendName={friendCelebration.friendName}
          data={friendCelebration.data}
          isOpen={!!friendCelebration}
          onClose={async () => {
            const notifId = friendCelebration.notificationId;
            onCloseFriendCelebration();
            if (notifId) {
              try {
                await NotificationService.markAsRead(notifId);
              } catch {}
            }
          }}
          onEventClick={(eventId) => {
            const notifId = friendCelebration.notificationId;
            onCloseFriendCelebration();
            if (notifId) {
              NotificationService.markAsRead(notifId).catch(() => {});
            }
            onCelebrationEventClick(eventId);
          }}
          onArtistClick={onCelebrationArtistClick}
          onVenueClick={onCelebrationVenueClick}
        />
      )}

      {/* Event Review Modal */}
      <EventReviewModal
        isOpen={showEventReviewModal}
        onClose={onCloseEventReview}
        event={(eventReviewPrefill || { id: 'new-review' }) as any}
        userId={userId}
        onReviewSubmitted={onReviewSubmitted}
      />
    </>
  );
};
