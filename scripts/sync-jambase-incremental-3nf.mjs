/**
 * Daily Incremental Jambase Sync - 3NF Compliant
 * 
 * Strategy:
 * 1. Fetch upcoming events only (eventDateFrom=today) modified since MAX(last_modified_at)
 * 2. Use external_entity_ids table as source of truth for deduplication
 * 3. For each event, check external_entity_ids to see if it exists
 * 4. For each artist/venue, check external_entity_ids to see if it exists
 * 5. Only insert new entities, update existing ones
 * 6. Maintain external_entity_ids table for all entities
 * 
 * This minimizes API calls by only fetching changed events and ensures
 * no duplicates using the normalized external_entity_ids table.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import JambaseSyncService from '../backend/jambase-sync-service.mjs';
import { fetchGenresForArtist, isEmptyGenres } from './fetch-artist-genres.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      // After venue dedup, one canonical venue can legitimately be referenced by
      // MORE THAN ONE JamBase venue id (JamBase re-lists the same physical venue
      // under multiple ids). The legacy UNIQUE(entity_uuid, source, entity_type)
      // constraint predates dedup and rejects that second mapping. It's non-fatal:
      // the entity is already resolved (venueUuidMap set via the primary mapping or
      // location-key reuse), so skip it rather than fail the whole page. Dropping
      // that constraint lets the extra mapping persist — see the perf-review SQL.
      if (error.code === '23505') {
        return;
      }
      throw error;
    }
  }

  /**
   * Escape special LIKE/ILIKE pattern characters for literal matching.
   * PostgreSQL LIKE treats % as "any sequence" and _ as "any single char".
   */
  escapeLikePattern(str) {
    if (!str) return str;
    // Escape backslash first, then % and _
    return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  }

  /**
   * Safely link a Jambase ID to an existing artist.
   * Checks if artist already has a Jambase ID to prevent name collision merges.
   * Returns: { success: boolean, skipped: boolean, reason?: string }
   */
  async linkJambaseIdToArtist(artistUuid, jambaseId, artistName) {
    // First, check if this artist already has a Jambase ID linked
    const { data: existing, error: checkError } = await this.syncService.supabase
      .from('external_entity_ids')
      .select('external_id')
      .eq('entity_uuid', artistUuid)
      .eq('source', 'jambase')
      .eq('entity_type', 'artist')
      .maybeSingle();
    
    if (checkError) {
      console.warn(`  ⚠️ Error checking existing Jambase ID for ${artistUuid}: ${checkError.message}`);
      return { success: false, skipped: false };
    }
    
    if (existing) {
      if (existing.external_id === jambaseId) {
        // Same ID already linked - nothing to do
        return { success: true, skipped: true, reason: 'already_linked' };
      } else {
        // Different Jambase ID already linked - don't overwrite (could be different artist with same name)
        console.warn(`  ⚠️ Artist "${artistName}" already has Jambase ID ${existing.external_id}, skipping new ID ${jambaseId} (possible name collision)`);
        return { success: false, skipped: true, reason: 'different_id_exists' };
      }
    }
    
    // No existing Jambase ID - safe to insert
    try {
      await this.upsertExternalId(artistUuid, 'jambase', 'artist', jambaseId);
      return { success: true, skipped: false };
    } catch (error) {
      console.warn(`  ⚠️ Error linking Jambase ID ${jambaseId} to artist ${artistUuid}: ${error.message}`);
      return { success: false, skipped: false };
    }
  }

  /**
   * Find artists by name (case-insensitive) for multi-source deduplication.
   * Used when an artist doesn't have a Jambase external ID but might exist from Spotify.
   * Returns: Map<normalizedName, artistUuid>
   */
  async findArtistsByName(names) {
    if (!names || names.length === 0) return new Map();
    
    // Keep original names for querying, but create a map with normalized keys
    const uniqueNames = [...new Set(names.map(n => n?.trim()).filter(Boolean))];
    if (uniqueNames.length === 0) return new Map();

    const map = new Map();
    
    // Use ilike for case-insensitive matching
    // Query each name individually since ilike doesn't work with .in()
    for (const name of uniqueNames) {
      const normalizedKey = name.toLowerCase();
      
      // Skip if we already found this name
      if (map.has(normalizedKey)) continue;
      
      // Escape LIKE special characters for literal matching
      const escapedName = this.escapeLikePattern(name);
      const { data, error } = await this.syncService.supabase
        .from('artists')
        .select('id, name')
        .ilike('name', escapedName)
        .limit(1);
      
      if (!error && data && data.length > 0) {
        map.set(normalizedKey, data[0].id);
      }
    }
    
    return map;
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

    // Separate new vs existing artists (by Jambase ID)
    for (const artistData of artistsArray) {
      const jambaseArtistId = artistData.jambase_artist_id;
      const existingUuid = existingArtistsMap.get(jambaseArtistId);

      if (existingUuid) {
        // Will update existing
        updateArtists.push({ uuid: existingUuid, data: artistData });
        artistUuidMap.set(jambaseArtistId, existingUuid);
      } else {
        // Will insert new (or link to existing by name)
        newArtists.push(artistData);
      }
    }

    // For "new" artists, check if they exist by name (from Spotify or other sources)
    // If found by name, link Jambase ID instead of creating duplicate
    const artistsToLink = [];
    const trulyNewArtists = [];
    
    if (newArtists.length > 0) {
      const names = newArtists.map(a => a.name).filter(Boolean);
      const nameToUuidMap = await this.findArtistsByName(names);
      
      for (const artist of newArtists) {
        const normalizedName = artist.name?.trim()?.toLowerCase();
        const existingUuidByName = normalizedName ? nameToUuidMap.get(normalizedName) : null;
        
        if (existingUuidByName) {
          // Artist exists by name - link Jambase ID to it
          artistsToLink.push({ uuid: existingUuidByName, data: artist });
          artistUuidMap.set(artist.jambase_artist_id, existingUuidByName);
          console.log(`  🔗 Linking Jambase ID to existing artist: "${artist.name}"`);
        } else {
          // Truly new artist
          trulyNewArtists.push(artist);
        }
      }
      
      // Link Jambase IDs to existing artists in parallel (with collision protection)
      const linkResults = await Promise.all(
        artistsToLink.map(({ uuid, data }) =>
          this.linkJambaseIdToArtist(uuid, data.jambase_artist_id, data.name)
            .then(result => ({ result, uuid, data }))
        )
      );
      for (const { result, data } of linkResults) {
        if (result.success && !result.skipped) {
          this.stats.artistsUpdated++;
        } else if (result.skipped && result.reason === 'different_id_exists') {
          artistUuidMap.delete(data.jambase_artist_id);
          trulyNewArtists.push(data);
        } else if (!result.success && !result.skipped) {
          console.warn(`  ⚠️ Linking failed for "${data.name}", will create as new artist`);
          artistUuidMap.delete(data.jambase_artist_id);
          trulyNewArtists.push(data);
        }
      }
    }

    // Insert truly new artists
    if (trulyNewArtists.length > 0) {
      // Genre fetching can be skipped via SKIP_GENRE_FETCH=1 for fast backfill runs.
      // New artists will default to ['small artist'] and can be enriched in a separate pass.
      const skipGenreFetch = process.env.SKIP_GENRE_FETCH === '1';

      for (const artist of trulyNewArtists) {
        if (isEmptyGenres(artist.genres)) {
          if (skipGenreFetch) {
            artist.genres = ['small artist'];
          } else {
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
                artist.genres = ['small artist'];
                console.log(`  ⚠️  No genres found, setting default: small artist`);
              }
            } catch (error) {
              console.warn(`  ⚠️  Error fetching genres for ${artist.name}: ${error.message}`);
              artist.genres = ['small artist'];
            }
          }
        }
      }
      
      // Remove jambase_artist_id and artist_data_source from data (they're not columns, just used for deduplication)
      const artistsToInsert = trulyNewArtists.map(artist => {
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
        const postInsertWork = [];
        for (const artist of inserted) {
          const jambaseId = artist.identifier?.replace(/^jambase:/, '');
          if (jambaseId) {
            artistUuidMap.set(jambaseId, artist.id);
            this.stats.artistsNew++;
            const originalArtist = trulyNewArtists.find(a => a.jambase_artist_id === jambaseId);
            postInsertWork.push(
              this.upsertExternalId(artist.id, 'jambase', 'artist', jambaseId),
              originalArtist?.genres
                ? this.syncArtistNormalizedGenres(artist.id, originalArtist.genres)
                : Promise.resolve()
            );
          }
        }
        await Promise.all(postInsertWork);
      }
    }

    // In catalog sync mode, skip updating existing artists — we only need their UUIDs
    // to link events. Full artist data updates happen in the daily incremental sync.
    if (process.env.JAMBASE_UPCOMING_CATALOG !== '1') {
      for (const { uuid, data } of updateArtists) {
        const { jambase_artist_id, artist_data_source, genres: newGenres, ...artistData } = data;

        const { data: existingArtist, error: fetchError } = await this.syncService.supabase
          .from('artists')
          .select('genres')
          .eq('id', uuid)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          throw fetchError;
        }

        const existingGenres = existingArtist?.genres || [];
        const existingArray = Array.isArray(existingGenres)
          ? existingGenres
          : (existingGenres ? [existingGenres] : []);

        let mergedGenres = [...existingArray];

        const hasValidNewGenres = newGenres &&
          Array.isArray(newGenres) &&
          newGenres.length > 0 &&
          !isEmptyGenres(newGenres);

        if (hasValidNewGenres) {
          const genreMap = new Map();
          for (const genre of existingArray) {
            if (genre) genreMap.set(String(genre).toLowerCase().trim(), String(genre).trim());
          }
          for (const genre of newGenres) {
            if (genre) genreMap.set(String(genre).toLowerCase().trim(), String(genre).trim());
          }
          mergedGenres = Array.from(genreMap.values());
        }

        const shouldUpdateGenres = mergedGenres.length > 0 || existingArray.length === 0;
        const updateData = {
          ...artistData,
          updated_at: new Date().toISOString(),
          last_synced_at: new Date().toISOString()
        };
        if (shouldUpdateGenres) {
          updateData.genres = mergedGenres.length > 0 ? mergedGenres : existingArray;
        }

        const { error } = await this.syncService.supabase
          .from('artists')
          .update(updateData)
          .eq('id', uuid);

        if (error) throw error;

        this.stats.artistsUpdated++;

        const finalGenres = updateData.genres || mergedGenres;
        if (finalGenres && finalGenres.length > 0) {
          await this.syncArtistNormalizedGenres(uuid, finalGenres);
        }
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
        // Match candidates against existing rows by a NORMALIZED LOCATION KEY
        // (identifier|city|state), NOT identifier alone. Chain slugs like
        // "house_of_blues" are shared across every location, so identifier-only
        // matching both mis-collapsed distinct venues and failed to catch real
        // per-location duplicates — the bug that produced ~500k duplicate venue
        // rows. This composite key is exactly what the venues_location_key_uidx
        // unique index enforces at the DB level.
        // Replicate the DB's venue_location_key EXACTLY. The standardize_venue_name
        // trigger rewrites the stored identifier on insert as
        //   identifier := lower(replace(replace(normalize_venue_name(name),' ','_'),'''',''))
        // where normalize_venue_name = trim(collapse-whitespace). venue_location_key
        // (the generated column the unique index enforces) is then
        //   identifier | lower(city) | lower(state).
        // So we must derive the key from the NAME, not the raw API identifier — the
        // API identifier is discarded by the trigger. Matching this exactly is what
        // makes the reuse lookup catch what venues_location_key_uidx would reject.
        const locKey = (v) => {
          if (!v || !v.name) return null;
          const norm = String(v.name).replace(/\s+/g, ' ').trim();       // normalize_venue_name
          if (!norm) return null;
          const ident = norm.replace(/ /g, '_').replace(/'/g, '').toLowerCase();  // trigger identifier
          return `${ident}|${String(v.city || '').toLowerCase()}|${String(v.state || '').toLowerCase()}`;
        };
        // Look up existing venues by the SAME normalized key the DB's unique index
        // enforces (venue_location_key = lower(identifier)|lower(city)|lower(state)),
        // NOT the raw identifier. A case-variant identifier would slip past a raw
        // match and then collide on venues_location_key_uidx at insert time, failing
        // the whole page. Matching on the generated column closes that gap.
        const newKeys = [...new Set(newVenues.map((v) => locKey(v)).filter(Boolean))];
        const existingByLocKey = new Map();
        const LOOKUP_CHUNK = 100;
        for (let i = 0; i < newKeys.length; i += LOOKUP_CHUNK) {
          const slice = newKeys.slice(i, i + LOOKUP_CHUNK);
          const { data: rows, error: lookupErr } = await this.syncService.supabase
            .from('venues')
            .select('id, venue_location_key')
            .in('venue_location_key', slice);
          if (lookupErr) throw lookupErr;
          for (const r of rows || []) {
            if (r?.venue_location_key && r?.id && !existingByLocKey.has(r.venue_location_key)) {
              existingByLocKey.set(r.venue_location_key, r.id);
            }
          }
        }

        const venuesToInsert = [];
        const insertKeys = new Set();      // also dedup this batch by location key
        for (const venue of newVenues) {
          const key = locKey(venue);
          const existingId = key ? existingByLocKey.get(key) : null;
          if (existingId) {
            // Already exists — reuse it (no duplicate) and backfill the mapping.
            if (venue.jambase_venue_id) {
              venueUuidMap.set(venue.jambase_venue_id, existingId);
              await this.upsertExternalId(existingId, 'jambase', 'venue', venue.jambase_venue_id);
            }
            continue;
          }
          if (key && insertKeys.has(key)) {
            // Same physical location already queued for insert in this batch —
            // don't queue a second copy (it would hit the unique index).
            continue;
          }
          if (key) insertKeys.add(key);
          const { jambase_venue_id, ...venueData } = venue;
          venuesToInsert.push({
            ...venueData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_synced_at: new Date().toISOString(),
          });
        }

        // Insert new venues. The DB's venue_location_key is computed by the
        // standardize_venue_name trigger, which we replicate in locKey() — but rare
        // Unicode/whitespace names can still normalize slightly differently in JS vs
        // Postgres and collide on venues_location_key_uidx. So on a unique-key error,
        // fall back to inserting one at a time and reusing the existing row for any
        // that collide — one odd venue can never fail the whole page or drop events.
        let inserted = [];
        if (venuesToInsert.length) {
          const res = await this.syncService.supabase
            .from('venues')
            .insert(venuesToInsert)
            .select('id, name, city, state');
          if (!res.error) {
            inserted = res.data || [];
          } else if (res.error.code === '23505') {
            for (const v of venuesToInsert) {
              const one = await this.syncService.supabase
                .from('venues')
                .insert([v])
                .select('id, name, city, state');
              if (!one.error) {
                inserted.push(...(one.data || []));
              } else if (one.error.code === '23505') {
                // Already exists under the trigger-normalized key — find and reuse it.
                const normName = String(v.name || '').replace(/\s+/g, ' ').trim();
                let q = this.syncService.supabase
                  .from('venues').select('id, name, city, state').eq('name', normName);
                q = (v.city == null) ? q.is('city', null) : q.eq('city', v.city);
                q = (v.state == null) ? q.is('state', null) : q.eq('state', v.state);
                const { data: found } = await q.limit(1);
                if (found && found[0]) inserted.push(found[0]);
                else console.warn(`  ⚠️  Venue skipped (key collision, not found): ${v.name}`);
              } else {
                throw one.error;
              }
            }
          } else {
            throw res.error;
          }
        }

        if (inserted) {
          // Match inserted venues back to their original data by location key
          // (identifier|city|state) — identifier alone is ambiguous for chains.
          const originalVenuesByLocKey = new Map();
          for (const venue of newVenues) {
            const k = locKey(venue);
            if (k && !originalVenuesByLocKey.has(k)) {
              originalVenuesByLocKey.set(k, venue);
            }
          }

          const externalIdPromises = [];
          for (const insertedVenue of inserted) {
            // Match by the same normalized location key used above.
            const originalVenue = originalVenuesByLocKey.get(locKey(insertedVenue));
            
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
              venueUuidMap.set(jambaseVenueId, insertedVenue.id);
              this.stats.venuesNew++;
              externalIdPromises.push(this.upsertExternalId(insertedVenue.id, 'jambase', 'venue', jambaseVenueId));
            } else {
              const venueName = originalVenue?.name || insertedVenue.identifier || 'unknown';
              console.warn(`  ⚠️  Venue inserted but no JamBase ID found: ${insertedVenue.id} (${venueName})`);
            }
          }
          await Promise.all(externalIdPromises);
        }
      }

      // In catalog sync mode, skip updating existing venues — we only need their UUIDs.
      if (process.env.JAMBASE_UPCOMING_CATALOG !== '1') {
        for (const { uuid, data } of updateVenues) {
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
            // The standardize_venue_name trigger recomputes venue_location_key on
            // UPDATE, so a JamBase name change can push this venue onto another
            // venue's key and violate venues_location_key_uidx. Non-fatal: skip this
            // venue's metadata refresh (it keeps its current row and events still
            // link to it) instead of failing the whole page and its events.
            if (error.code === '23505') {
              console.warn(`  ⚠️  Venue update skipped (key collision): ${uuid}`);
              continue;
            }
            throw error;
          }
          this.stats.venuesUpdated++;
        }
      }
    }

    // Handle venues without Jambase IDs (location-based matching)
    // In catalog sync mode, skip the expensive per-venue coordinate lookups for venues
    // without Jambase IDs — the backfill script already linked them.
    if (process.env.JAMBASE_UPCOMING_CATALOG === '1') return venueUuidMap;

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

    // Upsert-on-jambase_id approach: avoids duplicate key errors and keeps daily sync cheap.
    const eventExternalIds = eventsData.map(e => e.jambase_event_id || null).filter(Boolean);

    const existingByJambase = new Map();
    if (eventExternalIds.length > 0) {
      const { data: existingRows, error: existingErr } = await this.syncService.supabase
        .from('events')
        .select('id, jambase_id')
        .in('jambase_id', eventExternalIds);
      if (existingErr) throw existingErr;
      for (const row of existingRows || []) {
        if (row?.jambase_id && row?.id) existingByJambase.set(row.jambase_id, row.id);
      }
    }

    const nowIso = new Date().toISOString();
    const toUpsert = eventsData
      .map(eventData => {
        const jambaseEventId = eventData.jambase_event_id;
        if (!jambaseEventId) return null;

        // artist_id/venue_id are already correctly resolved on eventData (set in
        // processPage3NF via extractEventData, which includes venue's location-based
        // fallback matching for venues without a JamBase venue id) — do NOT re-derive them
        // here from artist_jambase_id_text/venue_jambase_id_text via a jambase-id-only
        // lookup. That re-lookup has no fallback, so it silently nulled out venue_id for
        // every event whose venue had to be matched by location instead of JamBase id.
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

        const isUpdate = existingByJambase.has(jambaseEventId);
        const row = {
          ...eventDataClean,
          jambase_id: jambaseEventId,
          updated_at: nowIso,
          // Only write genres when present (never clobber with empty)
          ...(isEmptyGenres(eventGenres) ? {} : { genres: eventGenres }),
        };

        // Existing rows: do not overwrite stored images with null/empty from JamBase metadata-only updates.
        if (isUpdate) {
          if (!row.event_media_url) delete row.event_media_url;
          if (!row.images || (Array.isArray(row.images) && row.images.length === 0)) delete row.images;
          if (!row.media_urls || (Array.isArray(row.media_urls) && row.media_urls.length === 0)) delete row.media_urls;
        }

        // CRITICAL: never delink an event from its artist/venue. If we could not
        // resolve a UUID this run (transient artist/venue upsert failure, name-dedupe
        // miss, missing JamBase id, etc.), leave the existing FK untouched instead of
        // clobbering it with null. Nulling these breaks artist/venue profile listings
        // and the artist-derived event images.
        if (!row.artist_id) delete row.artist_id;
        if (!row.venue_id) delete row.venue_id;

        return row;
      })
      .filter(Boolean);

    if (toUpsert.length === 0) return;

    const { data: upserted, error: upsertErr } = await this.syncService.supabase
      .from('events')
      .upsert(toUpsert, { onConflict: 'jambase_id', ignoreDuplicates: false })
      .select('id, jambase_id, genres');

    if (upsertErr) throw upsertErr;

    for (const row of upserted || []) {
      const jid = row?.jambase_id;
      const id = row?.id;
      if (!jid || !id) continue;

      if (existingByJambase.has(jid)) this.stats.eventsUpdated++;
      else this.stats.eventsNew++;

      // Ensure external id mapping exists for 3NF lookups
      await this.upsertExternalId(id, 'jambase', 'event', jid);

      const g = row.genres;
      if (Array.isArray(g) && g.length > 0) {
        await this.syncEventNormalizedGenres(id, g);
      }
    }

    // Prevent the legacy "null-jambase_id twin" duplicate pattern from re-forming.
    // The sync already skips events without a jambase_id and upserts on jambase_id,
    // so it never creates NEW null-id rows or JamBase duplicates. The one remaining
    // vector is an existing legacy NULL-id event getting a JamBase twin at the same
    // (artist, venue, event_date) slot. After upserting these JamBase events, merge
    // any such twin into the canonical row (repoints its interests/reviews/media,
    // then removes it). Non-fatal: a failure here must never break the sync.
    const upsertedIds = (upserted || []).map(r => r?.id).filter(Boolean);
    if (upsertedIds.length > 0) {
      try {
        const { data: merged, error: mergeErr } = await this.syncService.supabase
          .rpc('merge_null_id_event_duplicates', { p_canonical_ids: upsertedIds });
        if (mergeErr) {
          console.warn(`  ⚠️  merge_null_id_event_duplicates failed (non-fatal): ${mergeErr.message}`);
        } else if (merged && merged > 0) {
          console.log(`  🔀 Merged ${merged} legacy null-id duplicate event(s) into canonical rows`);
        }
      } catch (e) {
        console.warn(`  ⚠️  merge_null_id_event_duplicates threw (non-fatal): ${e.message}`);
      }
    }
  }

  /**
   * Process a page of events with 3NF compliance
   */
  async processPage3NF(jambaseEvents) {
    const includePast = process.env.JAMBASE_INCLUDE_PAST === '1';
    const upcomingEvents = includePast
      ? jambaseEvents
      : jambaseEvents.filter((e) => this.syncService.isUpcomingEvent(e));

    // Step 1: Extract all artist and venue data
    const artistsData = [];
    const venuesData = [];
    const eventsData = [];

    for (const jambaseEvent of upcomingEvents) {
      const headliner = jambaseEvent.performer?.find(p => p['x-isHeadliner']) || jambaseEvent.performer?.[0];
      if (headliner) {
        const artistData = this.syncService.extractArtistData(headliner);
        if (artistData) {
          // extractArtistData only provides `identifier` (e.g. "jambase:252172").
          // upsertArtists3NF dedups/maps by `jambase_artist_id` (stripped), so derive
          // it here — without it the artist map is empty and events get a null artist_id.
          artistData.jambase_artist_id =
            artistData.identifier?.replace(/^jambase:/, '') || null;
          if (artistData.jambase_artist_id) {
            artistsData.push(artistData);
          }
        }
      }

      if (jambaseEvent.location) {
        const venueData = this.syncService.extractVenueData(jambaseEvent.location);
        if (venueData) {
          // Same as artists: derive the stripped JamBase id so id-based venue
          // resolution works (name-key fallback still covers venues without an id).
          venueData.jambase_venue_id =
            venueData.identifier?.replace(/^jambase:/, '') || null;
          venuesData.push(venueData);
        }
      }
    }

    // Step 2: Upsert artists (returns UUID map)
    const artistUuidMap = await this.upsertArtists3NF(artistsData);

    // Step 3: Upsert venues (returns UUID map)
    const venueUuidMap = await this.upsertVenues3NF(venuesData);

    // Step 4: Extract event data
    for (const jambaseEvent of upcomingEvents) {
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
        // `extractEventData` returns `jambase_id`; the 3NF upsert path expects
        // explicit Jambase id fields for dedupe + FK resolution.
        eventsData.push({
          ...eventData,
          jambase_event_id: eventData.jambase_id,
          artist_jambase_id_text: jambaseArtistId || null,
          venue_jambase_id_text: jambaseVenueId || null,
        });
      }
    }

    // Step 5: Upsert events
    await this.upsertEvents3NF(eventsData, artistUuidMap, venueUuidMap);
  }

  /**
   * Run incremental sync
   */
  async run() {
    const upcomingCatalog = process.env.JAMBASE_UPCOMING_CATALOG === '1';
    console.log(
      upcomingCatalog
        ? '🔄 Starting Upcoming Catalog Sync (3NF Compliant)...\n'
        : '🔄 Starting Daily Incremental Sync (3NF Compliant)...\n'
    );

    let dateModifiedFrom = null;
    let lastModifiedAt = null;

    if (upcomingCatalog) {
      if (process.env.JAMBASE_INCREMENTAL_FROM?.trim()) {
        console.log(
          '⚠️  JAMBASE_INCREMENTAL_FROM ignored when JAMBASE_UPCOMING_CATALOG=1\n' +
            '   Catalog mode pages by eventDateFrom only (finds missing upcoming + updates via upsert).\n'
        );
      }
      console.log(
        '📅 Mode: upcoming catalog — all JamBase events from eventDateFrom, upsert on jambase_id (no duplicate rows)\n'
      );
    } else {
      // Get last sync timestamp (DB watermark for incremental JamBase dateModifiedFrom)
      const dbLastModifiedAt = await this.getLastSyncTimestamp();
      if (!dbLastModifiedAt) {
        console.log('⚠️  No previous sync found. Run full sync first.');
        return;
      }

      const fromOverride = process.env.JAMBASE_INCREMENTAL_FROM?.trim();
      lastModifiedAt = fromOverride || dbLastModifiedAt;
      if (fromOverride) {
        const parsed = Date.parse(fromOverride);
        if (Number.isNaN(parsed)) {
          throw new Error(`Invalid JAMBASE_INCREMENTAL_FROM (not a valid date): ${fromOverride}`);
        }
        console.log(
          `📅 JAMBASE_INCREMENTAL_FROM override: ${fromOverride}\n   (DB max last_modified_at is ${dbLastModifiedAt})\n`
        );
      }

      console.log(`📅 dateModifiedFrom: ${lastModifiedAt}`);
      dateModifiedFrom = new Date(lastModifiedAt).toISOString();
    }

    // Upcoming only: new listings + updates to future shows (skips past-event metadata noise).
    const includePast = process.env.JAMBASE_INCLUDE_PAST === '1';
    const fixedEventDateFrom = process.env.JAMBASE_EVENT_DATE_FROM?.trim() || null;
    // In catalog mode, recalculate today's date on every page so a multi-day run
    // never sends a stale eventDateFrom that Jambase rejects.
    const getEventDateFrom = () => includePast
      ? null
      : (fixedEventDateFrom || new Date().toISOString().slice(0, 10));
    const eventDateFrom = getEventDateFrom();
    if (eventDateFrom) {
      console.log(`📅 eventDateFrom (upcoming only): ${eventDateFrom}`);
    } else {
      console.log('📅 eventDateFrom: not set (JAMBASE_INCLUDE_PAST=1 — includes past events)');
    }
    console.log('');

    // Checkpoint: save/restore last completed page so restarts resume instead of restart from 1
    const checkpointFile = path.join(__dirname, 'sync-checkpoint.json');
    const useCheckpoint = upcomingCatalog && !process.env.JAMBASE_START_PAGE?.trim();
    let checkpointData = null;
    if (useCheckpoint) {
      try {
        checkpointData = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
        // Checkpoint is keyed to calendar date; allow any recent date (within 7 days)
        // since the sync now updates eventDateFrom daily and we want to resume progress.
        const checkpointAge = Math.abs(
          new Date(eventDateFrom).getTime() - new Date(checkpointData.date).getTime()
        ) / 86400000;
        if (checkpointAge > 7) {
          checkpointData = null; // truly stale — start fresh
        } else if (checkpointData.date !== eventDateFrom) {
          console.log(`📌 Checkpoint from ${checkpointData.date} — resuming with updated date ${eventDateFrom}`);
        }
      } catch { /* no checkpoint yet */ }
    }
    const saveCheckpoint = (page) => {
      if (!useCheckpoint) return;
      try { fs.writeFileSync(checkpointFile, JSON.stringify({ date: eventDateFrom, page })); } catch { /* best-effort */ }
    };
    const clearCheckpoint = () => {
      if (!useCheckpoint) return;
      try { fs.unlinkSync(checkpointFile); } catch { /* best-effort */ }
    };

    // Fetch events modified since last sync, or full upcoming catalog when JAMBASE_UPCOMING_CATALOG=1
    const startPageRaw = process.env.JAMBASE_START_PAGE?.trim();
    const resumePage = checkpointData ? checkpointData.page + 1 : 1;
    const startPage = startPageRaw ? Math.max(1, parseInt(startPageRaw, 10) || 1) : resumePage;
    if (checkpointData && !startPageRaw) {
      console.log(`📌 Resuming from checkpoint: page ${startPage} (last completed: ${checkpointData.page})\n`);
    }
    let currentPage = startPage;
    // Seed totalPages with startPage so the first iteration runs; the real page
    // count is learned from the first fetched page below.
    let totalPages = startPage;
    const perPage = 100;
    const maxPagesRaw = process.env.JAMBASE_MAX_PAGES?.trim();
    const maxPages = maxPagesRaw ? parseInt(maxPagesRaw, 10) : Number.POSITIVE_INFINITY;
    // JAMBASE_MAX_PAGES = number of pages to process THIS run (a batch), starting at
    // JAMBASE_START_PAGE. endPage is the absolute last page this run will touch.
    const endPage = Number.isFinite(maxPages)
      ? startPage + Math.max(0, maxPages) - 1
      : Number.POSITIVE_INFINITY;
    if (startPage > 1) {
      console.log(`🧪 JAMBASE_START_PAGE: starting at page ${startPage}`);
    }
    if (Number.isFinite(endPage)) {
      console.log(`🧪 JAMBASE_MAX_PAGES enabled: will process pages ${startPage}–${endPage} (${maxPages} page(s))\n`);
    }

    while (currentPage <= totalPages && currentPage <= endPage) {
      let pageData = null;
      let pageAttempt = 0;
      const maxPageAttempts = 3;

      while (pageAttempt < maxPageAttempts) {
        try {
          pageData = await this.syncService.fetchEventsPage(
            currentPage,
            perPage,
            dateModifiedFrom,
            getEventDateFrom()
          );
          break; // success
        } catch (err) {
          pageAttempt++;
          if (pageAttempt >= maxPageAttempts) {
            console.error(`❌ Page ${currentPage} failed after ${maxPageAttempts} attempts: ${err.message}`);
            console.log(`⏭️  Skipping page ${currentPage} and continuing...`);
            break;
          }
          const delay = Math.pow(2, pageAttempt) * 500;
          console.log(`⚠️  Page ${currentPage} error (attempt ${pageAttempt}/${maxPageAttempts}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      if (!pageData || !pageData.events || pageData.events.length === 0) {
        if (currentPage === 1 && pageData) {
          console.log('✅ No new or modified events found');
        }
        if (!pageData) {
          currentPage++; // skip failed page
          continue;
        }
        break;
      }

      // Retry processPage3NF on network errors (Supabase fetch can drop mid-page)
      let processAttempt = 0;
      const maxProcessAttempts = 3;
      while (processAttempt < maxProcessAttempts) {
        try {
          await this.processPage3NF(pageData.events);
          break;
        } catch (err) {
          processAttempt++;
          if (processAttempt >= maxProcessAttempts) {
            console.error(`❌ Page ${currentPage} DB write failed after ${maxProcessAttempts} attempts: ${err.message} — skipping`);
            break;
          }
          const delay = Math.pow(2, processAttempt) * 2000;
          console.log(`⚠️  Page ${currentPage} DB error (attempt ${processAttempt}/${maxProcessAttempts}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      const upcomingOnPage = includePast
        ? pageData.events.length
        : pageData.events.filter((e) => this.syncService.isUpcomingEvent(e)).length;
      const pageLabel = includePast
        ? `${pageData.events.length} events`
        : `${upcomingOnPage}/${pageData.events.length} upcoming`;
      console.log(`✅ Processed page ${currentPage}/${totalPages} (${pageLabel})`);

      totalPages = pageData.totalPages || 1;
      saveCheckpoint(currentPage);
      currentPage++;

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    clearCheckpoint();

    // Print statistics
    console.log(
      upcomingCatalog ? '\n✨ Upcoming Catalog Sync Complete!' : '\n✨ Incremental Sync Complete!'
    );
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
    const projectRoot = path.resolve(__dirname, '..');
    const errLog = path.join(projectRoot, 'logs', 'launchd-sync-error.log');
    fs.mkdirSync(path.dirname(errLog), { recursive: true });
    fs.appendFileSync(errLog, errorMsg, { flag: 'a' });
  } catch (e) {
    // Ignore file write errors
  }
  process.exit(1);
});

