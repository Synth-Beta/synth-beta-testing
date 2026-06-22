/**
 * Tracking Helper Utilities
 * 
 * Centralized helper functions for consistent tracking across the app.
 * Ensures metadata is standardized and complete.
 */

/**
 * Extract standardized event metadata for tracking
 */
export function extractEventMetadata(event: any, additionalMetadata: any = {}) {
  return {
    event_id: event.id,
    artist_name: event.artist_name || event.event_data?.artist_name,
    venue_name: event.venue_name || event.event_data?.venue_name,
    venue_city: event.venue_city || event.event_data?.venue_city,
    venue_state: event.venue_state || event.event_data?.venue_state,
    event_date: event.event_date || event.event_data?.event_date,
    price_range: event.price_range || event.event_data?.price_range,
    has_ticket_urls: !!(event.ticket_urls?.length || event.event_data?.ticket_urls?.length),
    has_setlist: !!(event.setlist || event.event_data?.setlist),
    genres: event.genres || event.event_data?.genres,
    ...additionalMetadata
  };
}

/**
 * Calculate days until event
 */
export function getDaysUntilEvent(eventDate: string): number {
  const now = new Date().getTime();
  const eventTime = new Date(eventDate).getTime();
  const diffTime = eventTime - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Build UTM parameters for ticket URLs
 * Used for commission tracking with ticket platforms
 */
export function buildUTMParameters(params: {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}): URLSearchParams {
  const utmParams = new URLSearchParams();
  
  // Default values
  utmParams.set('utm_source', params.source || 'synth');
  utmParams.set('utm_medium', params.medium || 'app');
  utmParams.set('utm_campaign', params.campaign || 'event_discovery');
  
  if (params.content) {
    utmParams.set('utm_content', params.content);
  }
  
  if (params.term) {
    utmParams.set('utm_term', params.term);
  }
  
  return utmParams;
}

/**
 * Add UTM parameters to a ticket URL
 */
export function addUTMToURL(url: string, params: {
  eventId: string;
  userId?: string;
  source?: string;
}): string {
  try {
    const urlObj = new URL(url);
    
    // Build UTM parameters
    const utmParams = buildUTMParameters({
      source: 'synth',
      medium: 'app',
      campaign: 'event_modal',
      content: `event_${params.eventId}`,
      term: params.userId
    });
    
    // Add UTM parameters to URL
    utmParams.forEach((value, key) => {
      urlObj.searchParams.set(key, value);
    });
    
    // Add custom tracking parameters
    if (params.userId) {
      urlObj.searchParams.set('synth_user_id', params.userId);
    }
    urlObj.searchParams.set('synth_event_id', params.eventId);
    
    return urlObj.toString();
  } catch (error) {
    console.error('Error adding UTM parameters:', error);
    return url; // Return original URL if error
  }
}

/**
 * Extract ticket provider from URL
 */
export function extractTicketProvider(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');
    
    // Map common ticket providers
    const providerMap: Record<string, string> = {
      'ticketmaster.com': 'Ticketmaster',
      'stubhub.com': 'StubHub',
      'seatgeek.com': 'SeatGeek',
      'viagogo.com': 'Viagogo',
      'eventbrite.com': 'Eventbrite',
      'axs.com': 'AXS',
      'ticketfly.com': 'Ticketfly',
      'etix.com': 'Etix',
      'ticketweb.com': 'TicketWeb',
      'universe.com': 'Universe'
    };
    
    // Check if hostname matches known provider
    for (const [domain, provider] of Object.entries(providerMap)) {
      if (hostname.includes(domain)) {
        return provider;
      }
    }
    
    // Return cleaned hostname if not in map
    return hostname.split('.')[0];
  } catch (error) {
    return 'unknown';
  }
}

/**
 * Validate tracking metadata
 * Ensures all required fields are present
 */
export function validateTrackingData(
  eventType: string,
  entityType: string,
  metadata: any
): boolean {
  // Required fields for different event types
  const requiredFields: Record<string, string[]> = {
    'click_event': ['source', 'artist_name', 'venue_name'],
    'click_ticket': ['ticket_url', 'ticket_provider', 'event_id'],
    'search': ['query', 'search_type'],
    'impression_event': ['source', 'position'],
    'view_event': ['source']
  };
  
  const key = `${eventType}_${entityType}`;
  const required = requiredFields[key];
  
  if (!required) {
    return true; // No specific requirements
  }
  
  // Check if all required fields are present
  return required.every(field => {
    const value = metadata[field];
    return value !== undefined && value !== null && value !== '';
  });
}

/**
 * Format tracking metadata for logging
 * Useful for debugging
 */
export function formatTrackingLog(
  eventType: string,
  entityType: string,
  entityId: string,
  metadata: any
): string {
  const timestamp = new Date().toISOString();
  return `[TRACK ${timestamp}] ${eventType} → ${entityType}:${entityId} | ${JSON.stringify(metadata, null, 2)}`;
}

/**
 * Calculate click-through rate
 */
export function calculateCTR(impressions: number, clicks: number): number {
  if (impressions === 0) return 0;
  return (clicks / impressions) * 100;
}

/**
 * Calculate conversion rate
 */
export function calculateConversionRate(views: number, conversions: number): number {
  if (views === 0) return 0;
  return (conversions / views) * 100;
}

/**
 * Extract artist name from event
 * Handles various event data structures
 */
export function extractArtistName(event: any): string | undefined {
  return event.artist_name || event.event_data?.artist_name || event.event_info?.artist_name;
}

/**
 * Extract venue name from event
 * Handles various event data structures
 */
export function extractVenueName(event: any): string | undefined {
  return event.venue_name || event.event_data?.venue_name || event.event_info?.venue_name;
}

/**
 * Build consistent source identifier
 */
export function buildSourceIdentifier(
  component: 'feed' | 'search' | 'profile' | 'artist_page' | 'venue_page' | 'event_modal',
  subContext?: string
): string {
  if (subContext) {
    return `${component}_${subContext}`;
  }
  return component;
}

/**
 * Extract review metadata for tracking
 */
export function extractReviewMetadata(review: any, additionalMetadata: any = {}) {
  return {
    review_id: review.id || review.review_id,
    rating: review.rating,
    has_photos: !!(review.photos?.length),
    photo_count: review.photos?.length || 0,
    has_setlist: !!(review.setlist || review.custom_setlist),
    is_public: review.is_public !== false,
    review_length: review.review_text?.length || 0,
    event_id: review.event_id,
    ...additionalMetadata
  };
}

/**
 * Check if tracking should be enabled
 * Can disable in development or for specific users
 */
export function shouldTrack(): boolean {
  // Always track in production
  if (process.env.NODE_ENV === 'production') {
    return true;
  }
  
  // In development, check localStorage flag
  if (typeof window !== 'undefined') {
    const devTrackingEnabled = localStorage.getItem('dev_tracking_enabled');
    return devTrackingEnabled === 'true';
  }
  
  return false;
}

/**
 * Log tracking event to console in development
 */
export function logTrackingEvent(
  eventType: string,
  entityType: string,
  entityId: string,
  metadata: any
) {
  if (process.env.NODE_ENV === 'development') {
    console.log(
      `%c[TRACK] ${eventType} → ${entityType}`,
      'color: #10b981; font-weight: bold',
      {
        entityId,
        metadata,
        timestamp: new Date().toISOString()
      }
    );
  }
}

