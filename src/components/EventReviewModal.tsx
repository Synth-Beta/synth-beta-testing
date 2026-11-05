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

  // Fixed height so the body is a real scrollport. A max-height-only dialog
  // grows with the form and then clips, which hides the end of the form.
  const dialogHeight =
    'calc(100dvh - (env(safe-area-inset-top, 0px) + env(safe-area-inset-bottom, 0px) + 24px))';

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="!flex !flex-col"
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          transform: 'translate(-50%, 0)',
          height: dialogHeight,
          maxHeight: dialogHeight,
        }}
      >
        <DialogHeader>
          <DialogTitle>{eventTitle}</DialogTitle>
        </DialogHeader>
        <DialogBody data-review-scroll="true" className="min-h-0">
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
          {/* In-flow spacer: padding-bottom on the scrollport is dropped from the
              scroll range in WebKit, so the end of the form never clears the edge. */}
          <div aria-hidden="true" style={{ height: 'var(--spacing-bottom-nav, 32px)', flexShrink: 0 }} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
