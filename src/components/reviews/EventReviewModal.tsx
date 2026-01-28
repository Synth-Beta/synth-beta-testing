import React from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { JamBaseEvent } from '@/types/eventTypes';
import type { UserReview, PublicReviewWithProfile } from '@/services/reviewService';
import { EventReviewForm } from './EventReviewForm.tsx';
import { ReviewMobileShell } from './ReviewMobileShell';
import { X } from 'lucide-react';

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

  const isEditFlow =
    !!(event as any)?.existing_review_id || !!(event as any)?.existing_review;

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl w-[98vw] h-[90dvh] max-h-[90dvh] p-0 overflow-hidden flex flex-col bg-transparent border-none shadow-none" hideCloseButton>
        {/* Accessible dialog title/description for screen readers */}
        <DialogTitle className="sr-only">
          {isEditFlow ? 'Edit review' : 'Write a review'}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {isEditFlow
            ? 'Edit your concert review details before saving changes.'
            : 'Fill out the concert review form to share your experience.'}
        </DialogDescription>
        {isEditFlow ? (
          <div className="relative flex-1 overflow-y-auto bg-[#fcfcfc]">
            {/* Close X (matches default dialog close affordance) */}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              style={{
                position: 'absolute',
                top: 'var(--spacing-screen-margin-x, 20px)',
                right: 'var(--spacing-screen-margin-x, 20px)',
                width: '44px',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                margin: 0,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                zIndex: 10,
              }}
            >
              <X size={24} style={{ color: 'var(--neutral-900)' }} aria-hidden="true" />
            </button>

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
          </div>
        ) : (
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
        )}
      </DialogContent>
    </Dialog>
  );
}
