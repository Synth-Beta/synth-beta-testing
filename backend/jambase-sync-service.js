/**
 * Jambase Sync Service
 * 
 * Optimized sync service that fetches ALL upcoming events, artists, and venues
 * using a single API endpoint with embedded data.
 * 
 * Strategy:
 * - Single endpoint: /jb-api/v1/events with expandExternalIdentifiers=true
 * - Each response includes complete event, artist, and venue data
 * - Batch upsert: artists → venues → events (sequential due to FK constraints)
 * - ~900 API calls for ~90k events (all data included)
 */

import { createClient } from '@supabase/supabase-js';

class JambaseSyncService {
  constructor() {
    // Supabase client with service role for sync operations
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (!this.supabaseUrl || !this.supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    }
    
    this.supabase = createClient(this.supabaseUrl, this.supabaseServiceKey);
    
    // Jambase API configuration
    this.jambaseApiKey = process.env.JAMBASE_API_KEY;
    if (!this.jambaseApiKey) {
      throw new Error('Missing JAMBASE_API_KEY environment variable');
    }
    
    this.baseUrl = 'https://www.jambase.com/jb-api/v1/events';
    
    // Statistics tracking
    this.stats = {
      apiCalls: 0,
      eventsProcessed: 0,
      artistsProcessed: 0,
      venuesProcessed: 0,
      errors: []
    };
  }

  /**
   * Fetch events from Jambase API with pagination
   */
  async fetchEventsPage(page = 1, perPage = 100, dateModifiedFrom = null) {
    const params = new URLSearchParams({
      apikey: this.jambaseApiKey,
      expandExternalIdentifiers: 'true', // CRITICAL: includes all artist/venue IDs
      perPage: perPage.toString(),
      page: page.toString()
    });

    if (dateModifiedFrom) {
      params.append('dateModifiedFrom', dateModifiedFrom);
    }

    const url = `${this.baseUrl}?${params.toString()}`;
    
    this.stats.apiCalls++;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Synth/1.0'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jambase API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(`Jambase API returned success=false`);
      }

      return {
        events: data.events || [],
        pagination: data.pagination || {},
        totalItems: data.pagination?.totalItems || 0,
        totalPages: data.pagination?.totalPages || 0
      };
    } catch (error) {
      // Retry logic with exponential backoff
      if (this.stats.apiCalls <= 3) {
        const delay = Math.pow(2, this.stats.apiCalls) * 1000; // 2s, 4s, 8s
        console.log(`Retrying API call after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.fetchEventsPage(page, perPage, dateModifiedFrom);
      }
      throw error;
    }
  }

  /**
   * Extract and transform artist data from Jambase performer object
   */
  extractArtistData(performer) {
    if (!performer || !performer.identifier) {
      return null;
    }

    // Remove "jambase:" prefix from identifier
    const jambaseArtistId = performer.identifier.replace(/^jambase:/, '');
    const identifier = performer.identifier; // Full identifier

    return {
      jambase_artist_id: jambaseArtistId,
      artist_data_source: 'jambase',
      name: performer.name || 'Unknown Artist',
      identifier: identifier,
      url: performer.url || null,
      image_url: performer.image || null,
      date_published: performer.datePublished ? new Date(performer.datePublished).toISOString() : null,
      date_modified: performer.dateModified ? new Date(performer.dateModified).toISOString() : null,
      artist_type: performer['@type'] || null, // 'MusicGroup' or 'Person'
      band_or_musician: performer['x-bandOrMusician'] || null, // 'band' or 'musician'
      founding_location: performer.foundingLocation?.name || null,
      founding_date: performer.foundingDate || null,
      genres: Array.isArray(performer.genre) ? performer.genre : (performer.genre ? [performer.genre] : null),
      members: performer.member ? JSON.parse(JSON.stringify(performer.member)) : null, // Deep copy
      member_of: performer.memberOf ? JSON.parse(JSON.stringify(performer.memberOf)) : null, // Deep copy
      external_identifiers: performer['x-externalIdentifiers'] ? JSON.parse(JSON.stringify(performer['x-externalIdentifiers'])) : null,
      same_as: performer.sameAs ? JSON.parse(JSON.stringify(performer.sameAs)) : null,
      num_upcoming_events: 0, // Will be calculated separately
      raw_jambase_data: JSON.parse(JSON.stringify(performer)), // Store complete object
      verified: false,
      last_synced_at: new Date().toISOString()
    };
  }

  /**
   * Extract and transform venue data from Jambase location object
   */
  extractVenueData(location) {
    if (!location || !location.name) {
      return null;
    }

    const jambaseVenueId = location.identifier ? location.identifier.replace(/^jambase:/, '') : null;
    const identifier = location.identifier || null;

    return {
      jambase_venue_id: jambaseVenueId,
      name: location.name,
      identifier: identifier,
      url: location.url || null,
      image_url: location.image || null,
      address: location.address ? JSON.parse(JSON.stringify(location.address)) : null, // Full address object as JSONB
      geo: location.geo ? JSON.parse(JSON.stringify(location.geo)) : null, // Full geo object as JSONB
      maximum_attendee_capacity: location.maximumAttendeeCapacity || null,
      same_as: Array.isArray(location.sameAs) ? location.sameAs : null,
      date_published: location.datePublished ? new Date(location.datePublished).toISOString() : null,
      date_modified: location.dateModified ? new Date(location.dateModified).toISOString() : null,
      num_upcoming_events: 0, // Will be calculated separately
      typical_genres: null, // Will be aggregated from events
      verified: false,
      last_synced_at: new Date().toISOString()
    };
  }

  /**
   * Extract and transform event data from Jambase event object
   */
  extractEventData(jambaseEvent, artistUuid, venueUuid) {
    if (!jambaseEvent || !jambaseEvent.identifier) {
      return null;
    }

    // Extract headliner (performer with x-isHeadliner or first performer)
    const headliner = jambaseEvent.performer?.find(p => p['x-isHeadliner']) || jambaseEvent.performer?.[0];
    const venue = jambaseEvent.location;
    const address = venue?.address;
    const offers = jambaseEvent.offers || [];

    // Remove "jambase:" prefix from identifier
    const jambaseEventId = jambaseEvent.identifier.replace(/^jambase:/, '');

    // Handle doorTime - can be full ISO string or just time
    let doorsTime = null;
    if (jambaseEvent.doorTime) {
      const doorTimeStr = jambaseEvent.doorTime.trim();
      if (doorTimeStr.includes('T') || doorTimeStr.includes('-')) {
        doorsTime = new Date(doorTimeStr).toISOString();
      } else if (jambaseEvent.startDate) {
        // Combine with startDate
        const datePart = jambaseEvent.startDate.split('T')[0];
        doorsTime = new Date(`${datePart}T${doorTimeStr}`).toISOString();
      }
    }

    // Handle addressRegion (can be string or object)
    const venueState = address?.addressRegion?.name || address?.addressRegion || null;

    // Handle price data
    const firstOffer = offers[0];
    const priceSpec = firstOffer?.priceSpecification;
    const ticketAvailable = offers.some(offer => offer.availability === 'InStock');
    
    // Create price_range string
    let priceRange = null;
    if (priceSpec?.minPrice && priceSpec?.maxPrice) {
      priceRange = `$${priceSpec.minPrice} - $${priceSpec.maxPrice}`;
    } else if (priceSpec?.price) {
      priceRange = `$${priceSpec.price}`;
    }

    // Handle images array
    const images = Array.isArray(jambaseEvent.image) 
      ? jambaseEvent.image.map(img => ({ url: img.url, caption: img.caption || null }))
      : null;

    // Extract external URL (first from sameAs array)
    const externalUrl = Array.isArray(jambaseEvent.sameAs) && jambaseEvent.sameAs.length > 0
      ? jambaseEvent.sameAs[0]
      : null;

    // Extract tour name
    const tourName = jambaseEvent.partOfTour?.name || null;

    return {
      jambase_event_id: jambaseEventId,
      title: jambaseEvent.name || `${headliner?.name || 'Unknown Artist'} Live`,
      artist_name: headliner?.name || 'Unknown Artist',
      artist_jambase_id: artistUuid, // FK UUID from artists table
      venue_name: venue?.name || 'Unknown Venue',
      venue_jambase_id: venueUuid, // FK UUID from venues table
      event_date: jambaseEvent.startDate ? new Date(jambaseEvent.startDate).toISOString() : new Date().toISOString(),
      doors_time: doorsTime,
      description: jambaseEvent.description || null,
      genres: Array.isArray(headliner?.genre) ? headliner.genre : (headliner?.genre ? [headliner.genre] : null),
      venue_address: address?.streetAddress || null,
      venue_city: address?.addressLocality || null,
      venue_state: venueState,
      venue_zip: address?.postalCode || null,
      latitude: venue?.geo?.latitude ? parseFloat(venue.geo.latitude) : null,
      longitude: venue?.geo?.longitude ? parseFloat(venue.geo.longitude) : null,
      ticket_available: ticketAvailable,
      price_range: priceRange,
      price_min: priceSpec?.minPrice ? parseFloat(priceSpec.minPrice) : null,
      price_max: priceSpec?.maxPrice ? parseFloat(priceSpec.maxPrice) : null,
      price_currency: priceSpec?.priceCurrency || 'USD',
      ticket_urls: offers.map(offer => offer.url).filter(Boolean),
      external_url: externalUrl,
      setlist: null, // Not available from Jambase API
      tour_name: tourName,
      source: 'jambase',
      event_status: jambaseEvent.eventStatus || null,
      images: images,
      is_user_created: false,
      is_promoted: false,
      is_featured: false,
      media_urls: [],
      last_modified_at: jambaseEvent.dateModified ? new Date(jambaseEvent.dateModified).toISOString() : null
    };
  }

  /**
   * Batch upsert artists and return UUID mapping
   */
  async upsertArtists(artistsData) {
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

    try {
      // Upsert with ON CONFLICT
      const { data, error } = await this.supabase
        .from('artists')
        .upsert(artistsArray, {
          onConflict: 'jambase_artist_id',
          ignoreDuplicates: false
        })
        .select('id, jambase_artist_id');

      if (error) {
        throw error;
      }

      // Create UUID mapping
      const uuidMap = new Map();
      if (data) {
        for (const artist of data) {
          uuidMap.set(artist.jambase_artist_id, artist.id);
        }
      }

      this.stats.artistsProcessed += artistsArray.length;
      return uuidMap;
    } catch (error) {
      console.error('Error upserting artists:', error);
      this.stats.errors.push({ type: 'artists_upsert', error: error.message });
      throw error;
    }
  }

  /**
   * Batch upsert venues and return UUID mapping
   */
  async upsertVenues(venuesData) {
    if (!venuesData || venuesData.length === 0) {
      return new Map();
    }

    // Deduplicate by jambase_venue_id (handle nulls)
    const uniqueVenues = new Map();
    for (const venue of venuesData) {
      if (venue && venue.jambase_venue_id) {
        uniqueVenues.set(venue.jambase_venue_id, venue);
      } else if (venue && venue.name) {
        // Use name as fallback key if no jambase_venue_id
        uniqueVenues.set(`name:${venue.name}`, venue);
      }
    }

    const venuesArray = Array.from(uniqueVenues.values());

    if (venuesArray.length === 0) {
      return new Map();
    }

    try {
      // Upsert with ON CONFLICT (jambase_venue_id can be null, so use name as fallback)
      const { data, error } = await this.supabase
        .from('venues')
        .upsert(venuesArray, {
          onConflict: 'jambase_venue_id',
          ignoreDuplicates: false
        })
        .select('id, jambase_venue_id, name');

      if (error) {
        throw error;
      }

      // Create UUID mapping
      const uuidMap = new Map();
      if (data) {
        for (const venue of data) {
          if (venue.jambase_venue_id) {
            uuidMap.set(venue.jambase_venue_id, venue.id);
          } else {
            // Fallback to name-based lookup
            uuidMap.set(`name:${venue.name}`, venue.id);
          }
        }
      }

      this.stats.venuesProcessed += venuesArray.length;
      return uuidMap;
    } catch (error) {
      console.error('Error upserting venues:', error);
      this.stats.errors.push({ type: 'venues_upsert', error: error.message });
      throw error;
    }
  }

  /**
   * Batch upsert events
   */
  async upsertEvents(eventsData) {
    if (!eventsData || eventsData.length === 0) {
      return;
    }

    try {
      const { data, error } = await this.supabase
        .from('events')
        .upsert(eventsData, {
          onConflict: 'jambase_event_id',
          ignoreDuplicates: false
        })
        .select('id, jambase_event_id');

      if (error) {
        throw error;
      }

      this.stats.eventsProcessed += eventsData.length;
    } catch (error) {
      console.error('Error upserting events:', error);
      this.stats.errors.push({ type: 'events_upsert', error: error.message });
      throw error;
    }
  }

  /**
   * Process a single page of events (100 events)
   * Returns: { artistsProcessed, venuesProcessed, eventsProcessed }
   */
  async processPage(jambaseEvents) {
    const artistsData = [];
    const venuesData = [];
    const eventsData = [];

    // Step 1: Extract all artist and venue data
    for (const jambaseEvent of jambaseEvents) {
      // Extract headliner
      const headliner = jambaseEvent.performer?.find(p => p['x-isHeadliner']) || jambaseEvent.performer?.[0];
      if (headliner) {
        const artistData = this.extractArtistData(headliner);
        if (artistData) {
          artistsData.push(artistData);
        }
      }

      // Extract venue
      if (jambaseEvent.location) {
        const venueData = this.extractVenueData(jambaseEvent.location);
        if (venueData) {
          venuesData.push(venueData);
        }
      }
    }

    // Step 2: Upsert artists and get UUID mapping
    const artistUuidMap = await this.upsertArtists(artistsData);

    // Step 3: Upsert venues and get UUID mapping
    const venueUuidMap = await this.upsertVenues(venuesData);

    // Step 4: Extract event data with FK UUIDs
    for (const jambaseEvent of jambaseEvents) {
      const headliner = jambaseEvent.performer?.find(p => p['x-isHeadliner']) || jambaseEvent.performer?.[0];
      const venue = jambaseEvent.location;

      // Get UUIDs from maps
      const jambaseArtistId = headliner?.identifier?.replace(/^jambase:/, '');
      const jambaseVenueId = venue?.identifier?.replace(/^jambase:/, '');
      
      const artistUuid = jambaseArtistId ? artistUuidMap.get(jambaseArtistId) : null;
      const venueUuid = jambaseVenueId ? venueUuidMap.get(jambaseVenueId) : null;

      const eventData = this.extractEventData(jambaseEvent, artistUuid, venueUuid);
      if (eventData) {
        eventsData.push(eventData);
      }
    }

    // Step 5: Upsert events
    await this.upsertEvents(eventsData);

    return {
      artistsProcessed: artistsData.length,
      venuesProcessed: venuesData.length,
      eventsProcessed: eventsData.length
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      apiCalls: 0,
      eventsProcessed: 0,
      artistsProcessed: 0,
      venuesProcessed: 0,
      errors: []
    };
  }
}

export default JambaseSyncService;

