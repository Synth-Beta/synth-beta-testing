import { supabase } from '@/integrations/supabase/client';
import { JamBaseService } from './jambaseService';
import type { Event, EventSearchParams } from '@/types/concertSearch';

export interface SearchSuggestion {
  id: string;
  title: string;
  subtitle?: string;
  data: Event;
  source: 'supabase' | 'jambase';
  confidence: number;
  isExisting: boolean;
}

export interface HybridSearchResult {
  suggestions: SearchSuggestion[];
  isLoading: boolean;
  error?: string;
}

export interface EventSelectionResult {
  event: Event;
  isNewEvent: boolean;
  source: 'supabase' | 'jambase';
}

class HybridSearchService {
  private searchTimeout: NodeJS.Timeout | null = null;

  // Fuzzy string matching function
  private fuzzyMatch(query: string, target: string): number {
    if (!query || !target) return 0;
    
    const queryLower = query.toLowerCase();
    const targetLower = target.toLowerCase();
    
    // Exact match gets highest score
    if (targetLower === queryLower) return 1;
    
    // Starts with query gets high score
    if (targetLower.startsWith(queryLower)) return 0.9;
    
    // Contains query gets medium score
    if (targetLower.includes(queryLower)) return 0.7;
    
    // Fuzzy matching for partial matches
    let score = 0;
    let queryIndex = 0;
    
    for (let i = 0; i < targetLower.length && queryIndex < queryLower.length; i++) {
      if (targetLower[i] === queryLower[queryIndex]) {
        score += 1;
        queryIndex++;
      }
    }
    
    return queryIndex === queryLower.length ? score / queryLower.length : 0;
  }

  // Search Supabase for existing events
  private async searchSupabaseEvents(query: string, date?: string): Promise<Event[]> {
    try {
      let supabaseQuery = supabase
        .from('jambase_events')
        .select('*')
        .or(`title.ilike.%${query}%,artist_name.ilike.%${query}%,venue_name.ilike.%${query}%`);

      if (date) {
        supabaseQuery = supabaseQuery.eq('event_date', date);
      }

      const { data, error } = await supabaseQuery.limit(20);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Supabase search error:', error);
      return [];
    }
  }

  // Search Jambase API for events
  private async searchJambaseEvents(query: string, date?: string): Promise<Event[]> {
    try {
      const JAMBASE_API_KEY = import.meta.env.VITE_JAMBASE_API_KEY || 'e7ed3a9b-e73a-446e-b7c6-a96d1c53a030';
      const JAMBASE_BASE_URL = 'https://api.jambase.com';

      const url = new URL(`${JAMBASE_BASE_URL}/events`);
      url.searchParams.append('api_key', JAMBASE_API_KEY);
      
      // Try different search parameters
      if (query.includes(' at ')) {
        // If query contains " at ", split into artist and venue
        const [artist, venue] = query.split(' at ');
        url.searchParams.append('artistName', artist.trim());
        url.searchParams.append('venueName', venue.trim());
      } else {
        // Default to artist search
        url.searchParams.append('artistName', query);
      }
      
      if (date) {
        url.searchParams.append('eventDateFrom', date);
        url.searchParams.append('eventDateTo', date);
      }
      url.searchParams.append('limit', '20');

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`JamBase API error: ${response.status}`);
      }

      const data = await response.json();
      const events = data.events || [];

      return this.convertJamBaseEvents(events);
    } catch (error) {
      console.error('JamBase search error:', error);
      return [];
    }
  }

  // Broader JamBase search with multiple strategies
  private async searchJambaseEventsWithBroaderQuery(query: string, date?: string): Promise<Event[]> {
    try {
      const JAMBASE_API_KEY = import.meta.env.VITE_JAMBASE_API_KEY || 'e7ed3a9b-e73a-446e-b7c6-a96d1c53a030';
      const JAMBASE_BASE_URL = 'https://api.jambase.com';

      // Try multiple search strategies
      const searchStrategies = [
        // Strategy 1: Search by artist name only
        { artistName: query },
        // Strategy 2: Search by venue name only
        { venueName: query },
        // Strategy 3: Search without date restriction if date was provided
        date ? { artistName: query, skipDate: true } : null,
        // Strategy 4: Search for partial matches
        { artistName: query.split(' ')[0] } // First word only
      ].filter(Boolean);

      for (const strategy of searchStrategies) {
        const url = new URL(`${JAMBASE_BASE_URL}/events`);
        url.searchParams.append('api_key', JAMBASE_API_KEY);
        
        if (strategy.artistName) {
          url.searchParams.append('artistName', strategy.artistName);
        }
        if (strategy.venueName) {
          url.searchParams.append('venueName', strategy.venueName);
        }
        
        // Only add date if not skipping and date is provided
        if (date && !strategy.skipDate) {
          url.searchParams.append('eventDateFrom', date);
          url.searchParams.append('eventDateTo', date);
        }
        
        url.searchParams.append('limit', '10');

        console.log('Trying JamBase search strategy:', strategy, url.toString());

        const response = await fetch(url.toString());
        if (response.ok) {
          const data = await response.json();
          const events = data.events || [];
          
          if (events.length > 0) {
            console.log(`Found ${events.length} events with strategy:`, strategy);
            return this.convertJamBaseEvents(events);
          }
        }
      }

      console.log('No events found with any JamBase search strategy');
      return [];
    } catch (error) {
      console.error('Broader JamBase search error:', error);
      return [];
    }
  }

  // Convert JamBase events to our Event format
  private convertJamBaseEvents(jambaseEvents: any[]): Event[] {
    return jambaseEvents.map((jambaseEvent: any) => ({
      id: '', // Will be generated when saved to Supabase
      jambase_event_id: jambaseEvent.id,
      title: jambaseEvent.title || `${jambaseEvent.artist?.name || 'Unknown Artist'} Live`,
      artist_name: jambaseEvent.artist?.name || 'Unknown Artist',
      artist_id: jambaseEvent.artist?.id,
      venue_name: jambaseEvent.venue?.name || 'Unknown Venue',
      venue_id: jambaseEvent.venue?.id,
      event_date: jambaseEvent.dateTime || new Date().toISOString(),
      doors_time: jambaseEvent.doors,
      description: jambaseEvent.description || `Live performance by ${jambaseEvent.artist?.name || 'Unknown Artist'}`,
      genres: jambaseEvent.artist?.genres || [],
      venue_address: jambaseEvent.venue?.address,
      venue_city: jambaseEvent.venue?.city,
      venue_state: jambaseEvent.venue?.state,
      venue_zip: jambaseEvent.venue?.zipCode,
      latitude: jambaseEvent.venue?.latitude,
      longitude: jambaseEvent.venue?.longitude,
      ticket_available: jambaseEvent.ticketing?.available || false,
      price_range: jambaseEvent.ticketing?.priceRange,
      ticket_urls: jambaseEvent.ticketing?.urls || [],
      setlist: jambaseEvent.setlist,
      tour_name: jambaseEvent.tour,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // Legacy fields
      location: jambaseEvent.venue?.city && jambaseEvent.venue?.state
        ? `${jambaseEvent.venue.city}, ${jambaseEvent.venue.state}`
        : jambaseEvent.venue?.city || '',
      event_name: jambaseEvent.title || `${jambaseEvent.artist?.name || 'Unknown Artist'} Live`,
      event_time: jambaseEvent.dateTime ? jambaseEvent.dateTime.split('T')[1] : null,
      url: jambaseEvent.url || '',
    }));
  }

  // Create search suggestions with fuzzy matching
  private createSuggestions(
    supabaseEvents: Event[],
    jambaseEvents: Event[],
    query: string
  ): SearchSuggestion[] {
    const suggestions: SearchSuggestion[] = [];

    // Add Supabase events (existing events)
    supabaseEvents.forEach(event => {
      const titleScore = this.fuzzyMatch(query, event.title || event.artist_name || '');
      const venueScore = this.fuzzyMatch(query, event.venue_name || '');
      const artistScore = this.fuzzyMatch(query, event.artist_name || '');
      
      const maxScore = Math.max(titleScore, venueScore, artistScore);
      
      if (maxScore > 0.3) { // Only include if score is above threshold
        suggestions.push({
          id: `supabase-${event.id}`,
          title: event.title || event.artist_name || 'Unknown Event',
          subtitle: `${event.venue_name} • ${new Date(event.event_date).toLocaleDateString()}`,
          data: event,
          source: 'supabase',
          confidence: maxScore,
          isExisting: true
        });
      }
    });

    // Add Jambase events (potential new events)
    jambaseEvents.forEach(event => {
      const titleScore = this.fuzzyMatch(query, event.title || event.artist_name || '');
      const venueScore = this.fuzzyMatch(query, event.venue_name || '');
      const artistScore = this.fuzzyMatch(query, event.artist_name || '');
      
      const maxScore = Math.max(titleScore, venueScore, artistScore);
      
      if (maxScore > 0.3) { // Only include if score is above threshold
        suggestions.push({
          id: `jambase-${event.jambase_event_id}`,
          title: event.title || event.artist_name || 'Unknown Event',
          subtitle: `${event.venue_name} • ${new Date(event.event_date).toLocaleDateString()}`,
          data: event,
          source: 'jambase',
          confidence: maxScore,
          isExisting: false
        });
      }
    });

    // Sort by confidence score (highest first)
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  // Main hybrid search function
  async searchEvents(query: string, date?: string): Promise<HybridSearchResult> {
    if (!query || query.length < 2) {
      return { suggestions: [], isLoading: false };
    }

    // Debounce search
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    return new Promise((resolve) => {
      this.searchTimeout = setTimeout(async () => {
        try {
          // Search both Supabase and Jambase in parallel
          const [supabaseEvents, jambaseEvents] = await Promise.all([
            this.searchSupabaseEvents(query, date),
            this.searchJambaseEvents(query, date)
          ]);

          const suggestions = this.createSuggestions(supabaseEvents, jambaseEvents, query);

          // If no results from either source, try broader JamBase search
          if (suggestions.length === 0) {
            console.log('No results found, trying broader JamBase search...');
            const broaderJambaseEvents = await this.searchJambaseEventsWithBroaderQuery(query, date);
            const broaderSuggestions = this.createSuggestions([], broaderJambaseEvents, query);
            
            resolve({ 
              suggestions: broaderSuggestions.slice(0, 15),
              isLoading: false 
            });
          } else {
            resolve({ 
              suggestions: suggestions.slice(0, 15), // Limit to 15 results
              isLoading: false 
            });
          }
        } catch (error) {
          console.error('Hybrid search error:', error);
          resolve({ 
            suggestions: [], 
            isLoading: false, 
            error: error instanceof Error ? error.message : 'Search failed' 
          });
        }
      }, 300); // 300ms debounce
    });
  }

  // Handle event selection - either use existing or create new
  async selectEvent(suggestion: SearchSuggestion, userId: string): Promise<EventSelectionResult> {
    if (suggestion.isExisting) {
      // Event already exists in Supabase, just link to user
      await this.linkEventToUser(suggestion.data.id, userId);
      return {
        event: suggestion.data,
        isNewEvent: false,
        source: 'supabase'
      };
    } else {
      // Event from Jambase, create in Supabase and link to user
      const createdEvent = await this.createEventFromJambase(suggestion.data);
      await this.linkEventToUser(createdEvent.id, userId);
      return {
        event: createdEvent,
        isNewEvent: true,
        source: 'jambase'
      };
    }
  }

  // Create event in Supabase from Jambase data
  private async createEventFromJambase(jambaseEvent: Event): Promise<Event> {
    try {
      // First check if event already exists by jambase_event_id
      if (jambaseEvent.jambase_event_id) {
        const { data: existing } = await supabase
          .from('jambase_events')
          .select('*')
          .eq('jambase_event_id', jambaseEvent.jambase_event_id)
          .single();

        if (existing) {
          console.log('Event already exists, returning existing event');
          return existing;
        }
      }

      // Create new event
      const { data, error } = await supabase
        .from('jambase_events')
        .insert([jambaseEvent])
        .select()
        .single();

      if (error) {
        console.error('Error creating event:', error);
        throw new Error(`Failed to create event: ${error.message}`);
      }

      console.log('Successfully created new event:', data.id);
      return data!;
    } catch (error) {
      console.error('Error in createEventFromJambase:', error);
      throw error;
    }
  }

  // Link event to user
  private async linkEventToUser(eventId: string, userId: string): Promise<void> {
    try {
      // Check if link already exists
      const { data: existing } = await supabase
        .from('user_jambase_events')
        .select('*')
        .eq('jambase_event_id', eventId)
        .eq('user_id', userId)
        .single();

      if (existing) {
        console.log('User-event link already exists');
        return;
      }

      // Create new link
      const { error } = await supabase
        .from('user_jambase_events')
        .insert({ jambase_event_id: eventId, user_id: userId });

      if (error) {
        console.error('Error linking event to user:', error);
        throw new Error(`Failed to link event to user: ${error.message}`);
      }

      console.log('Successfully linked event to user');
    } catch (error) {
      // If it's just a duplicate key error, ignore it
      if (error instanceof Error && error.message.includes('duplicate')) {
        console.log('User-event link already exists (duplicate key)');
        return;
      }
      throw error;
    }
  }

  // Search with specific parameters (artist, venue, date)
  async searchWithParams(params: EventSearchParams): Promise<HybridSearchResult> {
    const query = `${params.artist} ${params.venue}`.trim();
    return this.searchEvents(query, params.date);
  }
}

export const hybridSearchService = new HybridSearchService();
