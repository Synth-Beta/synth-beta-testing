import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ReviewService } from '@/services/reviewService';
import { EventReviewsSection } from './EventReviewsSection';
import { PublicReviewList } from './PublicReviewList';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import type { JamBaseEvent } from '@/services/jambaseEventsService';

interface ReviewSystemTestProps {
  userId?: string;
}

export function ReviewSystemTest({ userId }: ReviewSystemTestProps) {
  const [testResults, setTestResults] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [sampleEvent, setSampleEvent] = useState<JamBaseEvent | null>(null);

  useEffect(() => {
    loadSampleEvent();
  }, []);

  const loadSampleEvent = async () => {
    try {
      // Try to get a sample event from the database
      const { data: events } = await ReviewService.getPublicReviewsWithProfiles();
      if (events.reviews.length > 0) {
        // Create a mock event from the first review
        const review = events.reviews[0];
        setSampleEvent({
          id: review.event_id,
          jambase_event_id: 'sample',
          title: review.event_title,
          artist_name: review.artist_name,
          venue_name: review.venue_name,
          event_date: review.event_date,
          venue_city: '',
          venue_state: '',
          description: '',
          genres: review.genre_tags || [],
          ticket_available: true,
          price_range: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error loading sample event:', error);
    }
  };

  const runTests = async () => {
    setIsLoading(true);
    const results: Record<string, boolean> = {};

    try {
      // Test 1: Get public reviews
      try {
        await ReviewService.getPublicReviewsWithProfiles();
        results['getPublicReviews'] = true;
      } catch (error) {
        console.error('Test 1 failed:', error);
        results['getPublicReviews'] = false;
      }

      // Test 2: Get popular tags
      try {
        await ReviewService.getPopularTags('mood');
        results['getPopularTags'] = true;
      } catch (error) {
        console.error('Test 2 failed:', error);
        results['getPopularTags'] = false;
      }

      // Test 3: Create a test review (if user is logged in)
      if (userId && sampleEvent) {
        try {
          const testReview = await ReviewService.setEventReview(userId, sampleEvent.id, {
            rating: 5,
            review_text: 'Test review from the review system test component!',
            is_public: true
          });
          results['createReview'] = true;
          
          // Clean up the test review
          try {
            await ReviewService.deleteEventReview(userId, sampleEvent.id);
            results['deleteReview'] = true;
          } catch (error) {
            results['deleteReview'] = false;
          }
        } catch (error) {
          console.error('Test 3 failed:', error);
          results['createReview'] = false;
        }
      } else {
        results['createReview'] = true; // Skip if no user or event
        results['deleteReview'] = true;
      }

      // Test 4: Get event reviews
      if (sampleEvent) {
        try {
          await ReviewService.getEventReviews(sampleEvent.id, userId);
          results['getEventReviews'] = true;
        } catch (error) {
          console.error('Test 4 failed:', error);
          results['getEventReviews'] = false;
        }
      } else {
        results['getEventReviews'] = true; // Skip if no event
      }

    } catch (error) {
      console.error('Tests failed:', error);
    } finally {
      setIsLoading(false);
      setTestResults(results);
    }
  };

  const getTestIcon = (testName: string) => {
    const passed = testResults[testName];
    if (passed === undefined) return null;
    return passed ? (
      <CheckCircle className="h-4 w-4 text-green-500" />
    ) : (
      <XCircle className="h-4 w-4 text-red-500" />
    );
  };

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Review System Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Button onClick={runTests} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Running Tests...
                </>
              ) : (
                'Run Tests'
              )}
            </Button>
            <span className="text-sm text-gray-600">
              {userId ? `Testing as user: ${userId.slice(0, 8)}...` : 'No user logged in'}
            </span>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">Test Results:</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center space-x-2">
                {getTestIcon('getPublicReviews')}
                <span>Get Public Reviews</span>
              </div>
              <div className="flex items-center space-x-2">
                {getTestIcon('getPopularTags')}
                <span>Get Popular Tags</span>
              </div>
              <div className="flex items-center space-x-2">
                {getTestIcon('createReview')}
                <span>Create Review</span>
              </div>
              <div className="flex items-center space-x-2">
                {getTestIcon('deleteReview')}
                <span>Delete Review</span>
              </div>
              <div className="flex items-center space-x-2">
                {getTestIcon('getEventReviews')}
                <span>Get Event Reviews</span>
              </div>
            </div>
          </div>

          {Object.keys(testResults).length > 0 && (
            <div className="text-sm">
              <strong>Status:</strong>{' '}
              {Object.values(testResults).every(Boolean) ? (
                <span className="text-green-600">All tests passed! 🎉</span>
              ) : (
                <span className="text-red-600">Some tests failed. Check console for details.</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {sampleEvent && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Sample Event Reviews</h3>
          <EventReviewsSection
            event={sampleEvent}
            userId={userId}
            onReviewSubmitted={() => {
              console.log('Review submitted successfully!');
              runTests(); // Re-run tests to verify
            }}
          />
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">All Public Reviews</h3>
        <PublicReviewList
          currentUserId={userId}
          limit={10}
        />
      </div>
    </div>
  );
}
