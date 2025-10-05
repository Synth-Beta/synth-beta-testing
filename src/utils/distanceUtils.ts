/**
 * Utility functions for calculating distances between geographic points
 */

/**
 * Calculate the distance between two points on Earth using the Haversine formula
 * @param lat1 Latitude of first point
 * @param lon1 Longitude of first point
 * @param lat2 Latitude of second point
 * @param lon2 Longitude of second point
 * @returns Distance in miles
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 100) / 100; // Round to 2 decimal places
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate the center point of an array of coordinates
 * @param coordinates Array of [lat, lng] pairs
 * @returns Center point as [lat, lng]
 */
export function calculateCenter(coordinates: [number, number][]): [number, number] {
  if (coordinates.length === 0) {
    return [39.8283, -98.5795]; // Default to center of US
  }
  
  if (coordinates.length === 1) {
    return coordinates[0];
  }
  
  const totalLat = coordinates.reduce((sum, [lat]) => sum + lat, 0);
  const totalLng = coordinates.reduce((sum, [, lng]) => sum + lng, 0);
  
  return [totalLat / coordinates.length, totalLng / coordinates.length];
}

/**
 * Calculate the bounding box for a set of coordinates
 * @param coordinates Array of [lat, lng] pairs
 * @param padding Padding in degrees (optional, default 0.1)
 * @returns Bounding box as { north, south, east, west }
 */
export function calculateBounds(
  coordinates: [number, number][], 
  padding: number = 0.1
): { north: number; south: number; east: number; west: number } {
  if (coordinates.length === 0) {
    return {
      north: 40,
      south: 39,
      east: -97,
      west: -99
    };
  }
  
  const lats = coordinates.map(([lat]) => lat);
  const lngs = coordinates.map(([, lng]) => lng);
  
  return {
    north: Math.max(...lats) + padding,
    south: Math.min(...lats) - padding,
    east: Math.max(...lngs) + padding,
    west: Math.min(...lngs) - padding
  };
}

/**
 * Calculate appropriate zoom level based on bounding box
 * @param bounds Bounding box
 * @returns Zoom level (1-18)
 */
export function calculateZoomLevel(bounds: { north: number; south: number; east: number; west: number }): number {
  const latDiff = bounds.north - bounds.south;
  const lngDiff = bounds.east - bounds.west;
  const maxDiff = Math.max(latDiff, lngDiff);
  
  // Simple zoom calculation - can be refined based on specific needs
  if (maxDiff > 50) return 4;
  if (maxDiff > 20) return 5;
  if (maxDiff > 10) return 6;
  if (maxDiff > 5) return 7;
  if (maxDiff > 2) return 8;
  if (maxDiff > 1) return 9;
  if (maxDiff > 0.5) return 10;
  if (maxDiff > 0.2) return 11;
  if (maxDiff > 0.1) return 12;
  if (maxDiff > 0.05) return 13;
  if (maxDiff > 0.02) return 14;
  if (maxDiff > 0.01) return 15;
  return 16;
}

/**
 * Filter events within a radius of a center point
 * @param events Array of events with latitude/longitude
 * @param centerLat Center latitude
 * @param centerLng Center longitude
 * @param radiusMiles Radius in miles
 * @returns Filtered events with distance_miles property
 */
export function filterEventsByRadius<T extends { latitude?: number | null; longitude?: number | null }>(
  events: T[],
  centerLat: number,
  centerLng: number,
  radiusMiles: number
): (T & { distance_miles: number })[] {
  return events
    .filter(event => 
      event.latitude != null && 
      event.longitude != null &&
      !Number.isNaN(Number(event.latitude)) &&
      !Number.isNaN(Number(event.longitude))
    )
    .map(event => {
      const distance = calculateDistance(
        centerLat,
        centerLng,
        Number(event.latitude),
        Number(event.longitude)
      );
      return {
        ...event,
        distance_miles: distance
      };
    })
    .filter(event => event.distance_miles <= radiusMiles)
    .sort((a, b) => a.distance_miles - b.distance_miles);
}

/**
 * Format distance for display
 * @param distance Distance in miles
 * @returns Formatted distance string
 */
export function formatDistance(distance: number): string {
  if (distance < 1) {
    return `${Math.round(distance * 5280)} ft`;
  } else if (distance < 10) {
    return `${distance.toFixed(1)} mi`;
  } else {
    return `${Math.round(distance)} mi`;
  }
}
