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

/**
 * Event genres: if and only if the event's genres are empty, use the artist's genres.
 * Never overwrite non-empty event genres.
 * @param {*} eventGenres - genres from the event
 * @param {*} artistGenres - genres from the artist (may be undefined if not fetched)
 * @returns genres to store on the event
 */
function eventGenresFromArtistIfEmpty(eventGenres, artistGenres) {
  if (!isEmptyGenres(eventGenres)) return eventGenres;
  return !isEmptyGenres(artistGenres) ? artistGenres : eventGenres;
}

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
      genresNormalized: 0,
      apiCalls: 0
    };
  }

  /**
   * Sync normalized genres for an artist by calling the database function
   * @param {string} artistId - UUID of the artist
   * @param {string[]} rawGenres - Array of raw genre strings
   */
  async syncArtistNormalizedGenres(artistId, rawGenres) {
    if (!artistId || !rawGenres || rawGenres.length === 0) return;
    
    try {
      const { error } = await this.syncService.supabase.rpc('sync_artist_genres', {
        p_artist_id: artistId,
        p_raw_genres: rawGenres
      });
      
      if (error) {
        console.warn(`  ⚠️  Error syncing normalized genres for artist ${artistId}: ${error.message}`);
      } else {
        this.stats.genresNormalized++;
      }
    } catch (err) {
      console.warn(`  ⚠️  Exception syncing normalized genres for artist ${artistId}: ${err.message}`);
    }
  }

  /**
   * Sync normalized genres for an event by calling the database function
   * @param {string} eventId - UUID of the event
   * @param {string[]} rawGenres - Array of raw genre strings
   */
  async syncEventNormalizedGenres(eventId, rawGenres) {
    if (!eventId || !rawGenres || rawGenres.length === 0) return;
    
    try {
      const { error } = await this.syncService.supabase.rpc('sync_event_genres', {
        p_event_id: eventId,
        p_raw_genres: rawGenres
      });
      
      if (error) {
        console.warn(`  ⚠️  Error syncing normalized genres for event ${eventId}: ${error.message}`);
      } else {
        this.stats.genresNormalized++;
      }
    } catch (err) {
      console.warn(`  ⚠️  Exception syncing normalized genres for event ${eventId}: ${err.message}`);
    }
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
   * Create location-based key for venue matching
   * This MUST match the algorithm used in backfill-venue-ids.mjs
   * Used to ensure venues created during backfill are found during sync
   * 
   * Note: Uses explicit null checks for coordinates to handle valid 0,0 coordinates
   */
  createLocationKey(venueData) {
    // Support both primary fields (from venue data) and fallback fields (from event data)
    // This ensures venues created by backfill with event data can be found by sync with venue data
    const name = (venueData.name || venueData.venue_name || '').toLowerCase().trim();
    const city = (venueData.city || venueData.venue_city || '').toLowerCase().trim();
    const state = (venueData.state || venueData.venue_state || '').toLowerCase().trim();
    
    // Use explicit null/undefined checks to handle valid 0,0 coordinates
    const hasLat = venueData.latitude != null && !isNaN(parseFloat(venueData.latitude));
    const hasLon = venueData.longitude != null && !isNaN(parseFloat(venueData.longitude));
    
    if (hasLat && hasLon) {
      // Use coordinates for precise matching (round to 0.01 degrees ≈ 1km)
      const lat = Math.round(parseFloat(venueData.latitude) * 100) / 100;
      const lon = Math.round(parseFloat(venueData.longitude) * 100) / 100;
      // Include name if available, otherwise use empty string (coordinates are primary)
      return `coord:${lat}:${lon}:${name || ''}`;
    } else if (city && state) {
      // Use name + city + state (name can be empty if not available)
      return `location:${name || ''}|${city}|${state}`;
    } else if (name) {
      // Fallback to name only (only if name is available)
      return `name:${name}`;
    } else {
      // No name and no location data - return null to indicate we can't create a key
      return null;
    }
  }

  /**
   * Generate all possible location keys for a venue (for lookup)
   * This ensures we can find venues stored with different key formats
   */
  generateAllLocationKeys(venueData) {
    const keys = [];
    const name = (venueData.name || venueData.venue_name || '').toLowerCase().trim();
    const city = (venueData.city || venueData.venue_city || '').toLowerCase().trim();
    const state = (venueData.state || venueData.venue_state || '').toLowerCase().trim();
    
    // Use explicit null/undefined checks to handle valid 0,0 coordinates
    const hasLat = venueData.latitude != null && !isNaN(parseFloat(venueData.latitude));
    const hasLon = venueData.longitude != null && !isNaN(parseFloat(venueData.longitude));
    
    // Add coordinate key if available
    if (hasLat && hasLon) {
      const lat = Math.round(parseFloat(venueData.latitude) * 100) / 100;
      const lon = Math.round(parseFloat(venueData.longitude) * 100) / 100;
      // Include name if available, otherwise use empty string (coordinates are primary)
      keys.push(`coord:${lat}:${lon}:${name || ''}`);
    }
    
    // Add location key if city and state available
    if (city && state) {
      // Include name if available, otherwise use empty string (city+state are primary)
      keys.push(`location:${name || ''}|${city}|${state}`);
    }
    
    // Add name key as fallback (only if name is available)
    if (name) {
      keys.push(`name:${name}`);
    }
    
    return keys;
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
            
            // Sync normalized genres for this artist
            const originalArtist = newArtists.find(a => a.jambase_artist_id === jambaseId);
            if (originalArtist?.genres) {
              await this.syncArtistNormalizedGenres(artist.id, originalArtist.genres);
            }
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
      
      // Sync normalized genres for this artist
      const finalGenres = updateData.genres || mergedGenres;
      if (finalGenres && finalGenres.length > 0) {
        await this.syncArtistNormalizedGenres(uuid, finalGenres);
      }
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
        // But keep track of it for mapping after insertion
        const venuesToInsert = newVenues.map((venue, index) => {
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
          // Match inserted venues back to original venue data by identifier
          // This is safer than assuming insertion order is preserved
          const originalVenuesByIdentifier = new Map();
          for (const venue of newVenues) {
            if (venue.identifier) {
              originalVenuesByIdentifier.set(venue.identifier, venue);
            }
          }
          
          for (const insertedVenue of inserted) {
            // Match by identifier (most reliable)
            const originalVenue = insertedVenue.identifier 
              ? originalVenuesByIdentifier.get(insertedVenue.identifier)
              : null;
            
            // Fallback: if no identifier match, try to extract jambase ID from identifier
            let jambaseVenueId = null;
            if (originalVenue) {
              jambaseVenueId = originalVenue.jambase_venue_id;
            } else if (insertedVenue.identifier) {
              // Extract from identifier as fallback
              const jambaseId = insertedVenue.identifier.replace(/^jambase:/, '');
              if (jambaseId) {
                jambaseVenueId = jambaseId;
              }
            }
            
            if (jambaseVenueId) {
              // Add to map using the jambase_venue_id
              venueUuidMap.set(jambaseVenueId, insertedVenue.id);
              this.stats.venuesNew++;

              // Create external_entity_ids entry
              await this.upsertExternalId(insertedVenue.id, 'jambase', 'venue', jambaseVenueId);
            } else {
              const venueName = originalVenue?.name || insertedVenue.identifier || 'unknown';
              console.warn(`  ⚠️  Venue inserted but no JamBase ID found: ${insertedVenue.id} (${venueName})`);
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

    // Handle venues without Jambase IDs (location-based matching)
    for (const venueData of venuesWithoutId) {
      // Remove jambase_venue_id from data (it's not a column)
      const { jambase_venue_id, ...venueDataClean } = venueData;
      
      // Create location-based key for matching
      const locationKey = this.createLocationKey(venueDataClean);
      
      // Try to find existing venue using location-based matching
      let existingVenue = null;
      
      // Use explicit null/undefined checks to handle valid 0,0 coordinates
      const hasLat = venueDataClean.latitude != null && !isNaN(parseFloat(venueDataClean.latitude));
      const hasLon = venueDataClean.longitude != null && !isNaN(parseFloat(venueDataClean.longitude));
      
      if (hasLat && hasLon) {
        // Match by coordinates (within 0.01 degrees ≈ 1km)
        const lat = parseFloat(venueDataClean.latitude);
        const lon = parseFloat(venueDataClean.longitude);
        const latMin = lat - 0.01;
        const latMax = lat + 0.01;
        const lonMin = lon - 0.01;
        const lonMax = lon + 0.01;
        
        const { data: venues, error } = await this.syncService.supabase
          .from('venues')
          .select('id, name, city, state, street_address, zip, latitude, longitude')
          .eq('name', venueDataClean.name)
          .is('identifier', null) // No JamBase ID
          .gte('latitude', latMin)
          .lte('latitude', latMax)
          .gte('longitude', lonMin)
          .lte('longitude', lonMax)
          .limit(1)
          .maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
          console.warn(`  ⚠️  Error finding venue by coordinates: ${error.message}`);
        } else if (venues) {
          existingVenue = venues;
        }
      }
      
      // If not found by coordinates, try name + city + state
      if (!existingVenue && venueDataClean.city && venueDataClean.state) {
        const { data: venues, error } = await this.syncService.supabase
          .from('venues')
          .select('id, name, city, state, street_address, zip, latitude, longitude')
          .eq('name', venueDataClean.name)
          .eq('city', venueDataClean.city)
          .eq('state', venueDataClean.state)
          .is('identifier', null) // No JamBase ID
          .limit(1)
          .maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
          console.warn(`  ⚠️  Error finding venue by location: ${error.message}`);
        } else if (venues) {
          existingVenue = venues;
        }
      }
      
      // If still not found, try name only (fallback)
      if (!existingVenue) {
        const { data: venues, error } = await this.syncService.supabase
          .from('venues')
          .select('id, name, city, state, street_address, zip, latitude, longitude')
          .eq('name', venueDataClean.name)
          .is('identifier', null) // No JamBase ID
          .limit(1)
          .maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
          console.warn(`  ⚠️  Error finding venue by name: ${error.message}`);
        } else if (venues) {
          existingVenue = venues;
        }
      }

      let venueUuid;

      if (existingVenue) {
        // Update existing venue with any missing data
        const updateData = {
          updated_at: new Date().toISOString(),
          last_synced_at: new Date().toISOString()
        };
        
        // Only update fields that are missing (consistent behavior for all fields)
        // This prevents overwriting existing data with potentially incomplete new data
        if (venueDataClean.city && !existingVenue.city) updateData.city = venueDataClean.city;
        if (venueDataClean.state && !existingVenue.state) updateData.state = venueDataClean.state;
        if (venueDataClean.street_address && !existingVenue.street_address) updateData.street_address = venueDataClean.street_address;
        if (venueDataClean.zip && !existingVenue.zip) updateData.zip = venueDataClean.zip;
        // Use explicit null checks for coordinates to handle valid 0,0 coordinates
        if (venueDataClean.latitude != null && !isNaN(parseFloat(venueDataClean.latitude)) && existingVenue.latitude == null) {
          updateData.latitude = parseFloat(venueDataClean.latitude);
        }
        if (venueDataClean.longitude != null && !isNaN(parseFloat(venueDataClean.longitude)) && existingVenue.longitude == null) {
          updateData.longitude = parseFloat(venueDataClean.longitude);
        }
        
        // Always update last_synced_at to track sync metadata, even if no other fields changed
        // Check if we have updates beyond just timestamps
        const hasFieldUpdates = Object.keys(updateData).length > 2; // More than just timestamps
        
        // Always perform update to refresh last_synced_at (important for sync tracking)
        const { error: updateError } = await this.syncService.supabase
          .from('venues')
          .update(updateData)
          .eq('id', existingVenue.id);
        
        if (updateError) {
          console.warn(`  ⚠️  Error updating venue: ${updateError.message}`);
        } else {
          // Only increment stats if actual field updates occurred (not just timestamp refresh)
          if (hasFieldUpdates) {
            this.stats.venuesUpdated++;
          }
        }
        
        venueUuid = existingVenue.id;
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

      // Store venue with all possible location keys, but prioritize more specific keys
      // Key specificity order: coord: > location: > name:
      // A more specific key can overwrite a less specific one, but not vice versa
      // This prevents collisions when multiple venues share the same name while still
      // allowing lookups with varying data completeness
      const allKeys = this.generateAllLocationKeys(venueDataClean);
      
      // Helper to get key specificity (higher number = more specific)
      const getKeySpecificity = (key) => {
        if (key.startsWith('coord:')) return 3;
        if (key.startsWith('location:')) return 2;
        if (key.startsWith('name:')) return 1;
        return 0;
      };
      
      // Check if this venue has any keys more specific than name:
      const hasMoreSpecificKey = allKeys.some(key => getKeySpecificity(key) > 1);
      
      for (const key of allKeys) {
        const keySpecificity = getKeySpecificity(key);
        const existingVenueId = venueUuidMap.get(key);
        
        if (!existingVenueId) {
          // Key doesn't exist - always set it
          venueUuidMap.set(key, venueUuid);
        } else if (existingVenueId === venueUuid) {
          // Same venue - no need to update
          continue;
        } else {
          // Key exists for different venue - check if we should overwrite
          if (keySpecificity > 1) {
            // This is coord: or location: - can overwrite less specific keys
            venueUuidMap.set(key, venueUuid);
          } else if (keySpecificity === 1 && hasMoreSpecificKey) {
            // This is name: but we have more specific keys (coord: or location:)
            // We can overwrite because we have better identifying information
            venueUuidMap.set(key, venueUuid);
          } else {
            // This is name: and we don't have more specific keys
            // Don't overwrite - keep the existing mapping (which might be from a venue with more specific data)
            console.warn(`  ⚠️  Location key collision: "${key}" already maps to venue ${existingVenueId}, keeping existing mapping (venue ${venueUuid} has only name, no coordinates or city+state)`);
          }
        }
      }
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

        // If and only if event genres are empty, use artist genres; never overwrite non-empty event genres
        const artistGenres = artistUuid ? artistGenresMap.get(artistUuid) : undefined;
        const finalGenres = eventGenresFromArtistIfEmpty(eventGenres, artistGenres);

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
          
          // Sync normalized genres for this event
          const eventGenres = eventsWithUuids[i]?.genres;
          if (eventGenres && eventGenres.length > 0) {
            await this.syncEventNormalizedGenres(event.id, eventGenres);
          }
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

      // If and only if event genres are empty, use artist genres; never overwrite non-empty event genres
      const artistGenres = artistUuid ? updateArtistGenresMap.get(artistUuid) : undefined;
      const finalGenres = eventGenresFromArtistIfEmpty(eventGenres, artistGenres);

      const updateData = {
        ...eventDataClean,
        artist_id: artistUuid, // UUID FK to artists(id)
        venue_id: venueUuid, // UUID FK to venues(id)
        updated_at: new Date().toISOString()
      };
      // Only write genres when we have a value (don't overwrite DB with empty)
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
      
      // Sync normalized genres for this event
      if (!isEmptyGenres(finalGenres)) {
        await this.syncEventNormalizedGenres(uuid, finalGenres);
      }
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
      
      // Get UUIDs from maps
      const artistUuid = jambaseArtistId ? artistUuidMap.get(jambaseArtistId) : null;
      
      // For venues: if no JamBase ID, use location-based key to find venue
      let venueUuid = null;
      if (jambaseVenueId) {
        venueUuid = venueUuidMap.get(jambaseVenueId);
      } else if (venue) {
        // No JamBase venue ID - use location-based matching
        // Try all possible key formats to handle varying data completeness
        const venueData = this.syncService.extractVenueData(venue);
        if (venueData) {
          const allKeys = this.generateAllLocationKeys(venueData);
          // Try keys from most specific to least specific
          for (const key of allKeys) {
            venueUuid = venueUuidMap.get(key);
            if (venueUuid) break; // Found it!
          }
        }
      }

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
   * Run incremental sync
   */
  async run() {
    console.log('🔄 Starting Daily Incremental Sync (3NF Compliant)...\n');

    // Get last sync timestamp
    const lastModifiedAt = await this.getLastSyncTimestamp();
    if (!lastModifiedAt) {
      console.log('⚠️  No previous sync found. Run full sync first.');
      return;
    }

    console.log(`📅 Last sync: ${lastModifiedAt}\n`);

    // Fetch events modified since last sync
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
    console.log(`   Genres normalized: ${this.stats.genresNormalized} entities`);
    console.log(`   API calls: ${this.syncService.getStats().apiCalls}`);
  }
}

// Main execution
async function main() {
  // Ensure output is not buffered for launchd
  if (process.stdout.isTTY === false) {
    // Use relative path for logging (logs directory in project root)
    const path = require('path');
    const fs = require('fs');
    const projectRoot = path.resolve(__dirname, '..');
    const logPath = path.join(projectRoot, 'logs', 'launchd-sync.log');
    
    // Ensure logs directory exists
    const logsDir = path.dirname(logPath);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    process.stdout.write = ((originalWrite) => {
      return function(chunk, encoding, callback) {
        originalWrite.call(process.stdout, chunk, encoding, callback);
        // Force flush
        if (typeof chunk === 'string') {
          try {
            fs.appendFileSync(logPath, chunk, { flag: 'a' });
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

