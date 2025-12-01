import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import type { JamBaseEvent } from '@/services/jambaseEventsService';
import type { UserReview, PublicReviewWithProfile } from '@/services/reviewService';
import { EventReviewForm } from './EventReviewForm.tsx';
import { ReviewMobileShell } from './ReviewMobileShell';

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
  if (!event) return null;

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl w-[98vw] h-[90dvh] max-h-[90dvh] p-0 overflow-hidden flex flex-col bg-transparent border-none shadow-none" hideCloseButton>
        <ReviewMobileShell>
          <EventReviewForm
            event={event as any}
            userId={userId}
            onSubmitted={async (review: UserReview) => {
              if (onReviewSubmitted) {
                const result = onReviewSubmitted(review);
                if (result instanceof Promise) {
                  await result;
                }
              }
              onClose();
            }}
            onDeleted={async () => {
              if (onReviewSubmitted) {
                const result = onReviewSubmitted(null as any);
                if (result instanceof Promise) {
                  await result;
                }
              }
              onClose();
            }}
            onClose={onClose}
          />
        </ReviewMobileShell>
      </DialogContent>
    </Dialog>
  );
}
