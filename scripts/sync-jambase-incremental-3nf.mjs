/**
 * Daily Incremental Jambase Sync - 3NF Compliant
 * 
 * Strategy:
 * 1. Fetch events modified since MAX(last_modified_at) from events table
 * 2. Use external_entity_ids table as source of truth for deduplication
 * 3. For each event, check external_entity_ids to see if it exists
 * 4. For each artist/venue, check external_entity_ids to see if it exists
 * 5. Only insert new entities, update existing ones
 * 6. Maintain external_entity_ids table for all entities
 * 
 * This minimizes API calls by only fetching changed events and ensures
 * no duplicates using the normalized external_entity_ids table.
 */

import JambaseSyncService from '../backend/jambase-sync-service.mjs';
import { fetchGenresForArtist, isEmptyGenres } from './fetch-artist-genres.mjs';

class IncrementalSync3NF {
  constructor(syncService) {
    this.syncService = syncService;
    this.stats = {
      eventsNew: 0,
      eventsUpdated: 0,
      artistsNew: 0,
      artistsUpdated: 0,
      venuesNew: 0,
      venuesUpdated: 0,
      apiCalls: 0
    };
  }

  /**
   * Get the most recent last_modified_at from events table
   */
  async getLastSyncTimestamp() {
    const { data, error } = await this.syncService.supabase
      .from('events')
      .select('last_modified_at')
      .eq('source', 'jambase')
      .not('last_modified_at', 'is', null)
      .order('last_modified_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data?.last_modified_at || null;
  }

  /**
   * Get existing entity UUIDs for a batch of external IDs
   * Returns: Map<externalId, entityUuid>
   */
  async getExistingEntityMap(source, entityType, externalIds) {
    if (externalIds.length === 0) return new Map();

    const { data, error } = await this.syncService.supabase
      .from('external_entity_ids')
      .select('external_id, entity_uuid')
      .eq('source', source)
      .eq('entity_type', entityType)
      .in('external_id', externalIds);

    if (error) {
      throw error;
    }

    const map = new Map();
    if (data) {
      for (const row of data) {
        map.set(row.external_id, row.entity_uuid);
      }
    }

    return map;
  }

  /**
   * Upsert external_entity_ids entry
   */
  async upsertExternalId(entityUuid, source, entityType, externalId) {
    const { error } = await this.syncService.supabase
      .from('external_entity_ids')
      .upsert({
        entity_uuid: entityUuid,
        source: source,
        entity_type: entityType,
        external_id: externalId
      }, {
        onConflict: 'source,entity_type,external_id',
        ignoreDuplicates: false
      });

    if (error) {
      throw error;
    }
  }

  /**
   * Batch upsert artists using external_entity_ids for deduplication
   * Returns: Map<jambase_artist_id, artist_uuid>
   */
  async upsertArtists3NF(artistsData) {
    if (!artistsData || artistsData.length === 0) {
      return new Map();
    }

    // Deduplicate by jambase_artist_id
    const uniqueArtists = new Map();
    for (const artist of artistsData) {
      if (artist && artist.jambase_artist_id) {
        uniqueArtists.set(artist.jambase_artist_id, artist);
      }
    }

    const artistsArray = Array.from(uniqueArtists.values());
    if (artistsArray.length === 0) {
      return new Map();
    }

    // Get existing artists from external_entity_ids
    const artistExternalIds = artistsArray.map(a => a.jambase_artist_id);
    const existingArtistsMap = await this.getExistingEntityMap('jambase', 'artist', artistExternalIds);

    const artistUuidMap = new Map();
    const newArtists = [];
    const updateArtists = [];

    // Separate new vs existing artists
    for (const artistData of artistsArray) {
      const jambaseArtistId = artistData.jambase_artist_id;
      const existingUuid = existingArtistsMap.get(jambaseArtistId);

      if (existingUuid) {
        // Will update existing
        updateArtists.push({ uuid: existingUuid, data: artistData });
        artistUuidMap.set(jambaseArtistId, existingUuid);
      } else {
        // Will insert new
        newArtists.push(artistData);
      }
    }

    // Insert new artists
    if (newArtists.length > 0) {
      // Fetch genres for new artists that have empty genres
      for (const artist of newArtists) {
        if (isEmptyGenres(artist.genres)) {
          console.log(`  🔍 Fetching genres for new artist: ${artist.name}`);
          try {
            const { genres: fetchedGenres, source } = await fetchGenresForArtist({
              id: artist.identifier || artist.jambase_artist_id,
              name: artist.name,
              external_identifiers: artist.external_identifiers
            });
            
            if (fetchedGenres && fetchedGenres.length > 0) {
              artist.genres = fetchedGenres;
              console.log(`  ✓ Found genres via ${source}: ${fetchedGenres.slice(0, 2).join(', ')}`);
            } else {
              // Set default genre for artists without genres
              artist.genres = ['small artist'];
              console.log(`  ⚠️  No genres found, setting default: small artist`);
            }
          } catch (error) {
            console.warn(`  ⚠️  Error fetching genres for ${artist.name}: ${error.message}`);
            // Set default genre on error
            artist.genres = ['small artist'];
          }
        }
      }
      
      // Remove jambase_artist_id and artist_data_source from data (they're not columns, just used for deduplication)
      const artistsToInsert = newArtists.map(artist => {
        const { jambase_artist_id, artist_data_source, ...artistData } = artist;
        return {
          ...artistData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_synced_at: new Date().toISOString()
        };
      });

      // Use upsert with onConflict to handle duplicate identifiers gracefully
      const { data: inserted, error } = await this.syncService.supabase
        .from('artists')
        .upsert(artistsToInsert, {
          onConflict: 'identifier',
          ignoreDuplicates: false
        })
        .select('id, identifier');

      if (error) {
        throw error;
      }

      if (inserted) {
        for (const artist of inserted) {
          // Extract Jambase ID from identifier (format: "jambase:3953048")
          const jambaseId = artist.identifier?.replace(/^jambase:/, '');
          if (jambaseId) {
            artistUuidMap.set(jambaseId, artist.id);
            this.stats.artistsNew++;

            // Create external_entity_ids entry
            await this.upsertExternalId(artist.id, 'jambase', 'artist', jambaseId);
          }
        }
      }
    }

    // Update existing artists
    for (const { uuid, data } of updateArtists) {
      // Remove jambase_artist_id and artist_data_source from data (they're not columns)
      const { jambase_artist_id, artist_data_source, genres: newGenres, ...artistData } = data;
      
      // ALWAYS fetch existing genres to preserve them
      const { data: existingArtist, error: fetchError } = await this.syncService.supabase
        .from('artists')
        .select('genres')
        .eq('id', uuid)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      // Start with existing genres
      const existingGenres = existingArtist?.genres || [];
      const existingArray = Array.isArray(existingGenres) 
        ? existingGenres 
        : (existingGenres ? [existingGenres] : []);
      
      // Only merge if newGenres is provided AND not empty
      let mergedGenres = [...existingArray];
      
      // Check if newGenres is valid (not null, not undefined, not empty array)
      const hasValidNewGenres = newGenres && 
        Array.isArray(newGenres) && 
        newGenres.length > 0 && 
        !isEmptyGenres(newGenres);
      
      if (hasValidNewGenres) {
        // Deduplicate (case-insensitive)
        const genreMap = new Map();
        
        // Add existing genres first (preserve them)
        for (const genre of existingArray) {
          if (genre) {
            const key = String(genre).toLowerCase().trim();
            if (!genreMap.has(key)) {
              genreMap.set(key, String(genre).trim());
            }
          }
        }
        
        // Add new genres
        for (const genre of newGenres) {
          if (genre) {
            const key = String(genre).toLowerCase().trim();
            genreMap.set(key, String(genre).trim());
          }
        }
        
        mergedGenres = Array.from(genreMap.values());
      }
      
      // Only update genres if we have valid merged genres OR if existing genres are empty
      // Never overwrite existing genres with empty array
      const shouldUpdateGenres = mergedGenres.length > 0 || existingArray.length === 0;
      
      const updateData = {
        ...artistData,
        updated_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString()
      };
      
      // Only include genres in update if we should update them
      if (shouldUpdateGenres) {
        updateData.genres = mergedGenres.length > 0 ? mergedGenres : existingArray;
      }
      
      const { error } = await this.syncService.supabase
        .from('artists')
        .update(updateData)
        .eq('id', uuid);

      if (error) {
        throw error;
      }

      this.stats.artistsUpdated++;
    }

    return artistUuidMap;
  }

  /**
   * Batch upsert venues using external_entity_ids for deduplication
   * Returns: Map<jambase_venue_id, venue_uuid> (or Map<"name:venueName", venue_uuid> for venues without IDs)
   */
  async upsertVenues3NF(venuesData) {
    if (!venuesData || venuesData.length === 0) {
      return new Map();
    }

    // Deduplicate by jambase_venue_id (handle nulls)
    const uniqueVenues = new Map();
    const venuesWithoutId = [];

    for (const venue of venuesData) {
      if (venue && venue.jambase_venue_id) {
        uniqueVenues.set(venue.jambase_venue_id, venue);
      } else if (venue && venue.name) {
        venuesWithoutId.push(venue);
      }
    }

    const venuesArray = Array.from(uniqueVenues.values());
    const venueUuidMap = new Map();

    // Handle venues with Jambase IDs
    if (venuesArray.length > 0) {
      // Get existing venues from external_entity_ids
      const venueExternalIds = venuesArray.map(v => v.jambase_venue_id);
      const existingVenuesMap = await this.getExistingEntityMap('jambase', 'venue', venueExternalIds);

      const newVenues = [];
      const updateVenues = [];

      // Separate new vs existing venues
      for (const venueData of venuesArray) {
        const jambaseVenueId = venueData.jambase_venue_id;
        const existingUuid = existingVenuesMap.get(jambaseVenueId);

        if (existingUuid) {
          updateVenues.push({ uuid: existingUuid, data: venueData });
          venueUuidMap.set(jambaseVenueId, existingUuid);
        } else {
          newVenues.push(venueData);
        }
      }

      // Insert new venues
      if (newVenues.length > 0) {
        // Remove jambase_venue_id from data (it's not a column, just used for deduplication)
        const venuesToInsert = newVenues.map(venue => {
          const { jambase_venue_id, ...venueData } = venue;
          return {
            ...venueData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_synced_at: new Date().toISOString()
          };
        });

        const { data: inserted, error } = await this.syncService.supabase
          .from('venues')
          .insert(venuesToInsert)
          .select('id, identifier');

        if (error) {
          throw error;
        }

        if (inserted) {
          for (const venue of inserted) {
            // Extract Jambase ID from identifier (format: "jambase:12345")
            const jambaseId = venue.identifier?.replace(/^jambase:/, '');
            if (jambaseId) {
              venueUuidMap.set(jambaseId, venue.id);
              this.stats.venuesNew++;

              // Create external_entity_ids entry
              await this.upsertExternalId(venue.id, 'jambase', 'venue', jambaseId);
            }
          }
        }
      }

      // Update existing venues
      for (const { uuid, data } of updateVenues) {
        // Remove jambase_venue_id from data (it's not a column)
        const { jambase_venue_id, ...venueData } = data;
        
        const { error } = await this.syncService.supabase
          .from('venues')
          .update({
            ...venueData,
            updated_at: new Date().toISOString(),
            last_synced_at: new Date().toISOString()
          })
          .eq('id', uuid);

        if (error) {
          throw error;
        }

        this.stats.venuesUpdated++;
      }
    }

    // Handle venues without Jambase IDs (name-based lookup)
    for (const venueData of venuesWithoutId) {
      // Remove jambase_venue_id from data (it's not a column)
      const { jambase_venue_id, ...venueDataClean } = venueData;
      
      const { data: existing } = await this.syncService.supabase
        .from('venues')
        .select('id')
        .eq('name', venueDataClean.name)
        .is('identifier', null)
        .maybeSingle();

      let venueUuid;

      if (existing) {
        // Update existing venue
        const { data: updated, error } = await this.syncService.supabase
          .from('venues')
          .update({
            ...venueDataClean,
            updated_at: new Date().toISOString(),
            last_synced_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select('id')
          .single();

        if (error) throw error;
        venueUuid = updated.id;
        this.stats.venuesUpdated++;
      } else {
        // Insert new venue
        const { data: inserted, error } = await this.syncService.supabase
          .from('venues')
          .insert({
            ...venueDataClean,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_synced_at: new Date().toISOString()
          })
          .select('id')
          .single();

        if (error) throw error;
        venueUuid = inserted.id;
        this.stats.venuesNew++;
      }

      venueUuidMap.set(`name:${venueDataClean.name}`, venueUuid);
    }

    return venueUuidMap;
  }

  /**
   * Batch upsert events using external_entity_ids for deduplication
   */
  async upsertEvents3NF(eventsData, artistUuidMap, venueUuidMap) {
    if (!eventsData || eventsData.length === 0) {
      return;
    }

    // Get existing events from external_entity_ids
    // Extract jambase_event_id from eventData (it's in the data but not a column)
    const eventExternalIds = eventsData
      .map(e => {
        // jambase_event_id is in the extracted data but not a column
        // We need to extract it from the data structure
        return e.jambase_event_id || null;
      })
      .filter(Boolean);
    
    const existingEventsMap = await this.getExistingEntityMap('jambase', 'event', eventExternalIds);

    const newEvents = [];
    const updateEvents = [];

    // Separate new vs existing events
    for (const eventData of eventsData) {
      const jambaseEventId = eventData.jambase_event_id;
      if (!jambaseEventId) continue;

      const existingUuid = existingEventsMap.get(jambaseEventId);

      if (existingUuid) {
        // Will update existing event
        updateEvents.push({ uuid: existingUuid, data: eventData, jambaseEventId });
      } else {
        // Will insert new event
        newEvents.push({ eventData, jambaseEventId });
      }
    }

    // Insert new events
    if (newEvents.length > 0) {
      // Fetch artist genres for events that need them
      const artistUuidsToFetch = new Set();
      for (const { eventData } of newEvents) {
        const artistUuid = eventData.artist_jambase_id_text 
          ? artistUuidMap.get(eventData.artist_jambase_id_text) 
          : null;
        if (artistUuid && isEmptyGenres(eventData.genres)) {
          artistUuidsToFetch.add(artistUuid);
        }
      }
      
      // Fetch genres from database for artists
      const artistGenresMap = new Map();
      if (artistUuidsToFetch.size > 0) {
        const { data: artistsWithGenres, error: fetchError } = await this.syncService.supabase
          .from('artists')
          .select('id, genres')
          .in('id', Array.from(artistUuidsToFetch));
        
        if (!fetchError && artistsWithGenres) {
          for (const artist of artistsWithGenres) {
            if (!isEmptyGenres(artist.genres)) {
              artistGenresMap.set(artist.id, artist.genres);
            }
          }
        }
      }
      
      // Map artist/venue Jambase IDs to UUIDs
      const eventsWithUuids = newEvents.map(({ eventData, jambaseEventId }) => {
        const artistUuid = eventData.artist_jambase_id_text 
          ? artistUuidMap.get(eventData.artist_jambase_id_text) 
          : null;
        const venueUuid = eventData.venue_jambase_id_text
          ? venueUuidMap.get(eventData.venue_jambase_id_text)
          : null;

        // Remove fields that don't exist in the schema
        const { 
          jambase_event_id, 
          artist_jambase_id, 
          artist_jambase_id_text, 
          venue_jambase_id, 
          venue_jambase_id_text,
          artist_name,
          venue_name,
          genres: eventGenres,
          ...eventDataClean 
        } = eventData;

        // Use event genres if available, otherwise use artist genres
        let finalGenres = eventGenres;
        if (isEmptyGenres(eventGenres) && artistUuid) {
          const artistGenres = artistGenresMap.get(artistUuid);
          if (!isEmptyGenres(artistGenres)) {
            finalGenres = artistGenres;
          }
        }

        return {
          ...eventDataClean,
          genres: finalGenres,
          artist_id: artistUuid, // UUID FK to artists(id)
          venue_id: venueUuid, // UUID FK to venues(id)
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      });

      const { data: inserted, error } = await this.syncService.supabase
        .from('events')
        .insert(eventsWithUuids)
        .select('id');

      if (error) {
        throw error;
      }

      if (inserted) {
        for (let i = 0; i < inserted.length; i++) {
          const event = inserted[i];
          const jambaseEventId = newEvents[i].jambaseEventId;
          
          this.stats.eventsNew++;

          // Create external_entity_ids entry
          await this.upsertExternalId(event.id, 'jambase', 'event', jambaseEventId);
        }
      }
    }

    // Update existing events
    // First, fetch artist genres for events that need them
    const updateArtistUuidsToFetch = new Set();
    for (const { data } of updateEvents) {
      const artistUuid = data.artist_jambase_id_text 
        ? artistUuidMap.get(data.artist_jambase_id_text) 
        : null;
      if (artistUuid && isEmptyGenres(data.genres)) {
        updateArtistUuidsToFetch.add(artistUuid);
      }
    }
    
    // Fetch genres from database for artists
    const updateArtistGenresMap = new Map();
    if (updateArtistUuidsToFetch.size > 0) {
      const { data: artistsWithGenres, error: fetchError } = await this.syncService.supabase
        .from('artists')
        .select('id, genres')
        .in('id', Array.from(updateArtistUuidsToFetch));
      
      if (!fetchError && artistsWithGenres) {
        for (const artist of artistsWithGenres) {
          if (!isEmptyGenres(artist.genres)) {
            updateArtistGenresMap.set(artist.id, artist.genres);
          }
        }
      }
    }
    
    for (const { uuid, data, jambaseEventId } of updateEvents) {
      const artistUuid = data.artist_jambase_id_text 
        ? artistUuidMap.get(data.artist_jambase_id_text) 
        : null;
      const venueUuid = data.venue_jambase_id_text
        ? venueUuidMap.get(data.venue_jambase_id_text)
        : null;

      // Remove fields that don't exist in the schema
      const { 
        jambase_event_id, 
        artist_jambase_id, 
        artist_jambase_id_text, 
        venue_jambase_id, 
        venue_jambase_id_text,
        artist_name,
        venue_name,
        genres: eventGenres,
        ...eventDataClean 
      } = data;

      // Use event genres if available, otherwise use artist genres
      let finalGenres = eventGenres;
      if (isEmptyGenres(eventGenres) && artistUuid) {
        const artistGenres = updateArtistGenresMap.get(artistUuid);
        if (!isEmptyGenres(artistGenres)) {
          finalGenres = artistGenres;
        }
      }

      const updateData = {
        ...eventDataClean,
        artist_id: artistUuid, // UUID FK to artists(id)
        venue_id: venueUuid, // UUID FK to venues(id)
        updated_at: new Date().toISOString()
      };
      
      // Only update genres if we have valid genres (don't overwrite with empty)
      if (!isEmptyGenres(finalGenres)) {
        updateData.genres = finalGenres;
      }

      const { error } = await this.syncService.supabase
        .from('events')
        .update(updateData)
        .eq('id', uuid);

      if (error) {
        throw error;
      }

      this.stats.eventsUpdated++;
    }
  }

  /**
   * Process a page of events with 3NF compliance
   */
  async processPage3NF(jambaseEvents) {
    // Step 1: Extract all artist and venue data
    const artistsData = [];
    const venuesData = [];
    const eventsData = [];

    for (const jambaseEvent of jambaseEvents) {
      const headliner = jambaseEvent.performer?.find(p => p['x-isHeadliner']) || jambaseEvent.performer?.[0];
      if (headliner) {
        const artistData = this.syncService.extractArtistData(headliner);
        if (artistData) {
          artistsData.push(artistData);
        }
      }

      if (jambaseEvent.location) {
        const venueData = this.syncService.extractVenueData(jambaseEvent.location);
        if (venueData) {
          venuesData.push(venueData);
        }
      }
    }

    // Step 2: Upsert artists (returns UUID map)
    const artistUuidMap = await this.upsertArtists3NF(artistsData);

    // Step 3: Upsert venues (returns UUID map)
    const venueUuidMap = await this.upsertVenues3NF(venuesData);

    // Step 4: Extract event data
    for (const jambaseEvent of jambaseEvents) {
      const headliner = jambaseEvent.performer?.find(p => p['x-isHeadliner']) || jambaseEvent.performer?.[0];
      const venue = jambaseEvent.location;

      const jambaseArtistId = headliner?.identifier?.replace(/^jambase:/, '');
      const jambaseVenueId = venue?.identifier?.replace(/^jambase:/, '');
      
      // Get UUIDs from maps (will be null if not found, which is handled in upsert)
      const artistUuid = jambaseArtistId ? artistUuidMap.get(jambaseArtistId) : null;
      const venueUuid = jambaseVenueId ? venueUuidMap.get(jambaseVenueId) : null;

      const eventData = this.syncService.extractEventData(
        jambaseEvent,
        artistUuid,
        venueUuid,
        jambaseArtistId,
        jambaseVenueId
      );

      if (eventData) {
        eventsData.push(eventData);
      }
    }

    // Step 5: Upsert events
    await this.upsertEvents3NF(eventsData, artistUuidMap, venueUuidMap);
  }

  /**
   * Search for events by artist name and sync them
   */
  async syncPriorityArtists(artistNames) {
    if (!artistNames || artistNames.length === 0) {
      return;
    }

    console.log(`\n🎵 Syncing ${artistNames.length} priority artist(s)...\n`);

    for (const artistName of artistNames) {
      try {
        console.log(`  🔍 Searching for "${artistName}"...`);
        
        // Search JamBase API for events by artist name
        const apiKey = this.syncService.jambaseApiKey;
        const baseUrl = 'https://www.jambase.com/jb-api/v1/events';
        const params = new URLSearchParams({
          apikey: apiKey,
          artistName: artistName,
          expandExternalIdentifiers: 'true',
          perPage: '50',
          page: '1'
        });
        
        const url = `${baseUrl}?${params.toString()}`;
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Synth/1.0'
          },
          signal: AbortSignal.timeout(30000)
        });
        
        if (!response.ok) {
          console.log(`  ⚠️  Could not fetch events for "${artistName}" (${response.status})`);
          continue;
        }
        
        const data = await response.json();
        
        if (!data.success || !data.events || data.events.length === 0) {
          console.log(`  ⚠️  No events found for "${artistName}"`);
          continue;
        }
        
        console.log(`  ✅ Found ${data.events.length} event(s) for "${artistName}"`);
        
        // Process the events (this will extract and sync artists)
        await this.processPage3NF(data.events);
        console.log(`  ✅ Synced "${artistName}" and ${data.events.length} event(s)`);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`  ❌ Error syncing "${artistName}":`, error.message);
      }
    }
  }

  /**
   * Run incremental sync
   */
  async run() {
    console.log('🔄 Starting Daily Incremental Sync (3NF Compliant)...\n');

    // Priority artists to always sync (even if they don't have recently modified events)
    const PRIORITY_ARTISTS = [
      'Beyonce',
      'Beach House',
      'Glass Animals',
      'Gracie Abrams'
    ];

    // Step 1: Sync priority artists first
    await this.syncPriorityArtists(PRIORITY_ARTISTS);

    // Step 2: Get last sync timestamp
    const lastModifiedAt = await this.getLastSyncTimestamp();
    if (!lastModifiedAt) {
      console.log('\n⚠️  No previous sync found. Run full sync first.');
      return;
    }

    console.log(`\n📅 Last sync: ${lastModifiedAt}\n`);

    // Step 3: Fetch events modified since last sync
    const dateModifiedFrom = new Date(lastModifiedAt).toISOString();
    let currentPage = 1;
    let totalPages = 1;
    const perPage = 100;

    while (currentPage <= totalPages) {
      const pageData = await this.syncService.fetchEventsPage(
        currentPage,
        perPage,
        dateModifiedFrom
      );

      if (!pageData.events || pageData.events.length === 0) {
        if (currentPage === 1) {
          console.log('✅ No new or modified events found');
        }
        break;
      }

      await this.processPage3NF(pageData.events);
      console.log(`✅ Processed page ${currentPage}/${totalPages} (${pageData.events.length} events)`);

      totalPages = pageData.totalPages || 1;
      currentPage++;

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Print statistics
    console.log('\n✨ Incremental Sync Complete!');
    console.log('\n📈 Statistics:');
    console.log(`   Events: ${this.stats.eventsNew} new, ${this.stats.eventsUpdated} updated`);
    console.log(`   Artists: ${this.stats.artistsNew} new, ${this.stats.artistsUpdated} updated`);
    console.log(`   Venues: ${this.stats.venuesNew} new, ${this.stats.venuesUpdated} updated`);
    console.log(`   API calls: ${this.syncService.getStats().apiCalls}`);
  }
}

// Main execution
async function main() {
  // Ensure output is not buffered for launchd
  if (process.stdout.isTTY === false) {
    process.stdout.write = ((originalWrite) => {
      return function(chunk, encoding, callback) {
        originalWrite.call(process.stdout, chunk, encoding, callback);
        // Force flush
        if (typeof chunk === 'string') {
          try {
            require('fs').appendFileSync(
              '/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/logs/launchd-sync.log',
              chunk,
              { flag: 'a' }
            );
          } catch (e) {
            // Ignore file write errors
          }
        }
      };
    })(process.stdout.write);
  }

  try {
    const dotenv = await import('dotenv');
    dotenv.default.config({ path: '.env.local' });
    
    // Map VITE_ prefixed variables to expected names if not already set
    if (process.env.VITE_SUPABASE_URL && !process.env.SUPABASE_URL) {
      process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    }
    if (process.env.VITE_SUPABASE_ANON_KEY && !process.env.SUPABASE_ANON_KEY) {
      process.env.SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
    }
  } catch (e) {
    // dotenv not installed, assume env vars are already set
  }

  console.log(`🔄 Starting Daily Incremental Sync (3NF Compliant)...`);
  console.log(`📅 Started at: ${new Date().toISOString()}`);

  const syncService = new JambaseSyncService();
  const incrementalSync = new IncrementalSync3NF(syncService);
  await incrementalSync.run();

  console.log(`✅ Sync completed at: ${new Date().toISOString()}`);
}

main().catch(error => {
  const errorMsg = `❌ Fatal error at ${new Date().toISOString()}: ${error.message}\n${error.stack}\n`;
  console.error(errorMsg);
  // Also write to error log file directly
  try {
    require('fs').appendFileSync(
      '/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/logs/launchd-sync-error.log',
      errorMsg,
      { flag: 'a' }
    );
  } catch (e) {
    // Ignore file write errors
  }
  process.exit(1);
});

