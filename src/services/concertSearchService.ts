import { createClient } from '@supabase/supabase-js';
import type { 
  Event, 
  EventSearchParams, 
  EventSearchResult, 
  Concert, 
  JamBaseEvent,
  SearchParams,
  SearchResponse,
  ConcertStats
} from '@/types/concertSearch';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const JAMBASE_API_KEY = import.meta.env.VITE_JAMBASE_API_KEY || 'e7ed3a9b-e73a-446e-b7c6-a96d1c53a030';
const JAMBASE_BASE_URL = 'https://www.jambase.com/jb-api/v1';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

class ConcertSearchService {
  // Check Supabase for existing event
  async checkExistingEvent(params: EventSearchParams): Promise<Event | null> {
    try {
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
        return null;
      }
      return data || null;
    } catch (error) {
      console.error('Error checking existing event:', error);
      return null;
    }
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
    if (!res.ok) {
      throw new Error(`JamBase API error: ${res.status} ${res.statusText}`);
    }
    
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

  // Search artists on JamBase (for autocomplete)
  async searchJamBaseArtists(artistName: string): Promise<any[]> {
    const searchUrl = new URL(`${JAMBASE_BASE_URL}/artists`);
    searchUrl.searchParams.append('apikey', JAMBASE_API_KEY);
    searchUrl.searchParams.append('artistName', artistName);
    searchUrl.searchParams.append('limit', '10');

    try {
      const response = await fetch(searchUrl.toString());
      if (!response.ok) {
        throw new Error(`JamBase API error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      return data.artists || [];
    } catch (error) {
      console.error('JamBase Artists API Error:', error);
      throw new Error(`Failed to search JamBase artists: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Search venues on JamBase (for autocomplete)
  async searchJamBaseVenues(venueName: string): Promise<any[]> {
    const searchUrl = new URL(`${JAMBASE_BASE_URL}/venues`);
    searchUrl.searchParams.append('apikey', JAMBASE_API_KEY);
    searchUrl.searchParams.append('venueName', venueName);
    searchUrl.searchParams.append('limit', '10');

    try {
      const response = await fetch(searchUrl.toString());
      if (!response.ok) {
        throw new Error(`JamBase API error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      return data.venues || [];
    } catch (error) {
      console.error('JamBase Venues API Error:', error);
      throw new Error(`Failed to search JamBase venues: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Get user's events
  async getUserEvents(userId: string): Promise<{ events: Event[] }> {
    const { data, error } = await supabase
      .from('user_events')
      .select(`
        event_id,
        events (*)
      `)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to fetch user events: ${error.message}`);
    }

    const events = data?.map(ue => ue.events).filter(Boolean) || [];
    return { events };
  }

  // Convert Event to Concert format for backward compatibility
  private eventToConcert(event: Event): Concert {
    return {
      id: event.id.toString(),
      artist: event.artist_name || event.event_name.split(' at ')[0] || 'Unknown Artist',
      date: event.event_date,
      venue: event.venue_name || event.location,
      profile_pic: undefined,
      tour: event.tour_name,
      setlist: Array.isArray(event.setlist) ? event.setlist : [],
      venue_location: event.venue_city && event.venue_state 
        ? `${event.venue_city}, ${event.venue_state}` 
        : event.location,
      source: event.jambase_event_id ? 'jambase_api' : 'manual',
      confidence: event.jambase_event_id ? 'high' : 'medium',
      created_at: event.created_at || new Date().toISOString()
    };
  }

  // Get user events in Concert format for existing components
  async getUserConcerts(userId: string): Promise<Concert[]> {
    const result = await this.getUserEvents(userId);
    return result.events.map(event => this.eventToConcert(event));
  }
}

export const concertSearchService = new ConcertSearchService();
