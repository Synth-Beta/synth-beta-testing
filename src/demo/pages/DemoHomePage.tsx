/**
 * Demo Home Page - Same layout and components as production HomeFeed
 * 
 * Uses same UI components (CompactEventCard, SwiftUIReviewCard, etc.) but with hardcoded mock data.
 * NO API calls - all data is from mockData.ts
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileHeader } from '@/components/Header/MobileHeader';
import { CompactEventCard } from '@/components/home/CompactEventCard';
import { SwiftUIReviewCard } from '@/components/reviews/SwiftUIReviewCard';
import type { ReviewWithEngagement } from '@/services/reviewService';
import { DEMO_USER, DEMO_EVENTS, DEMO_REVIEWS } from '../data/mockData';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import type { PersonalizedEvent } from '@/services/personalizedFeedService';

interface DemoHomePageProps {
  menuOpen?: boolean;
  onMenuClick?: () => void;
  onNavigate?: (page: 'home' | 'discover' | 'profile' | 'messages' | 'create-post') => void;
}

export const DemoHomePage: React.FC<DemoHomePageProps> = ({
  menuOpen = false,
  onMenuClick,
  onNavigate,
}) => {
  const navigate = useNavigate();
  const [selectedFeedType, setSelectedFeedType] = useState('recommended');
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [selectedEventInterested, setSelectedEventInterested] = useState(false);

  const feedTypes = [
    { value: 'recommended', label: 'Hand Picked Events' },
    { value: 'trending', label: 'Trending' },
    { value: 'friends', label: 'Friends' },
    { value: 'reviews', label: 'Reviews' },
  ];

  const handleEventClick = (eventId: string) => {
    const event = DEMO_EVENTS.find(e => e.id === eventId);
    if (event) {
      setSelectedEvent(event);
      setSelectedEventInterested(false);
      setEventDetailsOpen(true);
    }
  };

  const handleInterestToggle = async (eventId: string, interested: boolean) => {
    console.log('Demo: Toggle interest', eventId, interested);
    setSelectedEventInterested(interested);
  };

  const handleAttendanceToggle = async (eventId: string, attended: boolean) => {
    console.log('Demo: Toggle attendance', eventId, attended);
  };

  // Convert demo events to PersonalizedEvent format
  const demoPersonalizedEvents: PersonalizedEvent[] = DEMO_EVENTS.map(event => ({
    id: event.id,
    title: event.title,
    artist_name: event.artist_name,
    venue_name: event.venue_name,
    venue_city: event.venue_city,
    event_date: event.event_date,
    poster_image_url: event.poster_image_url,
    images: event.images,
    price_range: event.price_range,
    genres: event.genres,
    interested_count: Math.floor(Math.random() * 50),
    user_is_interested: false,
  }));

  // Convert demo reviews to ReviewWithEngagement format for SwiftUIReviewCard
  const demoNetworkReviews = DEMO_REVIEWS.slice(0, 10).map(review => {
    const event = DEMO_EVENTS.find(e => e.id === review.event_id);
    return {
      review: {
        id: review.id,
        user_id: DEMO_USER.id,
        event_id: review.event_id,
        rating: review.rating,
        review_text: review.review_text || '',
        is_public: true,
        created_at: review.created_at,
        updated_at: review.created_at,
        likes_count: 0,
        comments_count: 0,
        shares_count: 0,
        is_liked_by_user: false,
        reaction_emoji: '',
        photos: review.photos || [],
        videos: [],
        mood_tags: [],
        genre_tags: [],
        context_tags: [],
        artist_name: event?.artist_name,
        venue_name: event?.venue_name,
      } as ReviewWithEngagement,
      userProfile: {
        name: DEMO_USER.name,
        avatar_url: DEMO_USER.avatar_url || undefined,
      },
    };
  });

  return (
    <div
      className="min-h-screen" style={{ backgroundColor: 'var(--neutral-50)' }}
    >
      {/* Mobile Header with dropdown - EXACT same as production */}
      <MobileHeader menuOpen={menuOpen} onMenuClick={onMenuClick}>
        <div className="flex justify-center w-full">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="flex items-center gap-2"
                style={{ backgroundColor: 'var(--neutral-50)', color: 'var(--neutral-900)' }}
                data-tour="feed-toggle"
              >
                <span
                  style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                    color: 'var(--neutral-900)'
                  }}
                >
                  {feedTypes.find(ft => ft.value === selectedFeedType)?.label || 'Hand Picked Events'}
                </span>
                <ChevronDown className="h-4 w-4" style={{ color: 'var(--neutral-900)' }} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="" style={{ backgroundColor: 'var(--neutral-50)' }}>
              {feedTypes.map((feedType) => (
                <DropdownMenuItem
                  key={feedType.value}
                  onClick={() => setSelectedFeedType(feedType.value)}
                >
                  {feedType.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </MobileHeader>

      {/* Feed Content - EXACT same structure as production */}
      <div className="max-w-7xl mx-auto" style={{ paddingLeft: 'var(--spacing-screen-margin-x, 20px)', paddingRight: 'var(--spacing-screen-margin-x, 20px)', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 68px + 12px)', paddingBottom: 'var(--spacing-bottom-nav, 32px)' }}>
        {selectedFeedType === 'recommended' && (
          <div className="space-y-4">
            {/* Events Grid - EXACT same as PreferencesV4FeedSection */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {demoPersonalizedEvents.map((event, index) => {
                // Resolve image URL with priority - EXACT same logic as production
                let imageUrl: string | undefined = undefined;
                let isCommunityPhoto = false;
                
                // Check if there are any official images available (Ticketmaster/external sources)
                const hasOfficialImages = event.images && Array.isArray(event.images) && event.images.length > 0;
                
                if (event.poster_image_url) {
                  imageUrl = event.poster_image_url;
                  // Check if this is a community photo (from user review)
                  // For demo: Arctic Monkeys event (event-3) should show as community photo
                  // (Special case for demo purposes - simulates user-uploaded photo)
                  if (event.id === 'event-3') {
                    // Only show if no official images (simulating fallback scenario)
                    if (!hasOfficialImages) {
                      isCommunityPhoto = true;
                    }
                  } else {
                    // Use same strict detection logic as production
                    const isSupabaseStorageUrl = event.poster_image_url?.includes('/storage/v1/object/public/') || 
                      event.poster_image_url?.includes('review-photos') ||
                      event.poster_image_url?.includes('supabase.co/storage');
                    
                    const isEventMediaUrl = (event as any).event_media_url && 
                      event.poster_image_url === (event as any).event_media_url;
                    
                    const isPlaceholder = event.poster_image_url?.includes('/Generic Images/') ||
                      event.poster_image_url?.includes('placeholder') ||
                      event.poster_image_url?.includes('picsum.photos');
                    
                    const isInImagesArray = hasOfficialImages && 
                      event.images.some((img: any) => img?.url === event.poster_image_url);
                    
                    // Only mark as community photo if no official images and it's a user-uploaded photo
                    if (!hasOfficialImages && 
                        isSupabaseStorageUrl && 
                        !isPlaceholder && 
                        !isEventMediaUrl && 
                        !isInImagesArray) {
                      isCommunityPhoto = true;
                    }
                  }
                } else if (hasOfficialImages) {
                  const bestImage = event.images.find((img: any) => 
                    img?.url && (img?.ratio === '16_9' || (img?.width && img.width > 1000))
                  ) || event.images.find((img: any) => img?.url);
                  imageUrl = bestImage?.url;
                }
                
                return (
                  <CompactEventCard
                    key={`${event.id}-${index}`}
                    event={{
                      id: event.id || '',
                      title: event.title || event.artist_name || 'Event',
                      artist_name: event.artist_name,
                      venue_name: event.venue_name,
                      event_date: event.event_date,
                      venue_city: event.venue_city || undefined,
                      image_url: imageUrl,
                      poster_image_url: event.poster_image_url || undefined,
                    }}
                    interestedCount={(event.interested_count || 0) + (event.user_is_interested ? 1 : 0)}
                    isInterested={event.user_is_interested || false}
                    isCommunityPhoto={isCommunityPhoto}
                    onClick={() => handleEventClick(event.id)}
                  />
                );
              })}
            </div>
          </div>
        )}
        {selectedFeedType === 'trending' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {DEMO_EVENTS.slice(0, 12).map((event) => {
                // Arctic Monkeys event should show community photo tag
                // For demo: Arctic Monkeys event (event-3) should show as community photo
                // Only show if no official images (simulating fallback scenario)
                const hasOfficialImages = event.images && Array.isArray(event.images) && event.images.length > 0;
                const isCommunityPhoto = event.id === 'event-3' && !hasOfficialImages;
                return (
                  <CompactEventCard
                    key={event.id}
                    event={{
                      id: event.id,
                      title: event.title,
                      artist_name: event.artist_name,
                      venue_name: event.venue_name,
                      event_date: event.event_date,
                      venue_city: event.venue_city,
                      image_url: event.poster_image_url,
                      poster_image_url: event.poster_image_url,
                    }}
                    isCommunityPhoto={isCommunityPhoto}
                    onClick={() => handleEventClick(event.id)}
                  />
                );
              })}
            </div>
          </div>
        )}
        {selectedFeedType === 'friends' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {DEMO_EVENTS.slice(0, 12).map((event) => {
                // Arctic Monkeys event should show community photo tag
                // For demo: Arctic Monkeys event (event-3) should show as community photo
                // Only show if no official images (simulating fallback scenario)
                const hasOfficialImages = event.images && Array.isArray(event.images) && event.images.length > 0;
                const isCommunityPhoto = event.id === 'event-3' && !hasOfficialImages;
                return (
                  <CompactEventCard
                    key={event.id}
                    event={{
                      id: event.id,
                      title: event.title,
                      artist_name: event.artist_name,
                      venue_name: event.venue_name,
                      event_date: event.event_date,
                      venue_city: event.venue_city,
                      image_url: event.poster_image_url,
                      poster_image_url: event.poster_image_url,
                    }}
                    isCommunityPhoto={isCommunityPhoto}
                    onClick={() => handleEventClick(event.id)}
                  />
                );
              })}
            </div>
          </div>
        )}
        {selectedFeedType === 'reviews' && (
          <div className="space-y-4">
            <div className="space-y-3">
              {demoNetworkReviews.map((item) => (
                <SwiftUIReviewCard
                  key={item.review.id}
                  review={item.review}
                  mode="compact"
                  userProfile={item.userProfile}
                  onOpenDetail={() => console.log('Demo: Review clicked', item.review.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Event Details Modal - EXACT same as production */}
      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent as any}
          currentUserId={DEMO_USER.id}
          isOpen={eventDetailsOpen}
          onClose={() => setEventDetailsOpen(false)}
          onInterestToggle={handleInterestToggle}
          onAttendanceChange={handleAttendanceToggle}
          isInterested={selectedEventInterested}
          hasReviewed={false}
        />
      )}
    </div>
  );
};
