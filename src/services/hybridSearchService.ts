import { supabase } from '@/integrations/supabase/client';
import type { Event, EventSearchParams } from '@/types/concertSearch';

export interface SearchSuggestion {
  id: string;
  title: string;
  subtitle?: string;
  data: Event;
  source: 'supabase'; // REMOVED: 'jambase' - frontend no longer has API access
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
  source: 'supabase'; // REMOVED: 'jambase' - frontend no longer has API access
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
        .from('events')
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

  // REMOVED: Jambase API calls - all data now comes from database sync
  // Frontend no longer has direct API access to Jambase

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

    // REMOVED: Jambase events handling - all events now come from database

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
          // First search existing Supabase events
          const supabaseEvents = await this.searchSupabaseEvents(query, date);
          
          // Only search Supabase database - no direct API access
            const suggestions = this.createSuggestions(supabaseEvents, [], query);
          
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
      // Event should already exist in database from sync
      // If it doesn't, it means sync hasn't run yet
      throw new Error('Event not found in database. Please ensure Jambase sync has been run.');
        }
      }

  // REMOVED: createEventFromJambase - events are now created via backend sync only

  // Link event to user
  private async linkEventToUser(eventId: string, userId: string): Promise<void> {
    try {
      // Check if link already exists in user_event_relationships table (3NF compliant)
      const { data: existing } = await supabase
        .from('user_event_relationships')
        .select('*')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .eq('relationship_type', 'interest')
        .maybeSingle();

      if (existing) {
        console.log('User-event link already exists');
        return;
      }

      // Create new link in user_event_relationships table
      const { error } = await supabase
        .from('user_event_relationships')
        .insert({ 
          event_id: eventId,
          relationship_type: 'interest',
          user_id: userId 
        });

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
