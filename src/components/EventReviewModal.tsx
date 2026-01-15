import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog';
import type { JamBaseEvent } from '@/types/eventTypes';
import type { UserReview, PublicReviewWithProfile } from '@/services/reviewService';
import { EventReviewForm } from '@/components/reviews/EventReviewForm';

interface EventReviewModalProps {
  event: JamBaseEvent | PublicReviewWithProfile | null;
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onReviewSubmitted?: (review: UserReview) => void | Promise<void>;
}

export function EventReviewModal({
  event,
  userId,
  isOpen,
  onClose,
  onReviewSubmitted
}: EventReviewModalProps) {
  // Allow null or placeholder events for creating new reviews
  if (!event && !isOpen) return null;

  const handleClose = () => {
    onClose();
  };

  // Get event title for modal header
  const eventTitle = event && 'title' in event ? event.title : event && 'event_name' in event ? event.event_name : 'Create Review';

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{eventTitle}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <EventReviewForm
            event={event as any}
            userId={userId}
            onSubmitted={async (review: UserReview) => {
              if (onReviewSubmitted) {
                // Await the callback if it returns a Promise (async function)
                const result = onReviewSubmitted(review);
                if (result instanceof Promise) {
                  await result;
                }
              }
              onClose();
            }}
            onDeleted={async () => {
              // Refresh parent data by triggering callback
              if (onReviewSubmitted) {
                const result = onReviewSubmitted(null as any);
                if (result instanceof Promise) {
                  await result;
                }
              }
              onClose();
            }}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
