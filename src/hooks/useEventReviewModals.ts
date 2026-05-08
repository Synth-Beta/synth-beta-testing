import { useState, useRef, useEffect } from 'react';
import { NotificationService } from '@/services/notificationService';
import type { PrefillEvent } from '@/components/reviews/FriendTaggedReviewInviteModal';

export function useEventReviewModals(userId: string | undefined, loading: boolean) {
  const [showEventReviewModal, setShowEventReviewModal] = useState(false);
  const [eventReviewPrefill, setEventReviewPrefill] = useState<PrefillEvent | null>(null);
  const [friendTaggedInviteNotification, setFriendTaggedInviteNotification] = useState<any>(null);
  const [showFriendTaggedInviteModal, setShowFriendTaggedInviteModal] = useState(false);
  const hasCheckedFriendTaggedInvite = useRef(false);

  // Check for unread friend-tagged-in-review notifications on login
  useEffect(() => {
    if (!loading && userId && !hasCheckedFriendTaggedInvite.current) {
      hasCheckedFriendTaggedInvite.current = true;
      NotificationService.getNotifications({
        type: 'friend_tagged_in_review',
        is_read: false,
        limit: 1,
      })
        .then(({ notifications }) => {
          const first = notifications[0];
          if (first) {
            setFriendTaggedInviteNotification(first);
            setShowFriendTaggedInviteModal(true);
          }
        })
        .catch(() => {});

      // Update iOS badge count on login
      import('@/services/badgeService').then(({ BadgeService }) => {
        BadgeService.updateBadgeCount();
      });
    }
  }, [loading, userId]);

  // Listen for open-review-invite (from NotificationsPage tap on friend_tagged_in_review)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && (detail as any).artist_id && (detail as any).venue_id) {
        setEventReviewPrefill({
          id: `invite-${(detail as any).review_id || 'tap'}`,
          artist_id: (detail as any).artist_id,
          artist_name: (detail as any).artist_name,
          venue_id: (detail as any).venue_id,
          venue_name: (detail as any).venue_name,
          event_date: (detail as any).event_date,
          attendees: (detail as any).attendees,
        });
        setShowEventReviewModal(true);
      }
    };
    window.addEventListener('open-review-invite', handler);
    return () => window.removeEventListener('open-review-invite', handler);
  }, []);

  // Listen for open-review-modal (dispatched by event detail modals when "I Was There!" is clicked)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.event) {
        setEventReviewPrefill(detail.event as any);
        setShowEventReviewModal(true);
      }
    };
    window.addEventListener('open-review-modal', handler);
    return () => window.removeEventListener('open-review-modal', handler);
  }, []);

  return {
    showEventReviewModal,
    setShowEventReviewModal,
    eventReviewPrefill,
    setEventReviewPrefill,
    friendTaggedInviteNotification,
    setFriendTaggedInviteNotification,
    showFriendTaggedInviteModal,
    setShowFriendTaggedInviteModal,
  };
}
