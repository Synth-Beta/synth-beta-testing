import { createClient } from '@supabase/supabase-js';
// @ts-ignore: File is not a module, but we still want types
import type { Event, EventSearchParams, EventSearchResult, Concert } from './types';

const SUPABASE_URL = (window as any)?.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = (window as any)?.VITE_SUPABASE_ANON_KEY ?? '';
const JAMBASE_API_KEY = (window as any)?.VITE_JAMBASE_API_KEY ?? '';
const JAMBASE_BASE_URL = 'https://www.jambase.com/jb-api/v1';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

class ConcertApiService {

  // Check Supabase for existing event
  async checkExistingEvent(params: EventSearchParams): Promise<Event | null> {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .ilike('artist_name', `%${params.artist}%`)
      .ilike('venue_name', `%${params.venue}%`)
      .eq('event_date', params.date)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Supabase error:', error);
    }
    return data || null;
  }

  // Search JamBase if no event in Supabase
  async searchJamBase(params: EventSearchParams): Promise<Event> {
    const url = new URL(`${JAMBASE_BASE_URL}/events`);
    url.searchParams.append('apikey', JAMBASE_API_KEY);
    if (params.artist) url.searchParams.append('artistName', params.artist);
    if (params.venue) url.searchParams.append('venueName', params.venue);
    if (params.date) {
      url.searchParams.append('eventDateFrom', params.date);
      url.searchParams.append('eventDateTo', params.date);
    }

    const res = await fetch(url.toString());
    const json = await res.json();
    const event = json.events?.[0];

    if (!event) {
      throw new Error('No event found on JamBase');
    }

    return {
      id: 0, // Supabase will generate
      jambase_event_id: event.id,
      title: event.title,
      artist_name: event.artist?.name,
      location: event.venue?.city
        ? `${event.venue.city}, ${event.venue.state || ''}`.trim()
        : '',
      event_name: event.title,
      url: event.url || '',
      artist_id: event.artist?.id,
      venue_name: event.venue?.name,
      venue_id: event.venue?.id,
      doors_time: event.doors,
      description: event.description,
      genres: event.artist?.genres || [],
      venue_address: event.venue?.address,
      venue_city: event.venue?.city,
      venue_state: event.venue?.state,
      venue_zip: event.venue?.zipCode,
      latitude: event.venue?.latitude,
      longitude: event.venue?.longitude,
      ticket_available: event.ticketing?.available,
      price_range: event.ticketing?.priceRange,
      ticket_urls: event.ticketing?.urls,
      setlist: event.setlist,
      tour_name: event.tour,
      event_date: event.dateTime.split('T')[0],
      event_time: event.dateTime.split('T')[1] || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  // Insert event into Supabase
  async insertEvent(event: Event): Promise<Event> {
    const { data, error } = await supabase
      .from('events')
      .insert([event])
      .select()
      .single();

    if (error) throw new Error(`Supabase insert failed: ${error.message}`);
    return data!;
  }

  // Link event to user
  async linkEventToUser(eventId: number, userId: string) {
    const { error } = await supabase
      .from('user_events')
      .insert({ event_id: eventId, user_id: userId });
    if (error) throw new Error(`Supabase user_event link failed: ${error.message}`);
  }

  // Main search function
  async searchEvent(params: EventSearchParams, userId: string): Promise<EventSearchResult> {
    let event = await this.checkExistingEvent(params);
    let isNew = false;

    if (!event) {
      event = await this.searchJamBase(params);
      const inserted = await this.insertEvent(event);
      event = inserted;
      isNew = true;
    }

    await this.linkEventToUser(event.id, userId);

    return { event, isNewEvent: isNew };
  }
}

export const concertApiService = new ConcertApiService();
