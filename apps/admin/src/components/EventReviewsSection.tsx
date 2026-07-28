import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EventReviewModal } from './EventReviewModal';
import { ReviewList } from './ReviewList';
import { PublicReviewList } from './PublicReviewList';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Star, MessageSquare } from 'lucide-react';
import type { JamBaseEvent } from '@/services/jambaseEventsService';

interface EventReviewsSectionProps {
  event: JamBaseEvent;
  userId?: string;
  onReviewSubmitted?: (reviewId: string) => void;
}

export function EventReviewsSection({
  event,
  userId,
  onReviewSubmitted
}: EventReviewsSectionProps) {
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'reviews' | 'public'>('reviews');

  const handleReviewSubmitted = (review: any) => {
    setIsReviewModalOpen(false);
    if (onReviewSubmitted) {
      onReviewSubmitted(review.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Reviews</h2>
          <p className="text-gray-600">See what others thought about this event</p>
        </div>
        {userId && (
          <Button
            onClick={() => setIsReviewModalOpen(true)}
            className="bg-blue-500 hover:bg-blue-600"
          >
            <Star className="w-4 h-4 mr-2" />
            Write Review
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'reviews' | 'public')}>
        <TabsList>
          <TabsTrigger value="reviews" className="flex items-center space-x-2">
            <MessageSquare className="w-4 h-4" />
            <span>Event Reviews</span>
          </TabsTrigger>
          <TabsTrigger value="public" className="flex items-center space-x-2">
            <Star className="w-4 h-4" />
            <span>All Reviews</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reviews" className="mt-6">
          <ReviewList
            eventId={event.id}
            currentUserId={userId}
            showEventInfo={false}
          />
        </TabsContent>

        <TabsContent value="public" className="mt-6">
          <PublicReviewList
            eventId={event.id}
            currentUserId={userId}
          />
        </TabsContent>
      </Tabs>

      {/* Review Modal */}
      {userId && (
        <EventReviewModal
          event={event}
          userId={userId}
          isOpen={isReviewModalOpen}
          onClose={() => setIsReviewModalOpen(false)}
          onReviewSubmitted={handleReviewSubmitted}
        />
      )}
    </div>
  );
}
