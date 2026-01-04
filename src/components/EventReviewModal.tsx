import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-[393px] w-full mx-auto h-[90dvh] max-h-[90dvh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
          <DialogTitle className="text-base sm:text-lg font-semibold text-center">Share Your Concert Experience</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6 w-full max-w-full overflow-x-hidden">
          <div className="w-full max-w-full mx-auto">
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
