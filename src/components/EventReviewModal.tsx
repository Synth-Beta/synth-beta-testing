import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { JamBaseEvent } from '@/services/jambaseEventsService';
import type { UserReview, PublicReviewWithProfile } from '@/services/reviewService';
import { EventReviewForm } from '@/components/reviews/EventReviewForm';

interface EventReviewModalProps {
  event: JamBaseEvent | PublicReviewWithProfile | null;
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onReviewSubmitted?: (review: UserReview) => void;
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
      <DialogContent className="max-w-3xl w-[95vw] h-[90dvh] max-h-[90dvh] md:max-h-[85vh] p-0 overflow-hidden flex flex-col" aria-describedby={undefined}>
        <DialogHeader className="px-6 py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">Share Your Concert Experience</DialogTitle>
            <Button variant="ghost" size="sm" onClick={handleClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
          <div className="max-w-2xl mx-auto">
            <EventReviewForm
              event={event as any}
              userId={userId}
              onSubmitted={(review: UserReview) => {
                if (onReviewSubmitted) onReviewSubmitted(review);
                onClose();
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
