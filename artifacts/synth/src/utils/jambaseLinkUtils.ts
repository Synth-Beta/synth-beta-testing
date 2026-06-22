import type { JamBaseEvent } from '@/types/eventTypes';

/**
 * Get the primary ticket link URL for a JamBase event.
 * Returns the first ticket URL from ticket_urls array, or null if none available.
 * 
 * Per JamBase requirements: Use primary ticket link (first in array).
 * URLs must NOT be modified.
 */
export function getPrimaryTicketUrl(event: JamBaseEvent | any): string | null {
  if (event.ticket_urls && Array.isArray(event.ticket_urls) && event.ticket_urls.length > 0) {
    // Return first ticket URL (primary) - do not modify
    return event.ticket_urls[0];
  }
  return null;
}

/**
 * Get the JamBase event URL for a JamBase event.
 * Format: https://www.jambase.com/event/{jambase_event_id}
 * 
 * Used as fallback when no ticket URLs are available.
 */
export function getJamBaseEventUrl(event: JamBaseEvent | any): string | null {
  const jambaseEventId = event.jambase_event_id;
  if (!jambaseEventId) return null;
  
  // Remove "jambase:" prefix if present
  const cleanId = jambaseEventId.toString().replace(/^jambase:/, '');
  return `https://www.jambase.com/event/${cleanId}`;
}

/**
 * Get the compliant link URL for a JamBase event.
 * Returns primary ticket URL if available, otherwise JamBase event URL.
 * 
 * Per JamBase requirements:
 * - Each event must include a link to primary Ticket Link URL OR JamBase event URL
 * - Ticket Link URLs must NOT be modified
 */
export function getCompliantEventLink(event: JamBaseEvent | any): string | null {
  // Try primary ticket URL first
  const ticketUrl = getPrimaryTicketUrl(event);
  if (ticketUrl) {
    return ticketUrl;
  }
  
  // Fallback to JamBase event URL
  return getJamBaseEventUrl(event);
}
