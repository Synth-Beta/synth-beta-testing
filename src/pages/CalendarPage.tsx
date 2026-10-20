import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format, startOfMonth, isSameDay } from 'date-fns';
import { ArrowLeft, CalendarDays, Heart, MapPin } from 'lucide-react';
import PageShell from '@/components/layout/PageShell';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { SynthLoadingInline } from '@/components/ui/SynthLoader';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { supabase } from '@/integrations/supabase/client';
import { UserEventService } from '@/services/userEventService';
import { useBrowseLocation } from '@/contexts/BrowseLocationContext';
import { LocationFilterButton } from '@/components/search/LocationFilterButton';
import type { JamBaseEvent } from '@/types/eventTypes';
import { cn } from '@/lib/utils';
import './CalendarPage.css';

/** PostgREST caps responses at 1000 rows; get_calendar_events times out above that. */
const POSTGREST_MAX_ROWS = 1000;

type Scope = 'all' | 'mine';

/** get_calendar_events and the saved-shows join both return event_media_url. */
type CalEvent = JamBaseEvent & { event_media_url?: string | null };

const dayKey = (d: Date | string) => format(new Date(d), 'yyyy-MM-dd');

interface CalendarPageProps {
  currentUserId: string;
  onBack?: () => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
}

/**
 * Calendar: a month of shows near you, with the shows you saved (Interested / Going)
 * marked. Pick a day to see what's on; tap a show for the event page.
 */
export const CalendarPage: React.FC<CalendarPageProps> = ({
  currentUserId,
  onBack,
  onNavigateToProfile,
  onNavigateToChat,
}) => {
  const [month, setMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [scope, setScope] = useState<Scope>('all');
  const [nearbyByDay, setNearbyByDay] = useState<Map<string, JamBaseEvent[]>>(new Map());
  const [savedByDay, setSavedByDay] = useState<Map<string, JamBaseEvent[]>>(new Map());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [openEvent, setOpenEvent] = useState<JamBaseEvent | null>(null);

  // Same location + radius the home feed uses (set from the location pill).
  const browse = useBrowseLocation();
  const { latitude: lat, longitude: lng } = browse.coords ?? {};
  const location = useMemo(() => (lat != null && lng != null ? { lat, lng } : null), [lat, lng]);
  const radiusMiles = browse.radiusMiles;

  // A new place or radius invalidates months already loaded.
  useEffect(() => setNearbyByDay(new Map()), [location, radiusMiles]);

  // Saved shows (Interested / Going), upcoming.
  const loadSaved = useCallback(async () => {
    const { data, error } = await supabase
      .from('user_event_relationships')
      .select(
        'event_id, relationship_type, events!inner(id, title, event_date, venue_id, venue_city, venue_state, artist_id, event_media_url, ticket_urls, venues(name), artists(name))'
      )
      .eq('user_id', currentUserId)
      .in('relationship_type', ['interested', 'going'])
      .gte('events.event_date', new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
    if (error) {
      console.warn('[Calendar] saved shows:', error.message);
      return;
    }
    const byDay = new Map<string, JamBaseEvent[]>();
    const ids = new Set<string>();
    for (const row of (data ?? []) as any[]) {
      const e = row.events;
      if (!e) continue;
      ids.add(e.id);
      const ev = {
        ...e,
        venue_name: e.venues?.name ?? undefined,
        artist_name: e.artists?.name ?? undefined,
      } as JamBaseEvent;
      const k = dayKey(e.event_date);
      byDay.set(k, [...(byDay.get(k) ?? []), ev]);
    }
    setSavedByDay(byDay);
    setSavedIds(ids);
  }, [currentUserId]);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  // Nearby shows for the month on screen (merged so earlier months stay loaded).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const monthStart = startOfMonth(month);
        const from = monthStart > today ? monthStart : today;
        const { data, error } = await supabase.rpc('get_calendar_events', {
          p_latitude: location?.lat ?? null,
          p_longitude: location?.lng ?? null,
          p_radius_miles: location ? radiusMiles : null,
          p_min_date: from.toISOString(),
          p_genres: null,
          p_limit: POSTGREST_MAX_ROWS,
          p_umbrella_slug: null,
          p_max_depth: 5,
        });
        if (error) throw error;
        if (cancelled) return;
        const byDay = new Map<string, JamBaseEvent[]>();
        for (const e of (data ?? []) as JamBaseEvent[]) {
          const k = dayKey(e.event_date);
          byDay.set(k, [...(byDay.get(k) ?? []), e]);
        }
        setNearbyByDay((prev) => {
          const merged = new Map(prev);
          byDay.forEach((v, k) => merged.set(k, v));
          return merged;
        });
      } catch (error) {
        console.error('[Calendar] nearby shows:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [month, location, radiusMiles]);

  const dayEvents = useMemo(() => {
    const k = dayKey(selectedDate);
    const saved = savedByDay.get(k) ?? [];
    if (scope === 'mine') return [...saved].sort(byTime);
    // Saved shows first, then everything else that day.
    const rest = (nearbyByDay.get(k) ?? []).filter((e) => !savedIds.has(e.id));
    return [...[...saved].sort(byTime), ...rest.sort(byTime)];
  }, [selectedDate, scope, savedByDay, nearbyByDay, savedIds]);

  const upcomingSaved = useMemo(
    () =>
      [...savedByDay.values()]
        .flat()
        .sort(byTime)
        .slice(0, 6),
    [savedByDay]
  );

  const header = (
    <div
      className="sticky top-0 z-10 flex items-center justify-between px-4 pb-3"
      style={{
        backgroundColor: 'var(--neutral-0, #fff)',
        borderBottom: 'var(--border-default)',
        top: 'env(safe-area-inset-top, 0)',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
      }}
    >
      {onBack ? (
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
      ) : (
        <span />
      )}
      <h1 className="text-base font-bold">Calendar</h1>
      <span className="w-16" />
    </div>
  );

  return (
    <PageShell header={header}>
      <div className="calendar-page mx-auto w-full max-w-6xl pb-28 pt-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">{format(month, 'MMMM yyyy')}</h2>
            <p className="text-sm text-muted-foreground">
              {location ? `Shows within ${radiusMiles} miles. Pink days have shows you saved.` : 'Shows on Synth. Pink days have shows you saved.'}
            </p>
            <div className="mt-2">
              <LocationFilterButton />
            </div>
          </div>
          <div className="calendar-page__scope" role="tablist" aria-label="Which shows">
            {(['all', 'mine'] as Scope[]).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={scope === s}
                className={cn('calendar-page__scope-btn', scope === s && 'is-active')}
                onClick={() => setScope(s)}
              >
                {s === 'all' ? 'All nearby' : 'My shows'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex w-full flex-col gap-6 lg:flex-row">
          <div className="w-full flex-shrink-0 lg:w-[440px]">
            <div className="calendar-page__card p-4">
              <CalendarPicker
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                month={month}
                onMonthChange={setMonth}
                className="w-full"
                classNames={{
                  months: 'w-full',
                  month: 'w-full space-y-3',
                  table: 'w-full border-collapse',
                  head_row: 'flex w-full',
                  head_cell: 'flex-1 text-center rounded-md py-1',
                  row: 'flex w-full mt-1',
                  cell: 'flex-1 h-12 text-center p-0 relative focus-within:relative focus-within:z-20',
                  day: 'w-full h-12 p-0 aria-selected:opacity-100 rounded-xl',
                }}
                disabled={(date) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  return date < today;
                }}
                modifiers={{
                  hasShows: (date) => scope === 'all' && (nearbyByDay.get(dayKey(date))?.length ?? 0) > 0,
                  saved: (date) => (savedByDay.get(dayKey(date))?.length ?? 0) > 0,
                }}
                modifiersClassNames={{
                  hasShows: 'calendar-day--shows',
                  saved: 'calendar-day--saved',
                }}
              />
              {loading && (
                <div className="mt-2">
                  <SynthLoadingInline text="Loading shows…" size="sm" />
                </div>
              )}
            </div>

            {upcomingSaved.length > 0 && (
              <div className="calendar-page__card mt-4 p-4">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <Heart className="h-4 w-4 text-pink-600" aria-hidden="true" /> Your next shows
                </h3>
                <ul className="space-y-1">
                  {upcomingSaved.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        className="calendar-page__mini"
                        onClick={() => {
                          setMonth(new Date(e.event_date));
                          setSelectedDate(new Date(e.event_date));
                        }}
                      >
                        <span className="calendar-page__mini-date">{format(new Date(e.event_date), 'MMM d')}</span>
                        <span className="truncate">{e.artist_name || e.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <section className="min-w-0 flex-1" aria-live="polite">
            <h3 className="mb-3 flex items-center gap-2 text-lg font-bold">
              <CalendarDays className="h-5 w-5 text-pink-600" aria-hidden="true" />
              {isSameDay(selectedDate, new Date()) ? 'Tonight' : format(selectedDate, 'EEEE, MMMM d')}
              <span className="text-sm font-medium text-muted-foreground">
                {dayEvents.length > 0 ? `· ${dayEvents.length} ${dayEvents.length === 1 ? 'show' : 'shows'}` : ''}
              </span>
            </h3>

            {dayEvents.length === 0 ? (
              <div className="calendar-page__card flex min-h-[200px] items-center justify-center p-6 text-center text-muted-foreground">
                {scope === 'mine' ? 'You have no saved shows this day.' : 'No shows found this day. Try another date.'}
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {dayEvents.map((e) => (
                  <li key={e.id}>
                    <button type="button" className="calendar-page__event" onClick={() => setOpenEvent(e)}>
                      {(e as CalEvent).event_media_url ? (
                        <img src={(e as CalEvent).event_media_url} alt="" loading="lazy" className="calendar-page__event-img" />
                      ) : (
                        <span className="calendar-page__event-img calendar-page__event-img--empty" aria-hidden="true" />
                      )}
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate font-bold">{e.artist_name || e.title}</span>
                        <span className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                          {[e.venue_name, e.venue_city].filter(Boolean).join(' · ') || 'Venue TBA'}
                        </span>
                        <span className="block text-xs text-muted-foreground">{format(new Date(e.event_date), 'h:mm a')}</span>
                      </span>
                      {savedIds.has(e.id) && (
                        <Heart className="h-4 w-4 flex-shrink-0 text-pink-600" fill="currentColor" aria-label="Saved" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <EventDetailsModal
        event={openEvent}
        currentUserId={currentUserId}
        isOpen={!!openEvent}
        onClose={() => setOpenEvent(null)}
        isInterested={openEvent ? savedIds.has(openEvent.id) : false}
        onInterestToggle={async (eventId, interested) => {
          try {
            await UserEventService.setEventInterest(currentUserId, eventId, interested);
          } catch (error) {
            console.error('[Calendar] interest toggle:', error);
          }
          await loadSaved();
        }}
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToChat={onNavigateToChat}
      />
    </PageShell>
  );
};

function byTime(a: JamBaseEvent, b: JamBaseEvent) {
  return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
}
