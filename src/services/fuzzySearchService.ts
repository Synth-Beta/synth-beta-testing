import { concertSearchService } from './concertSearchService';
import { supabase } from '@/integrations/supabase/client';
import type { Event } from '@/types/concertSearch';

interface SearchSuggestion {
  id: string;
  type: 'artist' | 'venue' | 'event';
  title: string;
  subtitle?: string;
  data: any;
}

interface FuzzySearchResult {
  suggestions: SearchSuggestion[];
  isLoading: boolean;
  error?: string;
}

class FuzzySearchService {
  private searchTimeout: NodeJS.Timeout | null = null;
  private lastSearchQuery = '';

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

  // Search for artists with fuzzy matching
  async searchArtists(query: string): Promise<SearchSuggestion[]> {
    if (!query || query.length < 2) return [];

    try {
      // Try JamBase API first
      const jamBaseArtists = await concertSearchService.searchJamBaseArtists(query);
      return jamBaseArtists.map((artist: any) => ({
        id: `artist-${artist.id || artist.name}`,
        type: 'artist' as const,
        title: artist.name,
        subtitle: artist.genres ? artist.genres.join(', ') : undefined,
        data: artist
      }));
    } catch (error) {
      console.warn('JamBase artists search failed, using fallback:', error);
      
      // Fallback to local suggestions
      return this.getFallbackArtistSuggestions(query);
    }
  }

  // Search for venues with fuzzy matching
  async searchVenues(query: string): Promise<SearchSuggestion[]> {
    if (!query || query.length < 2) return [];

    try {
      // Try JamBase API first
      const jamBaseVenues = await concertSearchService.searchJamBaseVenues(query);
      return jamBaseVenues.map((venue: any) => ({
        id: `venue-${venue.id || venue.name}`,
        type: 'venue' as const,
        title: venue.name,
        subtitle: venue.city && venue.state ? `${venue.city}, ${venue.state}` : undefined,
        data: venue
      }));
    } catch (error) {
      console.warn('JamBase venues search failed, using fallback:', error);
      
      // Fallback to local suggestions
      return this.getFallbackVenueSuggestions(query);
    }
  }

  // Search for events with fuzzy matching
  async searchEvents(query: string): Promise<SearchSuggestion[]> {
    if (!query || query.length < 2) return [];

    try {
      // Try to search existing events in database
      const { data: events, error } = await supabase
        .from('jambase_events')
        .select('*')
        .or(`title.ilike.%${query}%,artist_name.ilike.%${query}%,venue_name.ilike.%${query}%`)
        .limit(10);

      if (error) throw error;

      return (events || []).map((event: any) => ({
        id: `event-${event.id}`,
        type: 'event' as const,
        title: event.title || event.artist_name,
        subtitle: `${event.venue_name} • ${new Date(event.event_date).toLocaleDateString()}`,
        data: event
      }));
    } catch (error) {
      console.warn('Database events search failed:', error);
      return [];
    }
  }

  // Fallback artist suggestions
  private getFallbackArtistSuggestions(query: string): SearchSuggestion[] {
    const fallbackArtists = [
      'Taylor Swift', 'The Weeknd', 'Billie Eilish', 'Drake', 'Ariana Grande',
      'Ed Sheeran', 'Beyoncé', 'Harry Styles', 'Olivia Rodrigo', 'Bad Bunny',
      'Post Malone', 'Dua Lipa', 'The 1975', 'Lana Del Rey', 'SZA',
      'Travis Scott', 'Doja Cat', 'Lil Nas X', 'Miley Cyrus', 'Kendrick Lamar',
      'Lorde', 'Tyler, The Creator', 'Halsey', 'Frank Ocean', 'Rihanna',
      'Bruno Mars', 'Adele', 'Coldplay', 'Imagine Dragons', 'Maroon 5'
    ];

    return fallbackArtists
      .map(artist => ({
        id: `fallback-artist-${artist}`,
        type: 'artist' as const,
        title: artist,
        data: { name: artist }
      }))
      .filter(artist => this.fuzzyMatch(query, artist.title) > 0.3)
      .sort((a, b) => this.fuzzyMatch(query, b.title) - this.fuzzyMatch(query, a.title))
      .slice(0, 8);
  }

  // Fallback venue suggestions
  private getFallbackVenueSuggestions(query: string): SearchSuggestion[] {
    const fallbackVenues = [
      { name: 'Madison Square Garden', location: 'New York, NY' },
      { name: 'SoFi Stadium', location: 'Inglewood, CA' },
      { name: 'Hollywood Bowl', location: 'Los Angeles, CA' },
      { name: 'Wembley Stadium', location: 'London, UK' },
      { name: 'Caesars Palace', location: 'Las Vegas, NV' },
      { name: 'Fenway Park', location: 'Boston, MA' },
      { name: 'Red Rocks Amphitheatre', location: 'Morrison, CO' },
      { name: 'Hard Rock Stadium', location: 'Miami, FL' },
      { name: 'Mercedes-Benz Stadium', location: 'Atlanta, GA' },
      { name: 'T-Mobile Arena', location: 'Las Vegas, NV' },
      { name: 'O2 Arena', location: 'London, UK' },
      { name: 'Hollywood Palladium', location: 'Los Angeles, CA' },
      { name: 'Radio City Music Hall', location: 'New York, NY' },
      { name: 'Bridgestone Arena', location: 'Nashville, TN' },
      { name: 'Toyota Center', location: 'Houston, TX' },
      { name: 'Chase Center', location: 'San Francisco, CA' },
      { name: 'State Farm Arena', location: 'Atlanta, GA' },
      { name: 'United Center', location: 'Chicago, IL' },
      { name: 'Crypto.com Arena', location: 'Los Angeles, CA' },
      { name: 'Brooklyn Steel', location: 'Brooklyn, NY' }
    ];

    return fallbackVenues
      .map(venue => ({
        id: `fallback-venue-${venue.name}`,
        type: 'venue' as const,
        title: venue.name,
        subtitle: venue.location,
        data: { name: venue.name, city: venue.location.split(',')[0], state: venue.location.split(',')[1]?.trim() }
      }))
      .filter(venue => 
        this.fuzzyMatch(query, venue.title) > 0.3 || 
        this.fuzzyMatch(query, venue.subtitle || '') > 0.3
      )
      .sort((a, b) => 
        Math.max(this.fuzzyMatch(query, b.title), this.fuzzyMatch(query, b.subtitle || '')) - 
        Math.max(this.fuzzyMatch(query, a.title), this.fuzzyMatch(query, a.subtitle || ''))
      )
      .slice(0, 8);
  }

  // Main fuzzy search function
  async fuzzySearch(query: string, type?: 'artist' | 'venue' | 'event' | 'all'): Promise<FuzzySearchResult> {
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
          const suggestions: SearchSuggestion[] = [];

          if (type === 'all' || type === 'artist') {
            const artistSuggestions = await this.searchArtists(query);
            suggestions.push(...artistSuggestions);
          }

          if (type === 'all' || type === 'venue') {
            const venueSuggestions = await this.searchVenues(query);
            suggestions.push(...venueSuggestions);
          }

          if (type === 'all' || type === 'event') {
            const eventSuggestions = await this.searchEvents(query);
            suggestions.push(...eventSuggestions);
          }

          // Sort by relevance
          suggestions.sort((a, b) => {
            const scoreA = this.fuzzyMatch(query, a.title) + (a.subtitle ? this.fuzzyMatch(query, a.subtitle) * 0.5 : 0);
            const scoreB = this.fuzzyMatch(query, b.title) + (b.subtitle ? this.fuzzyMatch(query, b.subtitle) * 0.5 : 0);
            return scoreB - scoreA;
          });

          resolve({ suggestions: suggestions.slice(0, 10), isLoading: false });
        } catch (error) {
          console.error('Fuzzy search error:', error);
          resolve({ 
            suggestions: [], 
            isLoading: false, 
            error: error instanceof Error ? error.message : 'Search failed' 
          });
        }
      }, 300); // 300ms debounce
    });
  }

  // Create event from suggestion
  createEventFromSuggestion(suggestion: SearchSuggestion, date: string): Partial<Event> {
    if (suggestion.type === 'event') {
      return suggestion.data;
    }

    if (suggestion.type === 'artist') {
      return {
        artist_name: suggestion.title,
        title: `${suggestion.title} Concert`,
        jambase_event_id: suggestion.data.id,
        event_date: date
      };
    }

    if (suggestion.type === 'venue') {
      return {
        venue_name: suggestion.title,
        venue_city: suggestion.data.city,
        venue_state: suggestion.data.state,
        event_date: date
      };
    }

    return {};
  }
}

export const fuzzySearchService = new FuzzySearchService();
