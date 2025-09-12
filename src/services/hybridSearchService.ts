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
      url.searchParams.append('artistName', query);
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

      // Convert JamBase events to our Event format
      return events.map((jambaseEvent: any) => ({
        id: '', // Will be generated when saved to Supabase
        jambase_event_id: jambaseEvent.id,
        title: jambaseEvent.title,
        artist_name: jambaseEvent.artist?.name || '',
        artist_id: jambaseEvent.artist?.id,
        venue_name: jambaseEvent.venue?.name || '',
        venue_id: jambaseEvent.venue?.id,
        event_date: jambaseEvent.dateTime,
        doors_time: jambaseEvent.doors,
        description: jambaseEvent.description,
        genres: jambaseEvent.artist?.genres || [],
        venue_address: jambaseEvent.venue?.address,
        venue_city: jambaseEvent.venue?.city,
        venue_state: jambaseEvent.venue?.state,
        venue_zip: jambaseEvent.venue?.zipCode,
        latitude: jambaseEvent.venue?.latitude,
        longitude: jambaseEvent.venue?.longitude,
        ticket_available: jambaseEvent.ticketing?.available,
        price_range: jambaseEvent.ticketing?.priceRange,
        ticket_urls: jambaseEvent.ticketing?.urls,
        setlist: jambaseEvent.setlist,
        tour_name: jambaseEvent.tour,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // Legacy fields
        location: jambaseEvent.venue?.city
          ? `${jambaseEvent.venue.city}, ${jambaseEvent.venue.state || ''}`.trim()
          : '',
        event_name: jambaseEvent.title,
        event_time: jambaseEvent.dateTime.split('T')[1] || null,
        url: jambaseEvent.url || '',
      }));
    } catch (error) {
      console.error('JamBase search error:', error);
      return [];
    }
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

          resolve({ 
            suggestions: suggestions.slice(0, 15), // Limit to 15 results
            isLoading: false 
          });
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
    const { data, error } = await supabase
      .from('jambase_events')
      .insert([jambaseEvent])
      .select()
      .single();

    if (error) throw new Error(`Failed to create event: ${error.message}`);
    return data!;
  }

  // Link event to user
  private async linkEventToUser(eventId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('user_jambase_events')
      .insert({ jambase_event_id: eventId, user_id: userId });

    if (error) throw new Error(`Failed to link event to user: ${error.message}`);
  }

  // Search with specific parameters (artist, venue, date)
  async searchWithParams(params: EventSearchParams): Promise<HybridSearchResult> {
    const query = `${params.artist} ${params.venue}`.trim();
    return this.searchEvents(query, params.date);
  }
}

export const hybridSearchService = new HybridSearchService();
