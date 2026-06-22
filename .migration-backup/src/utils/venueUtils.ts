/**
 * Utility functions for handling venue data and display
 */

export interface VenueDisplayInfo {
  name: string;
  location: string | null;
  fullAddress: string | null;
}

/**
 * Format venue name for display
 * Returns a user-friendly string instead of null/undefined
 */
export function formatVenueName(venueName: string | null | undefined): string {
  if (!venueName || venueName.trim() === '' || venueName === 'NULL') {
    return 'Venue TBD';
  }
  return venueName.trim();
}

/**
 * Format venue location (city, state) for display
 */
export function formatVenueLocation(
  city: string | null | undefined,
  state: string | null | undefined
): string {
  const parts = [];
  if (city && city.trim() !== '' && city !== 'NULL') {
    parts.push(city.trim());
  }
  if (state && state.trim() !== '' && state !== 'NULL') {
    parts.push(state.trim());
  }
  return parts.length > 0 ? parts.join(', ') : '';
}

/**
 * Format full venue address for display
 */
export function formatVenueAddress(
  address: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined,
  zip: string | null | undefined
): string {
  const parts = [];
  if (address && address.trim() !== '' && address !== 'NULL') {
    parts.push(address.trim());
  }
  
  const location = formatVenueLocation(city, state);
  if (location) {
    parts.push(location);
  }
  
  if (zip && zip.trim() !== '' && zip !== 'NULL') {
    parts.push(zip.trim());
  }
  
  return parts.length > 0 ? parts.join(', ') : '';
}

/**
 * Get complete venue display info
 */
export function getVenueDisplayInfo(
  venueName: string | null | undefined,
  venueCity: string | null | undefined,
  venueState: string | null | undefined,
  venueAddress?: string | null | undefined,
  venueZip?: string | null | undefined
): VenueDisplayInfo {
  return {
    name: formatVenueName(venueName),
    location: formatVenueLocation(venueCity, venueState) || null,
    fullAddress: formatVenueAddress(venueAddress, venueCity, venueState, venueZip) || null
  };
}

/**
 * Check if venue info is complete
 */
export function hasCompleteVenueInfo(
  venueName: string | null | undefined,
  venueCity: string | null | undefined,
  venueState: string | null | undefined
): boolean {
  return !!(
    venueName && 
    venueName.trim() !== '' && 
    venueName !== 'NULL' &&
    venueCity && 
    venueCity.trim() !== '' && 
    venueCity !== 'NULL' &&
    venueState && 
    venueState.trim() !== '' && 
    venueState !== 'NULL'
  );
}

