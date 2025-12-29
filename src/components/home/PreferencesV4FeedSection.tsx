import React, { useState, useEffect } from 'react';
import { PreferencesV4FeedService, type PreferencesV4FeedFilters } from '@/services/preferencesV4FeedService';
import { CompactEventCard } from './CompactEventCard';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PersonalizedEvent } from '@/services/personalizedFeedService';
import type { FilterState } from '@/components/search/EventFilters';
import { UserEventService } from '@/services/userEventService';
import { EventShareModal } from '@/components/events/EventShareModal';
import { useToast } from '@/hooks/use-toast';

interface PreferencesV4FeedSectionProps {
  userId: string;
  onEventClick?: (eventId: string) => void;
  filters?: PreferencesV4FeedFilters | FilterState;
  className?: string;
  filterControls?: React.ReactNode;
}

export const PreferencesV4FeedSection: React.FC<PreferencesV4FeedSectionProps> = ({
  userId,
  onEventClick,
  filters,
  className,
  filterControls,
}) => {
  const [events, setEvents] = useState<PersonalizedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [skipFollowing, setSkipFollowing] = useState(false);  // Track if we should skip following-first logic
  const [interestedEvents, setInterestedEvents] = useState<Set<string>>(new Set());
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedEventForShare, setSelectedEventForShare] = useState<PersonalizedEvent | null>(null);
  const { toast } = useToast();

  const pageSize = 20;

  // Load interested events for current user
  const loadInterestedEvents = async () => {
    if (!userId) return;
    try {
      // Get all events user is interested in
      const eventIds = events.map(e => e.id).filter(Boolean);
      if (eventIds.length === 0) return;

      const interestedSet = new Set<string>();
      for (const eventId of eventIds) {
        try {
          const isInterested = await UserEventService.isUserInterested(userId, eventId);
          if (isInterested) {
            interestedSet.add(eventId);
          }
        } catch (error) {
          // Skip if error checking individual event
          console.error(`Error checking interest for event ${eventId}:`, error);
        }
      }
      setInterestedEvents(interestedSet);
    } catch (error) {
      console.error('Error loading interested events:', error);
    }
  };

  // Load interested events when events change
  useEffect(() => {
    if (events.length > 0) {
      loadInterestedEvents();
    }
  }, [events, userId]);

  // Handle interest toggle
  const handleInterestToggle = async (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userId) return;

    const isCurrentlyInterested = interestedEvents.has(eventId);
    const newInterestState = !isCurrentlyInterested;

    // Optimistically update UI
    setInterestedEvents(prev => {
      const next = new Set(prev);
      if (newInterestState) {
        next.add(eventId);
      } else {
        next.delete(eventId);
      }
      return next;
    });

    try {
      await UserEventService.setEventInterest(userId, eventId, newInterestState);
      
      // Update event's interested count optimistically
      setEvents(prev => prev.map(event => {
        if (event.id === eventId) {
          return {
            ...event,
            interested_count: (event.interested_count || 0) + (newInterestState ? 1 : -1),
            user_is_interested: newInterestState,
          };
        }
        return event;
      }));

      toast({
        title: newInterestState ? "You're interested!" : "Interest removed",
        description: newInterestState 
          ? "We'll notify you about this event" 
          : "You'll no longer receive notifications for this event",
      });
    } catch (error) {
      console.error('Error toggling interest:', error);
      // Revert optimistic update
      setInterestedEvents(prev => {
        const next = new Set(prev);
        if (newInterestState) {
          next.delete(eventId);
        } else {
          next.add(eventId);
        }
        return next;
      });
      toast({
        title: "Error",
        description: "Failed to update interest",
        variant: "destructive",
      });
    }
  };

  // Handle share click
  const handleShareClick = (event: PersonalizedEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedEventForShare(event);
    setShareModalOpen(true);
  };

  const loadEvents = async (pageNum: number = 0, append: boolean = false, skipFollowingParam?: boolean) => {
    try {
      if (pageNum === 0) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      // Convert FilterState to PreferencesV4FeedFilters if needed
      let feedFilters: PreferencesV4FeedFilters | undefined;
      if (filters) {
        if ('genres' in filters && 'selectedCities' in filters) {
          // It's a FilterState
          const filterState = filters as FilterState;
          // Prioritize city names over lat/long for backend filtering
          // Use lat/long only if no city name is available
          const selectedCity = filterState.selectedCities && filterState.selectedCities.length > 0 
            ? filterState.selectedCities[0] 
            : undefined;
          
          if (selectedCity) {
            // Use city name for backend filtering
          feedFilters = {
            city: selectedCity,
            genres: filterState.genres,
            dateRange: filterState.dateRange,
            includePast: false,
            maxDaysAhead: filterState.dateRange?.to 
              ? Math.ceil((filterState.dateRange.to.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
              : 90,
            radiusMiles: filterState.radiusMiles,
          };
          } else if (filterState.latitude && filterState.longitude) {
            // Fallback to lat/long if no city name available
            // The service will reverse geocode this to a city name for backend filtering
            feedFilters = {
              latitude: filterState.latitude,
              longitude: filterState.longitude,
              genres: filterState.genres,
              dateRange: filterState.dateRange,
              includePast: false,
              maxDaysAhead: filterState.dateRange?.to 
                ? Math.ceil((filterState.dateRange.to.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                : 90,
              radiusMiles: filterState.radiusMiles,
            };
          } else {
            // No location filter
            feedFilters = {
              genres: filterState.genres,
              dateRange: filterState.dateRange,
              includePast: false,
              maxDaysAhead: filterState.dateRange?.to 
                ? Math.ceil((filterState.dateRange.to.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                : 90,
              radiusMiles: filterState.radiusMiles,
            };
          }
        } else {
          // It's already PreferencesV4FeedFilters
          feedFilters = filters as PreferencesV4FeedFilters;
        }
      }

      const result = await PreferencesV4FeedService.getFeedPaginated(
        userId,
        pageNum,
        pageSize,
        feedFilters,
        skipFollowingParam !== undefined ? skipFollowingParam : skipFollowing
      );

      if (append) {
        // Deduplicate events by ID to prevent duplicate keys
        setEvents((prev) => {
          const existingIds = new Set(prev.map(e => e.id));
          const newEvents = result.events.filter(e => !existingIds.has(e.id));
          return [...prev, ...newEvents];
        });
      } else {
        setEvents(result.events);
      }

      setHasMore(result.hasMore);
      setPage(pageNum);
    } catch (err) {
      console.error('Error loading Preferences V4 feed:', err);
      setError('Failed to load recommendations');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadEvents(0, false);
  }, [
    userId, 
    filters && 'city' in filters ? filters.city : undefined,
    filters && 'selectedCities' in filters ? (filters as FilterState).selectedCities : undefined,
    filters && 'latitude' in filters ? (filters as FilterState).latitude : undefined,
    filters && 'longitude' in filters ? (filters as FilterState).longitude : undefined,
    filters && 'radiusMiles' in filters ? (filters as FilterState).radiusMiles : undefined,
    filters && 'genres' in filters ? (filters as FilterState).genres : undefined,
    filters && 'dateRange' in filters ? (filters as FilterState).dateRange : undefined,
    filters && 'includePast' in filters ? (filters as PreferencesV4FeedFilters).includePast : undefined,
    filters && 'maxDaysAhead' in filters ? (filters as PreferencesV4FeedFilters).maxDaysAhead : undefined,
  ]);

  const handleRefresh = () => {
    // Clear following-first events and load completely new set
    setSkipFollowing(true);
    setEvents([]);
    setPage(0);
    loadEvents(0, false, true);
  };

  if (loading && events.length === 0) {
    return (
      <div className={`flex items-center justify-center py-6 ${className}`}>
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && events.length === 0) {
    return (
      <div className={`text-center py-6 text-muted-foreground text-sm ${className}`}>
        <p>{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadEvents(0, false)}
          className="mt-2"
        >
          Try Again
        </Button>
      </div>
    );
  }

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      loadEvents(page + 1, true);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Events Grid - Vertical Layout */}
      {events.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {events.map((event, index) => {
            // Resolve image URL with priority
            let imageUrl: string | undefined = undefined;
            
            if (event.poster_image_url) {
              imageUrl = event.poster_image_url;
            } else if (event.images && Array.isArray(event.images) && event.images.length > 0) {
              const bestImage = event.images.find((img: any) => 
                img?.url && (img?.ratio === '16_9' || (img?.width && img.width > 1000))
              ) || event.images.find((img: any) => img?.url);
              imageUrl = bestImage?.url;
            }
            
            // Use index in key to ensure uniqueness even if IDs somehow duplicate
            const uniqueKey = `${event.id || 'event'}-${index}`;
            
            return (
                <CompactEventCard
                key={uniqueKey}
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
                interestedCount={event.interested_count || 0}
                isInterested={interestedEvents.has(event.id) || event.user_is_interested || false}
                onInterestClick={(e) => handleInterestToggle(event.id, e)}
                onShareClick={(e) => handleShareClick(event, e)}
                  onClick={() => onEventClick?.(event.id)}
                />
            );
          })}
        </div>
      ) : (
        <div className="text-center py-6 text-muted-foreground text-sm">
          <p>No personalized recommendations yet.</p>
          <p className="text-xs mt-1">Start following artists or marking events as interested!</p>
        </div>
      )}

      {/* Load More Button */}
      {events.length > 0 && hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="flex items-center gap-2"
          >
            {loadingMore ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </Button>
        </div>
      )}

      {/* Share Modal */}
      {selectedEventForShare && (
        <EventShareModal
          event={selectedEventForShare as any}
          currentUserId={userId}
          isOpen={shareModalOpen}
          onClose={() => {
            setShareModalOpen(false);
            setSelectedEventForShare(null);
          }}
        />
      )}
    </div>
  );
};

