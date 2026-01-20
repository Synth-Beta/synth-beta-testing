import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PreferencesV4FeedService, type PreferencesV4FeedFilters } from '@/services/preferencesV4FeedService';
import { CompactEventCard } from './CompactEventCard';
import { RefreshCw } from 'lucide-react';
import { SynthLoadingInline, SynthLoader } from '@/components/ui/SynthLoader';
import { Button } from '@/components/ui/button';
import type { PersonalizedEvent } from '@/services/personalizedFeedService';
import type { FilterState } from '@/components/search/EventFilters';
import { UserEventService } from '@/services/userEventService';
import { supabase } from '@/integrations/supabase/client';
import { EventShareModal } from '@/components/events/EventShareModal';
import { ReportContentModal } from '@/components/moderation/ReportContentModal';
import { useToast } from '@/hooks/use-toast';
import { replaceJambasePlaceholder } from '@/utils/eventImageFallbacks';

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
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [flaggedEvent, setFlaggedEvent] = useState<PersonalizedEvent | null>(null);
  const { toast } = useToast();
  const feedRef = useRef<HTMLDivElement>(null);

  const pageSize = 20;

  // Cache configuration
  const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  const CACHE_PREFIX = 'recommendations_';

  // Sort events chronologically by event_date (earliest to latest)
  // Events with missing or invalid dates are sorted to the end
  const sortEventsByDate = (events: PersonalizedEvent[]): PersonalizedEvent[] => {
    return [...events].sort((a, b) => {
      // Helper to get timestamp, or a very large number for invalid/missing dates (pushes to end)
      const getTimestamp = (event: PersonalizedEvent): number => {
        if (!event.event_date) return Number.MAX_SAFE_INTEGER;
        const date = new Date(event.event_date);
        // Check if date is valid (not NaN)
        return isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
      };
      
      const dateA = getTimestamp(a);
      const dateB = getTimestamp(b);
      return dateA - dateB; // Earliest date first (ascending), invalid dates at end
    });
  };

  // Generate cache key from userId and filters
  const getCacheKey = (userId: string, filters?: PreferencesV4FeedFilters | FilterState): string => {
    if (!filters) {
      return `${CACHE_PREFIX}${userId}_default`;
    }

    // Extract filter values, handling both FilterState and PreferencesV4FeedFilters
    const filterState = 'selectedCities' in filters ? filters as FilterState : null;
    const prefFilters = filterState ? null : filters as PreferencesV4FeedFilters;
    
    // Convert dateRange dates to ISO strings for consistent hashing
    let dateRangeHash: { from?: string; to?: string } | undefined;
    if (filterState?.dateRange) {
      dateRangeHash = {
        from: filterState.dateRange.from?.toISOString(),
        to: filterState.dateRange.to?.toISOString(),
      };
    } else if (prefFilters?.dateRange) {
      dateRangeHash = {
        from: prefFilters.dateRange.from?.toISOString(),
        to: prefFilters.dateRange.to?.toISOString(),
      };
    }

    const filterHash = JSON.stringify({
      city: filterState?.selectedCities?.[0] ?? prefFilters?.city,
      latitude: filterState?.latitude ?? prefFilters?.latitude,
      longitude: filterState?.longitude ?? prefFilters?.longitude,
      genres: filterState?.genres ?? prefFilters?.genres,
      radiusMiles: filterState?.radiusMiles ?? prefFilters?.radiusMiles,
      dateRange: dateRangeHash,
      includePast: prefFilters?.includePast,
      maxDaysAhead: prefFilters?.maxDaysAhead,
    });
    
    return `${CACHE_PREFIX}${userId}_${filterHash}`;
  };

  // Get cached recommendations
  const getCachedRecommendations = (cacheKey: string): PersonalizedEvent[] | null => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (!cached) return null;

      const { events, timestamp } = JSON.parse(cached);
      const now = Date.now();
      
      // Check if cache is expired
      if (now - timestamp > CACHE_EXPIRY_MS) {
        localStorage.removeItem(cacheKey);
        return null;
      }

      return events as PersonalizedEvent[];
    } catch (error) {
      console.warn('Error reading cache:', error);
      return null;
    }
  };

  // Save recommendations to cache
  const saveCachedRecommendations = (cacheKey: string, events: PersonalizedEvent[]): void => {
    const cacheData = {
      events,
      timestamp: Date.now(),
    };
    
    try {
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Error saving cache:', error);
      // If storage is full, try to clear old cache entries
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(CACHE_PREFIX)) {
            keysToRemove.push(key);
          }
        }
        // Remove oldest entries first
        keysToRemove.forEach(key => localStorage.removeItem(key));
        // Try saving again
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      } catch (clearError) {
        console.warn('Could not clear cache:', clearError);
      }
    }
  };

  // Load ALL interested events immediately on mount
  const loadAllInterestedEvents = async () => {
    if (!userId) return;
    try {
      // Get ALL events user is interested in (not just the ones in current events list)
      const interestedSet = await UserEventService.getUserInterestedEventIdSet(userId);
      setInterestedEvents(interestedSet);
      console.log('✅ PreferencesV4FeedSection: Loaded all interested events:', interestedSet.size);
    } catch (error) {
      console.error('Error loading all interested events:', error);
    }
  };

  // Load interested events immediately on mount
  useEffect(() => {
    if (userId) {
      loadAllInterestedEvents();
    }
  }, [userId]);

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
      
      // Update user_is_interested flag (interested_count from database excludes current user)
      // Display logic will add 1 when user is interested
      setEvents(prev => prev.map(event => {
        if (event.id === eventId) {
          return {
            ...event,
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

  // Handle flag click
  const handleFlagClick = (event: PersonalizedEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('Flag button clicked for event:', event.id, event.title);
    setFlaggedEvent(event);
    setFlagModalOpen(true);
    console.log('Opening flag modal');
  };

  const loadEvents = async (pageNum: number = 0, append: boolean = false, skipFollowingParam?: boolean, skipCache: boolean = false) => {
    // Declare at function scope so it's accessible in catch/finally blocks
    let showingCachedData = false;
    
    try {
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

      // Check cache only for initial load (pageNum === 0) and when not skipping cache
      const cacheKey = getCacheKey(userId, feedFilters || filters);
      let cachedEvents: PersonalizedEvent[] | null = null;
      
      if (pageNum === 0 && !skipCache && !append) {
        cachedEvents = getCachedRecommendations(cacheKey);
        
        if (cachedEvents && cachedEvents.length > 0) {
          // Show cached data immediately (sorted by date)
          console.log('✅ Loading cached recommendations:', cachedEvents.length, 'events');
          const sortedCached = sortEventsByDate(cachedEvents);
          setEvents(sortedCached);
          setLoading(false); // Don't show loading spinner
          setError(null);
          showingCachedData = true;
          
          // Fetch fresh data in background
          // Continue below to fetch fresh data
        } else {
          // No cache, show loading spinner
          setEvents([]);
          setLoading(true);
        }
      } else if (pageNum === 0 && !append) {
        // Starting fresh load (skipCache is true or no cache)
        setEvents([]);
        setLoading(true);
      } else if (pageNum > 0) {
        // Loading more (pagination)
        setLoadingMore(true);
      }
      
      setError(null);

      // Fetch fresh data
      const result = await PreferencesV4FeedService.getFeedPaginated(
        userId,
        pageNum,
        pageSize,
        feedFilters,
        skipFollowingParam !== undefined ? skipFollowingParam : skipFollowing
      );

      // Update UI with fresh data
      if (append) {
        // Deduplicate events and merge new events at correct chronological positions
        // This preserves existing event positions while inserting new events correctly
        setEvents((prev) => {
          const existingIds = new Set(prev.map(e => e.id));
          const newEvents = result.events.filter(e => !existingIds.has(e.id));
          
          // Sort only the new events chronologically
          const sortedNewEvents = sortEventsByDate(newEvents);
          
          // Helper to get timestamp for comparison
          const getTimestamp = (event: PersonalizedEvent): number => {
            if (!event.event_date) return Number.MAX_SAFE_INTEGER;
            const date = new Date(event.event_date);
            return isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
          };
          
          // Merge new events into existing list at correct chronological positions
          // This maintains stability: existing events keep their relative positions
          const merged: PersonalizedEvent[] = [];
          let newIdx = 0;
          
          for (const existingEvent of prev) {
            const existingTimestamp = getTimestamp(existingEvent);
            
            // Insert all new events that should come before this existing event
            // Use < instead of <= to maintain stable sort: events with equal timestamps
            // should preserve append order (new events come after existing)
            while (newIdx < sortedNewEvents.length) {
              const newTimestamp = getTimestamp(sortedNewEvents[newIdx]);
              if (newTimestamp < existingTimestamp) {
                merged.push(sortedNewEvents[newIdx]);
                newIdx++;
              } else {
                break;
              }
            }
            
            // Add the existing event
            merged.push(existingEvent);
          }
          
          // Append any remaining new events that come after all existing events
          while (newIdx < sortedNewEvents.length) {
            merged.push(sortedNewEvents[newIdx]);
            newIdx++;
          }
          
          return merged;
        });
      } else {
        // Sort events chronologically before setting
        const sortedEvents = sortEventsByDate(result.events);
        setEvents(sortedEvents);
        // Cache the sorted fresh data for next time (only for initial page)
        if (pageNum === 0 && sortedEvents.length > 0) {
          saveCachedRecommendations(cacheKey, sortedEvents);
        }
      }

      setHasMore(result.hasMore);
      setPage(pageNum);
    } catch (err) {
      console.error('Error loading Preferences V4 feed:', err);
      
      // If we had cached data, keep showing it even if fresh fetch failed
      if (showingCachedData) {
        // Silently fail - user already sees cached data
        console.log('⚠️ Background fetch failed, keeping cached data');
        setError(null); // Don't show error if we have cached data
      } else {
        // No cached data, show error
        setError('Failed to load recommendations');
        setLoading(false);
      }
    } finally {
      // Only update loading state if we weren't showing cached data
      if (!showingCachedData || pageNum > 0) {
        setLoading(false);
      }
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

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      loadEvents(page + 1, true);
    }
  }, [loadingMore, hasMore, page]);

  const handleRefresh = useCallback(() => {
    // Clear following-first events and load completely new set
    setSkipFollowing(true);
    // Clear cache for current filter combination
    const cacheKey = getCacheKey(userId, filters);
    localStorage.removeItem(cacheKey);
    setEvents([]);
    setPage(0);
    loadEvents(0, false, true, true); // skipCache = true to force fresh fetch
  }, [userId, filters]);

  // Enhanced iOS-like scrolling behavior with pull-to-refresh and infinite scroll
  useEffect(() => {
    const feedElement = feedRef.current;
    if (!feedElement) return;

    let isScrolling = false;
    let lastScrollTop = feedElement.scrollTop;
    let lastScrollTime = Date.now();
    let touchStartY = 0;
    const pullToRefreshThreshold = 80;
    let isPullingToRefresh = false;
    let pullDistance = 0;

    const handleScroll = () => {
      const now = Date.now();
      const currentScrollTop = feedElement.scrollTop;
      const timeDelta = now - lastScrollTime;
      if (timeDelta > 0) {
        // noop - reserved for future velocity handling
      }

      lastScrollTop = currentScrollTop;
      lastScrollTime = now;

      if (!isScrolling) {
        isScrolling = true;
        feedElement.style.transition = 'none';
      }

      const scrollHeight = feedElement.scrollHeight;
      const clientHeight = feedElement.clientHeight;
      const scrollTop = feedElement.scrollTop;

      if (scrollHeight - scrollTop - clientHeight < 200 && hasMore && !loadingMore && !loading) {
        handleLoadMore();
      }
    };

    const handleScrollEnd = () => {
      isScrolling = false;
      feedElement.style.transition = '';
    };

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
      pullDistance = 0;
      isPullingToRefresh = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touchY = e.touches[0].clientY;
      const deltaY = touchY - touchStartY;

      if (feedElement.scrollTop === 0 && deltaY > 0) {
        e.preventDefault();
        pullDistance = deltaY;
        isPullingToRefresh = true;

        if (pullDistance > pullToRefreshThreshold) {
          feedElement.style.transform = `translateY(${Math.min(pullDistance, 120)}px)`;
        } else {
          feedElement.style.transform = `translateY(${pullDistance}px)`;
        }
      }
    };

    const handleTouchEnd = () => {
      if (isPullingToRefresh && pullDistance > pullToRefreshThreshold) {
        feedElement.style.transform = '';
        feedElement.style.transition = 'transform 0.3s ease';
        handleRefresh();
      } else if (isPullingToRefresh) {
        feedElement.style.transform = '';
        feedElement.style.transition = 'transform 0.3s ease';
      }

      isPullingToRefresh = false;
      pullDistance = 0;
      handleScrollEnd();
    };

    feedElement.addEventListener('scroll', handleScroll, { passive: true });
    feedElement.addEventListener('touchend', handleTouchEnd, { passive: false });
    feedElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    feedElement.addEventListener('touchmove', handleTouchMove, { passive: false });

    let scrollTimeout: NodeJS.Timeout;
    const handleWheel = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(handleScrollEnd, 150);
    };

    feedElement.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      feedElement.removeEventListener('scroll', handleScroll);
      feedElement.removeEventListener('touchend', handleTouchEnd);
      feedElement.removeEventListener('touchstart', handleTouchStart);
      feedElement.removeEventListener('touchmove', handleTouchMove);
      feedElement.removeEventListener('wheel', handleWheel);
      clearTimeout(scrollTimeout);
    };
  }, [events.length, hasMore, loadingMore, loading, handleLoadMore, handleRefresh]);

  // Show loading state only if we have no cached data and no events
  // If we have events (from cache), don't show loading spinner
  if (loading && events.length === 0 && page === 0) {
    return (
      <div className={className}>
        <SynthLoadingInline text="Loading recommendations..." size="md" />
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
    <div className={`swift-ui-feed-container ${className}`}>
      {/* Events Feed - One card per screen with iOS scrolling */}
      {events.length > 0 ? (
        <>
        <div className="swift-ui-feed" ref={feedRef}>
            {events.map((event, index) => {
            // Resolve image URL with priority
            let imageUrl: string | undefined = undefined;
            let isCommunityPhoto = false;
            
            const eventMediaUrl = (event as any).event_media_url;
            const hasOfficialImages = event.images && Array.isArray(event.images) && event.images.length > 0;
            
            if (eventMediaUrl) {
              imageUrl = replaceJambasePlaceholder(eventMediaUrl);
            } else if (hasOfficialImages) {
              const bestImage = event.images.find((img: any) => 
                img?.url && (img?.ratio === '16_9' || (img?.width && img.width > 1000))
              ) || event.images.find((img: any) => img?.url);
              imageUrl = bestImage?.url ? replaceJambasePlaceholder(bestImage.url) : undefined;
            } else if (event.poster_image_url) {
              imageUrl = replaceJambasePlaceholder(event.poster_image_url);
              
              // Only show "Community Photo" tag if:
              // 1. There are NO official images available (we're falling back to user content)
              // 2. The image is from a Supabase storage URL (definitely user-uploaded)
              // 3. It's not a placeholder or external source
              
              const isSupabaseStorageUrl = event.poster_image_url?.includes('/storage/v1/object/public/') || 
                event.poster_image_url?.includes('review-photos') ||
                event.poster_image_url?.includes('supabase.co/storage');
              
              // Check if it's a placeholder (fallback image)
              const isPlaceholder = event.poster_image_url?.includes('/Generic Images/') ||
                event.poster_image_url?.includes('placeholder') ||
                event.poster_image_url?.includes('picsum.photos');
              
              // Only mark as community photo if:
              // - No official images available (falling back to user content)
              // - It's a Supabase storage URL (user-uploaded)
              // - Not a placeholder
              if (!hasOfficialImages && 
                  isSupabaseStorageUrl && 
                  !isPlaceholder) {
                isCommunityPhoto = true;
              }
            }
            
            // Use index in key to ensure uniqueness even if IDs somehow duplicate
            const uniqueKey = `${event.id || 'event'}-${index}`;
            
            return (
              <div key={uniqueKey} className="swift-ui-feed-item">
              <CompactEventCard
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
                interestedCount={(event.interested_count || 0) + ((interestedEvents.has(event.id) || event.user_is_interested) ? 1 : 0)}
                isInterested={interestedEvents.has(event.id) || event.user_is_interested || false}
                isCommunityPhoto={isCommunityPhoto}
                onInterestClick={(e) => handleInterestToggle(event.id, e)}
                onShareClick={(e) => handleShareClick(event, e)}
                onClick={() => onEventClick?.(event.id)}
              />
              </div>
            );
          })}
          {loadingMore && (
            <div className="flex justify-center py-8">
              <SynthLoader variant="spinner" size="sm" />
            </div>
          )}
        </div>
        </>
      ) : (
        <div className="text-center py-6 text-muted-foreground text-sm">
          <p>No personalized recommendations yet.</p>
          <p className="text-xs mt-1">Start following artists or marking events as interested!</p>
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

      {/* Flag/Report Modal */}
      {flagModalOpen && flaggedEvent && (
        <ReportContentModal
          open={flagModalOpen}
          onClose={() => {
            console.log('Closing flag modal');
            setFlagModalOpen(false);
            setFlaggedEvent(null);
          }}
          contentType="event"
          contentId={flaggedEvent.id}
          contentTitle={flaggedEvent.title || 'Event'}
          onReportSubmitted={() => {
            console.log('Report submitted');
            setFlagModalOpen(false);
            setFlaggedEvent(null);
            toast({
              title: 'Report Submitted',
              description: 'Thank you for helping keep our community safe',
            });
          }}
        />
      )}
    </div>
  );
};

