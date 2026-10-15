import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';

import { format, startOfMonth } from 'date-fns';
import type { JamBaseEvent } from '@/types/eventTypes';
import { supabase } from '@/integrations/supabase/client';
import type { VibeFilters } from '@/services/discoverVibeService';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { UserEventService } from '@/services/userEventService';
import { SynthLoadingInline } from '@/components/ui/SynthLoader';

/**
 * Hard row cap PostgREST applies to every response on this project. Asking
 * get_calendar_events for more than this returns nothing extra, but the no-location
 * branch then sorts/spills the larger set and trips the statement timeout
 * (measured: 3.1s timeout at p_limit 10000 vs 0.39s at 1000).
 */
const POSTGREST_MAX_ROWS = 1000;

interface MapCalendarTourSectionProps {
  currentUserId: string;
  filters?: VibeFilters;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
  /** Opens the shared Discover event page (hides the search header). */
  onOpenEvent?: (event: JamBaseEvent) => void;
}

export const MapCalendarTourSection: React.FC<MapCalendarTourSectionProps> = ({
  currentUserId,
  filters,
  onNavigateToProfile,
  onNavigateToChat,
  onOpenEvent,
}) => {
  
  // Calendar view state
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [calendarEvents, setCalendarEvents] = useState<Map<string, JamBaseEvent[]>>(new Map());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedDateEvents, setSelectedDateEvents] = useState<JamBaseEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  
  const [selectedEvent, setSelectedEvent] = useState<JamBaseEvent | null>(null);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [interestedEvents, setInterestedEvents] = useState<Set<string>>(new Set());
  const [eventInterestedCounts, setEventInterestedCounts] = useState<Map<string, number>>(new Map());

  // Track the last filter key to prevent unnecessary reloads
  const lastFilterKeyRef = useRef<string>('');
  const hasLoadedOnceRef = useRef(false);

  // Memoize loadCalendarEvents to prevent unnecessary re-renders
  const loadCalendarEvents = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0); // Start of today

      // Scope the load to the month on screen. PostgREST caps responses at 1000 rows and
      // get_calendar_events has no upper date bound, so "everything from today" only ever
      // reached as far as 1000 events stretch — roughly four weeks in a dense market,
      // which left later months rendering as an empty grid.
      const monthStart = startOfMonth(calendarDate);
      const now = monthStart > todayStart ? monthStart : todayStart;

      console.log('📅 [CALENDAR] Loading events for', format(monthStart, 'yyyy-MM'));
      
      let filteredEvents: JamBaseEvent[] = [];

      // Use RPC function that properly uses spatial index with BETWEEN operator
      // This is much faster than PostgREST query builder which doesn't use the index efficiently
      if (filters?.latitude && filters?.longitude && filters?.radiusMiles) {
        console.log('📅 [CALENDAR] Using RPC function with spatial index');
        
        const singleUmbrella = filters?.genres?.length === 1
          ? filters.genres[0].toLowerCase().replace(/\s+/g, '-').replace(/\s*&\s*/g, '-')
          : null;
        const { data: events, error } = await supabase.rpc('get_calendar_events', {
          p_latitude: filters.latitude,
          p_longitude: filters.longitude,
          p_radius_miles: filters.radiusMiles,
          p_min_date: now.toISOString(),
          p_genres: singleUmbrella ? null : (filters?.genres && filters.genres.length > 0 ? filters.genres : null),
          p_limit: POSTGREST_MAX_ROWS,
          p_umbrella_slug: singleUmbrella,
          p_max_depth: 5
        });

        if (error) throw error;

        // RPC function already filters by exact distance, just use the results
        filteredEvents = (events || []) as JamBaseEvent[];

        console.log(`📅 [CALENDAR] Loaded ${filteredEvents.length} events within ${filters.radiusMiles} miles (using spatial index)`);
      } else if (filters?.cities && filters.cities.length > 0) {
        // Fallback to city name filtering if no coordinates
        // Use direct query for city filtering (not using spatial index)
        let query = supabase
          .from('events')
          .select('*')
          .gte('event_date', now.toISOString())
          .in('venue_city', filters.cities);

        // Apply genre filters if present
        if (filters?.genres && filters.genres.length > 0) {
          query = query.overlaps('genres', filters.genres);
          console.log('📅 [CALENDAR] Applied genre filters:', filters.genres);
        }

        const { data, error } = await query
          .order('event_date', { ascending: true })
          .limit(10000); // Load all events (high limit for calendar view)

        if (error) throw error;
        filteredEvents = (data || []) as JamBaseEvent[];
        console.log('📅 [CALENDAR] City filter:', filteredEvents.length, 'events');
      } else {
        // No location filter - use RPC function without location params
        console.log('📅 [CALENDAR] Using RPC function without location filter');
        
        const singleUmbrellaNoLoc = filters?.genres?.length === 1
          ? filters.genres[0].toLowerCase().replace(/\s+/g, '-').replace(/\s*&\s*/g, '-')
          : null;
        const { data, error } = await supabase.rpc('get_calendar_events', {
          p_latitude: null,
          p_longitude: null,
          p_radius_miles: null,
          p_min_date: now.toISOString(),
          p_genres: singleUmbrellaNoLoc ? null : (filters?.genres && filters.genres.length > 0 ? filters.genres : null),
          p_limit: POSTGREST_MAX_ROWS,
          p_umbrella_slug: singleUmbrellaNoLoc,
          p_max_depth: 5
        });

        if (error) throw error;
        filteredEvents = (data || []) as JamBaseEvent[];
        console.log('📅 [CALENDAR] No location filter:', filteredEvents.length, 'events');
      }

      console.log(`📅 [CALENDAR] Final count: ${filteredEvents.length} events`);

      // Group events by date
      const eventsByDate = new Map<string, JamBaseEvent[]>();
      filteredEvents.forEach((event: any) => {
        const eventDate = new Date(event.event_date);
        const dateKey = format(eventDate, 'yyyy-MM-dd');
        if (!eventsByDate.has(dateKey)) {
          eventsByDate.set(dateKey, []);
        }
        eventsByDate.get(dateKey)!.push(event as JamBaseEvent);
      });

      console.log(`📅 [CALENDAR] Grouped events into ${eventsByDate.size} unique dates`);
      // Merge rather than replace, so months already loaded survive navigating back.
      setCalendarEvents(prev => {
        const merged = new Map(prev);
        eventsByDate.forEach((events, dateKey) => merged.set(dateKey, events));
        return merged;
      });
    } catch (error) {
      console.error('Error loading calendar events:', error);
    } finally {
      setCalendarLoading(false);
    }
  }, [filters?.latitude, filters?.longitude, filters?.radiusMiles, filters?.cities, filters?.genres, calendarDate]);

  // Load calendar events
  useEffect(() => {
    // Create a stable key from filter values
    const filterKey = JSON.stringify({
      lat: filters?.latitude,
      lng: filters?.longitude,
      radius: filters?.radiusMiles,
      cities: filters?.cities,
      genres: filters?.genres,
      // The load is scoped to the displayed month, so changing month is a real reload.
      month: format(startOfMonth(calendarDate), 'yyyy-MM'),
    });

    // Only reload if filters actually changed
    if (filterKey === lastFilterKeyRef.current) {
      return;
    }

    const hasLocationFilters = filters?.latitude && filters?.longitude && filters?.radiusMiles;
    const hasCityFilters = filters?.cities && filters.cities.length > 0;
    
    // Skip loading if filters are empty/undefined and we've already loaded with location filters
    // This prevents the initial "no location filter" load from overwriting a good result
    if (!hasLocationFilters && !hasCityFilters && hasLoadedOnceRef.current) {
      console.log('📅 [CALENDAR] Skipping load - filters cleared but we already have data');
      return;
    }

    // If filters are empty/undefined and we haven't loaded yet, skip the initial load
    // Wait for filters to be set before loading (they'll trigger another useEffect run)
    if (!hasLocationFilters && !hasCityFilters && !hasLoadedOnceRef.current) {
      console.log('📅 [CALENDAR] Skipping initial load - waiting for filters to be set');
      return;
    }

    lastFilterKeyRef.current = filterKey;
    hasLoadedOnceRef.current = true;
    loadCalendarEvents();
  }, [filters?.latitude, filters?.longitude, filters?.radiusMiles, filters?.cities, filters?.genres, calendarDate, loadCalendarEvents]);

  const loadInterestedData = async (eventIds: string[]) => {
    if (!currentUserId || eventIds.length === 0) return;
    
    try {
      const interestedSet = await UserEventService.getUserInterestedEventIdSet(currentUserId, eventIds);
      setInterestedEvents(interestedSet);

      const countsMap = await UserEventService.getInterestedCountsByEventId(eventIds);
      setEventInterestedCounts(countsMap);
    } catch (error) {
      console.error('Error loading interested data:', error);
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    if (!date) {
      setSelectedDateEvents([]);
      return;
    }
  };

  // Update selected date events when calendar events or selected date changes
  useEffect(() => {
    if (!selectedDate) {
      setSelectedDateEvents([]);
      return;
    }

    // Get events for the selected single date only
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    const events = calendarEvents.get(dateKey) || [];
    
    // Sort by time
    const sortedEvents = [...events].sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
    setSelectedDateEvents(sortedEvents);
  }, [calendarEvents, selectedDate]);

  const getEventsForDate = (date: Date): JamBaseEvent[] => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return calendarEvents.get(dateKey) || [];
  };

  const openEventPage = (event: JamBaseEvent) => {
    if (onOpenEvent) {
      onOpenEvent(event);
      return;
    }
    setSelectedEvent(event);
    setEventDetailsOpen(true);
  };

  const handleEventClick = (event: JamBaseEvent) => {
    openEventPage(event);
  };

  return (
    <div className="mb-2 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Discover Events</h2>
          <p className="text-sm text-muted-foreground">
            Discover events by date
          </p>
        </div>
      </div>

        <div className="mt-4">
          {calendarLoading ? (
            <div aria-busy="true">
              <div role="status" aria-live="polite" className="sr-only">Loading calendar…</div>
              <SynthLoadingInline text="Loading calendar..." size="lg" />
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-6 w-full">
              {/* Left column: Calendar fills its container */}
              <div className="flex-shrink-0 w-full lg:w-[420px]">
                <div className="swift-ui-card rounded-xl overflow-hidden">
                  <div className="p-4">
                    <CalendarPicker
                      mode="single"
                      selected={selectedDate}
                      onSelect={handleDateSelect}
                      month={calendarDate}
                      onMonthChange={setCalendarDate}
                      className="w-full"
                      classNames={{
                        months: 'w-full',
                        month: 'w-full space-y-3',
                        table: 'w-full border-collapse',
                        head_row: 'flex w-full',
                        head_cell: 'flex-1 text-center rounded-md py-1',
                        row: 'flex w-full mt-1',
                        cell: 'flex-1 h-11 text-center p-0 relative focus-within:relative focus-within:z-20',
                        day: 'w-full h-11 p-0 aria-selected:opacity-100 rounded-lg',
                      }}
                      numberOfMonths={1}
                      disabled={(date) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const dateToCheck = new Date(date);
                        dateToCheck.setHours(0, 0, 0, 0);
                        return dateToCheck < today;
                      }}
                      modifiers={{
                        hasEvents: (date) => getEventsForDate(date).length > 0,
                      }}
                      modifiersClassNames={{
                        hasEvents: 'bg-synth-pink/20 border-synth-pink',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Right column: Events for selected date — scrolls independently */}
              <div className="flex-1 min-w-0">
                {selectedDate && selectedDateEvents.length > 0 ? (
                  <div className="flex flex-col h-full" style={{ maxHeight: 390 }}>
                    <h3 className="font-semibold text-base mb-3 flex-shrink-0">
                      Events on {format(selectedDate, 'MMMM d, yyyy')}
                    </h3>
                    <div className="overflow-y-auto flex-1 pr-1" style={{ scrollbarGutter: 'stable' }}>
                    <div className="grid grid-cols-1 gap-2">
                      {selectedDateEvents.map((event) => (
                        <Card
                          key={event.id}
                          className="cursor-pointer hover:shadow-md swift-ui-card"
                          onClick={() => handleEventClick(event)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleEventClick(event);
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          aria-label={`View event: ${event.title} at ${event.venue_name || 'venue'}`}
                        >
                          <div className="swift-ui-card-content">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h4 className="font-semibold">{event.title}</h4>
                                  <p className="text-sm text-muted-foreground">{event.venue_name}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {format(new Date(event.event_date), 'MMMM d, yyyy • h:mm a')}
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </div>
                        </Card>
                      ))}
                    </div>
                    </div>
                  </div>
                ) : selectedDate && !calendarLoading ? (
                  <div className="flex items-center justify-center h-full min-h-[200px] text-muted-foreground">
                    <p>No events found for {format(selectedDate, 'MMMM d, yyyy')}.</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full min-h-[200px] text-muted-foreground">
                    <p>Select a highlighted date to see events.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      {/* Event Details Modal (fallback when Discover is not handling open) */}
      {!onOpenEvent && (
        <EventDetailsModal
          event={selectedEvent}
          currentUserId={currentUserId}
          isOpen={eventDetailsOpen}
          onClose={() => setEventDetailsOpen(false)}
          isInterested={selectedEvent ? interestedEvents.has(selectedEvent.id) : false}
          onNavigateToProfile={onNavigateToProfile}
          onNavigateToChat={onNavigateToChat}
        />
      )}
    </div>
  );
};
