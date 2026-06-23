/**
 * Entity UUID Resolver
 * 
 * Helper utilities to resolve entity UUIDs for interaction tracking.
 * Handles events, artists, and venues which require UUIDs for the interactions table.
 */

/**
 * Extract event UUID from various event object formats
 */
export function getEventUuid(event: any): string | null {
  if (!event) return null;
  
  // Try various UUID fields
  if (event.id && typeof event.id === 'string') {
    // Check if it's a valid UUID format
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.id)) {
      return event.id;
    }
  }
  
  if (event.event_id && typeof event.event_id === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.event_id)) {
      return event.event_id;
    }
  }
  
  // Return null if no valid UUID found
  return null;
}

/**
 * Extract artist UUID from various artist object formats
 */
export function getArtistUuid(artist: any): string | null {
  if (!artist) return null;
  
  // Try various UUID fields
  if (artist.id && typeof artist.id === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(artist.id)) {
      return artist.id;
    }
  }
  
  if (artist.artist_id && typeof artist.artist_id === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(artist.artist_id)) {
      return artist.artist_id;
    }
  }
  
  if (artist.artist_uuid && typeof artist.artist_uuid === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(artist.artist_uuid)) {
      return artist.artist_uuid;
    }
  }
  
  return null;
}

/**
 * Extract venue UUID from various venue object formats
 */
export function getVenueUuid(venue: any): string | null {
  if (!venue) return null;
  
  // Try various UUID fields
  if (venue.id && typeof venue.id === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(venue.id)) {
      return venue.id;
    }
  }
  
  if (venue.venue_id && typeof venue.venue_id === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(venue.venue_id)) {
      return venue.venue_id;
    }
  }
  
  if (venue.venue_uuid && typeof venue.venue_uuid === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(venue.venue_uuid)) {
      return venue.venue_uuid;
    }
  }
  
  return null;
}

/**
 * Extract event metadata for marketing analytics
 */
export function getEventMetadata(event: any): Record<string, any> {
  const metadata: Record<string, any> = {};
  
  if (!event) return metadata;
  
  if (event.artist_name) metadata.artist_name = event.artist_name;
  if (event.venue_name) metadata.venue_name = event.venue_name;
  if (event.event_date) metadata.event_date = event.event_date;
  if (event.venue_city) metadata.venue_city = event.venue_city;
  if (event.venue_state) metadata.venue_state = event.venue_state;
  if (event.genres && Array.isArray(event.genres)) metadata.genres = event.genres;
  if (event.price_range) metadata.price_range = event.price_range;
  if (event.title) metadata.title = event.title;
  
  return metadata;
}

/**
 * Extract artist metadata for marketing analytics
 */
export function getArtistMetadata(artist: any): Record<string, any> {
  const metadata: Record<string, any> = {};
  
  if (!artist) return metadata;
  
  if (artist.name) metadata.artist_name = artist.name;
  if (artist.artist_name) metadata.artist_name = artist.artist_name;
  if (artist.genres && Array.isArray(artist.genres)) metadata.genres = artist.genres;
  
  return metadata;
}

/**
 * Extract venue metadata for marketing analytics
 */
export function getVenueMetadata(venue: any): Record<string, any> {
  const metadata: Record<string, any> = {};
  
  if (!venue) return metadata;
  
  if (venue.name) metadata.venue_name = venue.name;
  if (venue.venue_name) metadata.venue_name = venue.venue_name;
  if (venue.city || venue.venue_city) metadata.venue_city = venue.city || venue.venue_city;
  if (venue.state || venue.venue_state) metadata.venue_state = venue.state || venue.venue_state;
  
  return metadata;
}
