import React, { useState, useEffect } from 'react';
import { PreferencesV4FeedService, type PreferencesV4FeedFilters } from '@/services/preferencesV4FeedService';
import { CompactEventCard } from './CompactEventCard';
import { Loader2, Sparkles, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PersonalizedEvent } from '@/services/personalizedFeedService';
import type { FilterState } from '@/components/search/EventFilters';

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

  const pageSize = 20;

  const loadEvents = async (pageNum: number = 0, append: boolean = false) => {
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
          const selectedCity = filterState.selectedCities && filterState.selectedCities.length > 0 
            ? filterState.selectedCities[0] 
            : undefined;
          feedFilters = {
            city: selectedCity,
            genres: filterState.genres,
            dateRange: filterState.dateRange,
            includePast: false,
            maxDaysAhead: filterState.dateRange?.to 
              ? Math.ceil((filterState.dateRange.to.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
              : 90,
          };
        } else {
          // It's already PreferencesV4FeedFilters
          feedFilters = filters as PreferencesV4FeedFilters;
        }
      }

      const result = await PreferencesV4FeedService.getFeedPaginated(
        userId,
        pageNum,
        pageSize,
        feedFilters
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
    filters && 'genres' in filters ? (filters as FilterState).genres : undefined,
    filters && 'dateRange' in filters ? (filters as FilterState).dateRange : undefined,
    filters && 'includePast' in filters ? (filters as PreferencesV4FeedFilters).includePast : undefined,
    filters && 'maxDaysAhead' in filters ? (filters as PreferencesV4FeedFilters).maxDaysAhead : undefined,
  ]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      loadEvents(page + 1, true);
    }
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

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Events Grid */}
      {events.length > 0 ? (
        <div className="overflow-x-auto pb-2 scrollbar-hide">
          <div className="flex gap-3" style={{ width: 'max-content' }}>
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
                onClick={() => onEventClick?.(event.id)}
              />
            );
          })}
          </div>
        </div>
      ) : (
        <div className="text-center py-6 text-muted-foreground text-sm">
          <p>No personalized recommendations yet.</p>
          <p className="text-xs mt-1">Start following artists or marking events as interested!</p>
        </div>
      )}

      {/* Filters on their own row - always visible */}
      {filterControls && (
        <div className={`pt-4 ${events.length > 0 ? 'border-t' : ''}`}>
          {filterControls}
        </div>
      )}

      {/* Load More Button - on its own row, centered */}
      {hasMore && (
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
              <>
                Load More
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      )}

      {/* End of Feed Message */}
      {!hasMore && events.length > 0 && (
        <div className="text-center py-4 text-muted-foreground text-xs">
          <p>You've reached the end of your recommendations</p>
        </div>
      )}
    </div>
  );
};

