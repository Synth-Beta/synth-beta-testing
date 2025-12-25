import { supabase } from '../integrations/supabase/client';
import { ArtistProfile, JamBaseArtistResponse, transformJamBaseArtistToProfile } from '../types/artistProfile';

export interface ArtistSearchResult {
  id: string;
  name: string;
  identifier: string;
  image_url?: string;
  genres?: string[];
  band_or_musician?: 'band' | 'musician';
  num_upcoming_events?: number;
  match_score: number;
  combinedScore?: number;
  is_from_database: boolean;
}

export class UnifiedArtistSearchService {

  /**
   * Main search function - PROTECTED API USAGE:
   * 1. ALWAYS search local database FIRST
   * 2. Only call external API if useApi=true (explicit user search)
   * 3. Only fetch NEW events when using API
   * 4. Populate database with new results
   * 
   * @param query - Search query string
   * @param limit - Maximum results to return
   * @param useApi - If true, will call external APIs for new results. If false, only searches local DB.
   */
  static async searchArtists(query: string, limit: number = 20, useApi: boolean = false): Promise<ArtistSearchResult[]> {
    if (!query || query.length < 2) {
      return [];
    }

    try {
      console.log(`🔍 Searching for artists: "${query}" (useApi: ${useApi})`);

      // STEP 1: ALWAYS search local database FIRST (no API call)
      let fuzzyResults: ArtistSearchResult[] = [];
      try {
        fuzzyResults = await this.getFuzzyMatchedResults(query, limit);
        console.log(`🎯 Found ${fuzzyResults.length} artists from local database`);
      } catch (fuzzyError) {
        console.warn('⚠️  Could not get fuzzy results from database:', fuzzyError);
      }

      // STEP 2: Return database results immediately (for suggestions/autocomplete)
      if (!useApi) {
        console.log(`✅ Returning ${fuzzyResults.length} results from local database (no API call)`);
        return fuzzyResults;
      }

      // STEP 3: Re-query database to get comprehensive results
      // Note: Ticketmaster API has been removed - we only use database results
      let finalResults: ArtistSearchResult[] = [];
      try {
        finalResults = await this.getFuzzyMatchedResults(query, limit);
        console.log(`🎯 Final database results: ${finalResults.length}`);
      } catch (finalError) {
        console.warn('⚠️  Could not get final results from database:', finalError);
      }

      // Return database results
      if (finalResults.length > 0) {
        return finalResults;
      }

      // No results found
      console.log('📭 No results found in database');
      return [];
    } catch (error) {
      console.error('❌ Error in unified artist search:', error);
      return [];
    }
  }

  /**
   * @deprecated Removed - Ticketmaster API no longer used
   */
  private static async searchTicketmasterAttractions(query: string, limit: number): Promise<any[]> {
    return [];
    console.log(`🎫 START: searchTicketmasterAttractions for "${query}"`);
    const isProduction =
      typeof window !== 'undefined' &&
      window.location.hostname !== 'localhost' &&
      !window.location.hostname.startsWith('127.0.0.1');

    const queryParams = `keyword=${encodeURIComponent(query)}&size=${limit}`;
    const backendUrl = import.meta.env.VITE_BACKEND_URL;
    const remoteFallbackEnv = import.meta.env.VITE_TICKETMASTER_REMOTE_BASE || import.meta.env.VITE_PUBLIC_APP_URL || import.meta.env.VITE_VERCEL_URL;

    const candidateUrls: { url: string; label: string }[] = [];

    if (!isProduction) {
      if (backendUrl) {
        candidateUrls.push({
          url: `${backendUrl.replace(/\/$/, '')}/api/ticketmaster/attractions?${queryParams}`,
          label: 'VITE_BACKEND_URL'
        });
      }

      // Always attempt same-origin path so Vite proxy can handle either local Express or remote target
      candidateUrls.push({
        url: `/api/ticketmaster/attractions?${queryParams}`,
        label: 'Vite proxy (relative path)'
      });
    } else {
      candidateUrls.push({
        url: `/api/ticketmaster/attractions?${queryParams}`,
        label: 'Production relative path'
      });
    }

    if (remoteFallbackEnv) {
      const remoteBases = remoteFallbackEnv.split(',').map(base => base.trim()).filter(Boolean);
      remoteBases.forEach(base => {
        candidateUrls.push({
          url: `${base.replace(/\/$/, '')}/api/ticketmaster/attractions?${queryParams}`,
          label: `Remote fallback (${base})`
        });
      });
    } else {
      candidateUrls.push({
        url: 'https://synth-beta-testing.vercel.app/api/ticketmaster/attractions?' + queryParams,
        label: 'Default remote fallback'
      });
    }

    const attempted: string[] = [];

    for (const candidate of candidateUrls) {
      try {
        console.log(`🎫 Calling Ticketmaster attractions via ${candidate.label}: ${candidate.url}`);
        const response = await fetch(candidate.url);
        attempted.push(`${candidate.label} -> ${response.status}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`⚠️ Ticketmaster attractions (${candidate.label}) error:`, response.status, errorText);
          continue;
        }

        const data = await response.json();
        const attractions =
          data.attractions ||
          data._embedded?.attractions ||
          [];

        console.log(`🎫 Ticketmaster (${candidate.label}) returned ${attractions.length} attractions`);

        if (Array.isArray(attractions) && attractions.length > 0) {
          return attractions;
        }
      } catch (error) {
        attempted.push(`${candidate.label} -> fetch_error`);
        console.error(`❌ Ticketmaster attractions fetch failed via ${candidate.label}:`, error);
      }
    }

    console.warn('⚠️ All Ticketmaster attraction endpoints failed:', attempted.join(' | '));

    const fallbackArtists = this.getFallbackArtists(query, limit);
    if (fallbackArtists.length > 0) {
      console.log('🎯 Using fallback artists due to Ticketmaster error');
      return fallbackArtists;
    }
    return [];
  }

  /**
   * @deprecated Removed - JamBase API no longer used
   */
  private static async searchJamBaseAPI(query: string, limit: number): Promise<any[]> {
    return [];
  }

  /**
   * Get fallback artists when JamBase API is not available
   */
  private static getFallbackArtists(query: string, limit: number): any[] {
    const fallbackArtists = [
      {
        id: 'cage-the-elephant-1',
        name: 'Cage The Elephant',
        identifier: 'jambase:cage-the-elephant-1',
        image: 'https://picsum.photos/300/300?random=1',
        genres: ['alternative rock', 'indie rock', 'garage rock'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 12
      },
      {
        id: 'goose-1',
        name: 'Goose',
        identifier: 'jambase:goose-1',
        image: 'https://picsum.photos/300/300?random=2',
        genres: ['jam band', 'rock', 'funk'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 25
      },
      {
        id: 'phish-1',
        name: 'Phish',
        identifier: 'jambase:194164',
        image: 'https://picsum.photos/300/300?random=3',
        genres: ['rock', 'jam band', 'psychedelic rock'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 12
      },
      {
        id: 'dead-company-1',
        name: 'Dead & Company',
        identifier: 'jambase:123456',
        image: 'https://picsum.photos/300/300?random=4',
        genres: ['rock', 'jam band', 'psychedelic rock'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 8
      },
      {
        id: 'grateful-dead-1',
        name: 'Grateful Dead',
        identifier: 'jambase:789012',
        image: 'https://picsum.photos/300/300?random=5',
        genres: ['rock', 'jam band', 'psychedelic rock'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 0
      },
      {
        id: 'tame-impala-1',
        name: 'Tame Impala',
        identifier: 'jambase:345678',
        image: 'https://picsum.photos/300/300?random=6',
        genres: ['psychedelic rock', 'indie rock', 'electronic'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 15
      },
      {
        id: 'radiohead-1',
        name: 'Radiohead',
        identifier: 'jambase:901234',
        image: 'https://picsum.photos/300/300?random=7',
        genres: ['alternative rock', 'electronic', 'experimental'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 6
      },
      {
        id: 'taylor-swift-1',
        name: 'Taylor Swift',
        identifier: 'jambase:taylor-swift-1',
        image: 'https://picsum.photos/300/300?random=8',
        genres: ['pop', 'country', 'folk'],
        'x-bandOrMusician': 'musician',
        'x-numUpcomingEvents': 50
      },
      {
        id: 'drake-1',
        name: 'Drake',
        identifier: 'jambase:drake-1',
        image: 'https://picsum.photos/300/300?random=9',
        genres: ['hip-hop', 'r&b', 'pop'],
        'x-bandOrMusician': 'musician',
        'x-numUpcomingEvents': 30
      },
      {
        id: 'joe-russo-1',
        name: 'Joe Russo',
        identifier: 'jambase:joe-russo-1',
        image: 'https://picsum.photos/300/300?random=10',
        genres: ['rock', 'jam band', 'drummer'],
        'x-bandOrMusician': 'musician',
        'x-numUpcomingEvents': 5
      },
      {
        id: 'joe-russo-almost-dead-1',
        name: 'Joe Russo\'s Almost Dead',
        identifier: 'jambase:joe-russo-almost-dead-1',
        image: 'https://picsum.photos/300/300?random=11',
        genres: ['jam band', 'rock', 'grateful dead'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 15
      }
    ];

    // Filter artists that match the query using fuzzy matching
    const scoredArtists = fallbackArtists.map(artist => ({
      ...artist,
      match_score: this.calculateFuzzyMatchScore(query, artist.name)
    }));

    // Only return artists with good matches (above 15% similarity)
    const matchingArtists = scoredArtists
      .filter(artist => artist.match_score > 15)
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, limit);

    console.log(`🎯 Fallback search for "${query}": ${matchingArtists.length} matches found`);
    return matchingArtists;
  }

  /**
   * @deprecated Removed - API population no longer used
   */
  private static async populateArtistProfiles(jamBaseArtists: any[]): Promise<ArtistProfile[]> {
    const populatedArtists: ArtistProfile[] = [];

    // Skip database population if no artists to process
    if (!jamBaseArtists || jamBaseArtists.length === 0) {
      return populatedArtists;
    }

    for (const jamBaseArtist of jamBaseArtists) {
      try {
        const artistId = jamBaseArtist.identifier?.split(':')[1] || jamBaseArtist.identifier || jamBaseArtist.id;

        if (!artistId) {
          console.warn(`⚠️ Skipping artist ${jamBaseArtist.name} - no identifier available`);
          continue;
        }
        
        // Check if artist already exists (handle 406 and other errors gracefully)
        let existingArtist = null;
        try {
          const { data, error: checkError } = await supabase
          .from('artists_with_external_ids')
          .select('*')
          .eq('jambase_artist_id', artistId)
            .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 results gracefully

          if (data && !checkError) {
            existingArtist = data;
          }

          // Handle 406 errors specifically (Not Acceptable - usually RLS or header issues)
          // Check for 406 status in error message or code
          const is406Error = checkError && (
            checkError.code === 'PGRST301' || 
            (checkError as any).status === 406 ||
            (checkError.message?.includes('406') || checkError.message?.includes('Not Acceptable'))
          );
          if (is406Error) {
            console.warn(`⚠️  406 error checking artist ${jamBaseArtist.name}, continuing anyway:`, checkError.message);
            // Continue to try inserting - the insert might work even if the select failed
          } else if (checkError && checkError.code !== 'PGRST116') {
          console.warn(`⚠️  Database error checking artist ${jamBaseArtist.name}:`, checkError);
          }
        } catch (checkErr) {
          console.warn(`⚠️  Exception checking artist ${jamBaseArtist.name}:`, checkErr);
        }

        if (existingArtist) {
          console.log(`♻️  Artist ${jamBaseArtist.name} already exists in database`);
          populatedArtists.push(existingArtist as any);
          continue;
        }

        // Save to database using the actual 'artists' table schema (jambase_artist_id column removed)
        const artistData = {
          name: jamBaseArtist.name,
          identifier: jamBaseArtist.identifier,
          url: jamBaseArtist.url || null,
          image_url: jamBaseArtist.image || null,
          date_published: new Date().toISOString(),
          date_modified: new Date().toISOString()
        };
        
        // Check if artist already exists (handle 406 errors gracefully)
        let existingArtistRecord = null;
        try {
          const { data, error: checkError } = await supabase
          .from('artists_with_external_ids')
          .select('id')
          .eq('jambase_artist_id', artistId)
            .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 results gracefully

          if (data && !checkError) {
            existingArtistRecord = data;
          }

          // Handle 406 errors specifically
          // Check for 406 status in error message or code
          const is406Error = checkError && (
            checkError.code === 'PGRST301' || 
            (checkError as any).status === 406 ||
            (checkError.message?.includes('406') || checkError.message?.includes('Not Acceptable'))
          );
          if (is406Error) {
            console.warn(`⚠️  406 error checking artist ${jamBaseArtist.name} for update, will try insert:`, checkError.message);
            existingArtistRecord = null; // Treat as new artist if check fails
          } else if (checkError && checkError.code !== 'PGRST116') {
            console.warn(`⚠️  Error checking artist ${jamBaseArtist.name}:`, checkError);
          }
        } catch (checkErr) {
          console.warn(`⚠️  Exception checking artist ${jamBaseArtist.name}:`, checkErr);
          existingArtistRecord = null; // Treat as new artist if check fails
        }
        
        let savedArtist;
        if (existingArtistRecord) {
          // Update existing artist
          const { data, error } = await supabase
            .from('artists')
            .update(artistData)
            .eq('id', existingArtistRecord.id)
            .select()
            .maybeSingle();
          
          if (error) {
            console.error(`❌ Error updating artist ${jamBaseArtist.name}:`, error);
            savedArtist = existingArtistRecord;
          } else {
            savedArtist = data;
            // Ensure external_entity_ids is updated
            await supabase
              .from('external_entity_ids')
              .upsert({
                entity_type: 'artist',
                entity_uuid: savedArtist.id,
                source: 'jambase',
                external_id: artistId
              }, { onConflict: 'entity_uuid,source,entity_type' })
              .catch(() => {}); // Ignore errors
          }
        } else {
          // Insert new artist
          const { data, error } = await supabase
            .from('artists')
            .insert(artistData)
            .select()
            .maybeSingle();
          
          if (error) {
            console.error(`❌ Error inserting artist ${jamBaseArtist.name}:`, error);
            savedArtist = null;
          } else {
            savedArtist = data;
            // Insert into external_entity_ids for normalization
            await supabase
              .from('external_entity_ids')
              .insert({
                entity_type: 'artist',
                entity_uuid: savedArtist.id,
                source: 'jambase',
                external_id: artistId
              })
              .catch(() => {}); // Ignore duplicate errors
          }
        }

        if (!savedArtist) {
          console.error(`❌ Failed to save artist ${jamBaseArtist.name}`);
          continue;
        }

        console.log(`✅ Saved artist ${jamBaseArtist.name} to database`);
        populatedArtists.push(savedArtist as any);
      } catch (error) {
        console.error(`❌ Error processing artist ${jamBaseArtist.name}:`, error);
        const fallbackArtistId = jamBaseArtist.identifier?.split(':')[1] || jamBaseArtist.identifier || jamBaseArtist.id;
        if (!fallbackArtistId) {
          continue;
        }
        // Still add the artist to results even if we can't process it fully
        populatedArtists.push({
          id: jamBaseArtist.id || fallbackArtistId,
          jambase_artist_id: fallbackArtistId,
          name: jamBaseArtist.name,
          description: jamBaseArtist.description || `Artist: ${jamBaseArtist.name}`,
          genres: jamBaseArtist.genres || [],
          image_url: jamBaseArtist.image,
          popularity_score: jamBaseArtist['x-numUpcomingEvents'] || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          identifier: jamBaseArtist.identifier || fallbackArtistId,
          band_or_musician: jamBaseArtist['x-bandOrMusician'] || 'band',
          num_upcoming_events: jamBaseArtist['x-numUpcomingEvents'] || 0,
          last_synced_at: new Date().toISOString()
        } as any);
        continue;
      }
    }

    return populatedArtists;
  }

  /**
   * @deprecated Removed - JamBase API no longer used
   */
  private static async fetchFullArtistDetails(artistId: string): Promise<JamBaseArtistResponse> {
    throw new Error('JamBase API removed - use database queries instead');
  }

  /**
   * Get fuzzy matched results from Supabase by searching events table
   */
  private static async getFuzzyMatchedResults(query: string, limit: number): Promise<ArtistSearchResult[]> {
    try {
      // First, try to get artists directly from artists table
      const { data: artistsFromTable, error: artistsError } = await supabase
        .from('artists')
        .select('id, jambase_artist_id, name, identifier, image_url, genres')
        .ilike('name', `%${query}%`)
        .limit(Math.max(100, limit * 10));

      // Get events from database to extract unique artists (for artists not in artists table)
      const { data: events, error: eventsError } = await (supabase as any)
        .from('events')
        .select('artist_name, genres')
        .ilike('artist_name', `%${query}%`)
        .order('event_date', { ascending: false })
        .limit(Math.max(100, limit * 10));

      if (artistsError && eventsError) {
        console.warn(`⚠️  Database error getting artists/events: ${artistsError.message}`);
        return [];
      }

      // Build artist map from artists table first (preferred source)
      const artistMap = new Map<string, any>();
      
      if (artistsFromTable && artistsFromTable.length > 0) {
        artistsFromTable.forEach(artist => {
          if (artist.name) {
            artistMap.set(artist.name.toLowerCase(), {
              id: artist.id, // Always use UUID from artists table
              name: artist.name,
              identifier: artist.identifier || `jambase:${artist.jambase_artist_id || artist.id}`,
              image_url: artist.image_url,
              genres: artist.genres || [],
              band_or_musician: 'band' as 'band' | 'musician',
              num_upcoming_events: 0,
              eventCount: 0
            });
          }
        });
      }

      // Add artists from events if not already in map
      // Only include artists that exist in the artists table (to ensure we have UUIDs)
      if (events && events.length > 0) {
        // First, get unique artist names from events and fetch their full data from artists table
        const eventArtistNames = [...new Set(events.map(e => e.artist_name).filter(Boolean))];
        if (eventArtistNames.length > 0) {
          const { data: eventArtists } = await supabase
            .from('artists')
            .select('id, name, image_url, identifier, jambase_artist_id, genres')
            .in('name', eventArtistNames);
          
          // Create a map of artist names to full artist data
          const eventArtistsMap = new Map<string, any>();
          if (eventArtists) {
            eventArtists.forEach(artist => {
              if (artist.name) {
                eventArtistsMap.set(artist.name.toLowerCase(), artist);
              }
            });
          }
          
          // Only process events for artists that exist in the artists table
          events.forEach(event => {
            if (event.artist_name) {
              const artistName = event.artist_name;
              const key = artistName.toLowerCase();
              const artistFromTable = eventArtistsMap.get(key);
              
              // Only add if artist exists in artists table (has UUID)
              if (artistFromTable && !artistMap.has(key)) {
                artistMap.set(key, {
                  id: artistFromTable.id, // Use UUID from artists table
                  name: artistFromTable.name,
                  identifier: artistFromTable.identifier || `jambase:${artistFromTable.jambase_artist_id || artistFromTable.id}`,
                  image_url: artistFromTable.image_url,
                  genres: artistFromTable.genres || event.genres || [],
                  band_or_musician: 'band' as 'band' | 'musician',
                  num_upcoming_events: 0,
                  eventCount: 0
                });
              }
              
              // Increment event count if artist is in map
              if (artistMap.has(key)) {
                artistMap.get(key)!.eventCount++;
              }
            }
          });
        }
      }

      if (artistMap.size === 0) {
        console.log('📭 No artists found in database for artist search');
        return [];
      }

      // Convert to array and calculate match scores
      const artists = Array.from(artistMap.values()).map(artist => {
        const result = {
        id: artist.id,
        name: artist.name,
        identifier: artist.identifier,
          image_url: artist.image_url || undefined, // Ensure undefined instead of null for React
        genres: artist.genres,
        band_or_musician: artist.band_or_musician,
        num_upcoming_events: artist.eventCount,
        match_score: this.calculateFuzzyMatchScore(query, artist.name),
        is_from_database: true,
        };
        // Debug logging
        if (!result.image_url) {
          console.log(`⚠️ Artist "${artist.name}" has no image_url`);
        }
        return result;
      });

      // Filter out very low matches and sort by score
      return artists
        .filter(artist => artist.match_score > 15) // Original threshold for better artist matching
        .sort((a, b) => b.match_score - a.match_score)
        .slice(0, limit);
    } catch (error) {
      console.error('❌ Error getting fuzzy matched results:', error);
      return [];
    }
  }

  /**
   * Calculate fuzzy match score between query and artist name
   * Enhanced algorithm to handle band names with apostrophes and special cases
   */
  static calculateFuzzyMatchScore(query: string, artistName: string): number {
    const queryLower = query.toLowerCase().trim();
    const nameLower = artistName.toLowerCase().trim();
    
    // Exact match
    if (nameLower === queryLower) {
      return 100;
    }
    
    // Starts with query (high priority)
    if (nameLower.startsWith(queryLower)) {
      return 95;
    }
    
    // Contains query as substring (boosted priority for band names)
    if (nameLower.includes(queryLower)) {
      const coverage = queryLower.length / nameLower.length;
      // Higher score when query is contained in artist name (like "Joe Russo" in "Joe Russo's Almost Dead")
      if (coverage >= 0.3) {
        return 85 + Math.round(coverage * 10);
      } else {
        return 70 + Math.round(coverage * 15);
      }
    }
    
    // Handle word-based matching with special characters
    const queryWords = queryLower.split(/[\s']+/).filter(w => w.length > 0);
    const nameWords = nameLower.split(/[\s']+/).filter(w => w.length > 0);
    
    if (queryWords.length > 1) {
      let wordMatches = 0;
      for (const queryWord of queryWords) {
        if (nameWords.includes(queryWord)) {
          wordMatches++;
        }
      }
      
      // For multi-word queries, require at least 50% word match
      if (wordMatches >= Math.ceil(queryWords.length * 0.5)) {
        return 80 + (wordMatches / queryWords.length) * 15;
      }
    }
    
    // Single word exact match in multi-word artist name
    if (queryWords.length === 1 && nameWords.includes(queryWords[0])) {
      return 85;
    }
    
    // Partial word matches (more permissive)
    let partialMatches = 0;
    for (const queryWord of queryWords) {
      for (const nameWord of nameWords) {
        if (nameWord.includes(queryWord) || queryWord.includes(nameWord)) {
          partialMatches++;
          break;
        }
      }
    }
    
    if (partialMatches > 0) {
      return 50 + (partialMatches / queryWords.length) * 30;
    }
    
    // Levenshtein distance (more permissive)
    const distance = this.levenshteinDistance(queryLower, nameLower);
    const maxLength = Math.max(queryLower.length, nameLower.length);
    const similarity = 1 - (distance / maxLength);
    
    if (similarity > 0.5) {
      return Math.round(similarity * 60);
    }
    
    return 0;
  }

  /**
   * Search for all content types (artists, events, users) based on query
   */
  static async searchAllContent(query: string, limit: number = 20, useApi: boolean = false): Promise<{
    artists: ArtistSearchResult[];
    events: any[];
    users: any[];
  }> {
    try {
      console.log(`🔍 Searching all content for: "${query}" with limit: ${limit} (useApi: ${useApi})`);

      // Search artists (useApi controls whether to call external APIs)
      console.log(`🎤 Searching artists with limit: ${Math.floor(limit * 0.5)}`);
      const artists = await this.searchArtists(query, Math.floor(limit * 0.5), useApi);
      
      // Search events (from jambase_events table)
      console.log(`🎵 Searching events with limit: ${Math.floor(limit * 0.3)}`);
      const events = await this.searchEvents(query, Math.floor(limit * 0.3));
      
      // Search users (from profiles table)
      console.log(`👤 Searching users with limit: ${Math.floor(limit * 0.2)}`);
      const users = await this.searchUsers(query, Math.floor(limit * 0.2));

      console.log(`📊 Search results summary:`, {
        artists: artists.length,
        events: events.length,
        users: users.length
      });

      return { artists, events, users };
    } catch (error) {
      console.error('❌ Error searching all content:', error);
      return { artists: [], events: [], users: [] };
    }
  }

  /**
   * Search for events by artist name or venue
   */
  private static async searchEvents(query: string, limit: number): Promise<any[]> {
    try {
      console.log(`🎵 Searching events for: "${query}" with limit: ${limit}`);
      
      const { data: events, error } = await (supabase as any)
        .from('events')
        .select('*')
        .or(`artist_name.ilike.%${query}%,venue_name.ilike.%${query}%,title.ilike.%${query}%`)
        .order('event_date', { ascending: true })
        .limit(limit);

      if (error) {
        console.warn('⚠️  Error searching events:', error);
        return [];
      }

      console.log(`🎵 Found ${events?.length || 0} events:`, events?.map(e => e.title || e.artist_name));
      return events || [];
    } catch (error) {
      console.error('❌ Error searching events:', error);
      return [];
    }
  }

  /**
   * Search for users by name or bio
   */
  private static async searchUsers(query: string, limit: number): Promise<any[]> {
    try {
      console.log(`👤 Searching users for: "${query}" with limit: ${limit}`);
      
      const { data: users, error } = await supabase
        .from('users')
        .select('user_id, name, bio, avatar_url, instagram_handle')
        .or(`name.ilike.%${query}%,bio.ilike.%${query}%,instagram_handle.ilike.%${query}%`)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('⚠️  Error searching users:', error);
        return [];
      }

      console.log(`👤 Found ${users?.length || 0} users:`, users?.map(u => u.name));
      return users || [];
    } catch (error) {
      console.error('❌ Error searching users:', error);
      return [];
    }
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }
    
    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Get artist suggestions for autocomplete (simplified version)
   */
  static async getArtistSuggestions(query: string, limit: number = 10): Promise<ArtistSearchResult[]> {
    return this.searchArtists(query, limit);
  }

  /**
   * Get artist by ID from database
   */
  static async getArtistById(artistId: string): Promise<ArtistProfile | null> {
    // Use helper view for normalized schema
    const { data, error } = await supabase
      .from('artists_with_external_ids')
      .select('*')
      .eq('jambase_artist_id', artistId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Database error: ${error.message}`);
    }

    return data as any;
  }

  /**
   * Get all artists from database (for debugging)
   */
  static async getAllArtists(limit: number = 50): Promise<ArtistProfile[]> {
    const { data, error } = await supabase
      .from('artists')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return (data || []) as any;
  }

  /**
   * Clear all artists from database (for testing)
   */
  static async clearAllArtists(): Promise<void> {
    const { error } = await supabase
      .from('artists')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }
  }

  /**
   * @deprecated Removed - JamBase API no longer used
   */
  /**
   * @deprecated Removed - JamBase API no longer used
   */
  static async testJamBaseAPI(): Promise<{ success: boolean; message: string; data?: any }> {
    return {
      success: false,
      message: 'JamBase API has been removed. Use database queries instead.'
    };
  }
}
