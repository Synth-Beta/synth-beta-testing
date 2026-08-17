import { calculateDistanceMiles } from './geo';

/** Minimum shape a review/show pin needs for location clustering. */
export interface TravelPinLocation {
  id: string;
  latitude: number;
  longitude: number;
  venue_name?: string | null;
  venue_city?: string | null;
  venue_state?: string | null;
}

/** One map dot — every pin within radiusMiles of each other, so nearby venues
 *  (or venues missing city data) don't render as separate dots from their real city. */
export interface TravelLocationGroup<T extends TravelPinLocation> {
  key: string;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
  shows: T[];
}

/** Metro-area radius: close enough that venues genuinely in the same city merge,
 *  far enough that distinct nearby cities (e.g. DC and Baltimore) stay separate. */
const DEFAULT_RADIUS_MILES = 15;

/**
 * Groups pins into map dots by geographic proximity rather than exact-string city
 * match. String matching breaks whenever `venue.city` is NULL or formatted
 * differently across venue rows — confirmed live: a DC venue with a null city
 * grouped away from "Washington", and a duplicate venue row with a null city
 * grouped away from "Amsterdam" despite sitting at identical coordinates.
 * Proximity clustering merges those into the correct dot regardless of what the
 * city/state strings say.
 */
export function groupTravelPinsByLocation<T extends TravelPinLocation>(
  pins: T[],
  radiusMiles: number = DEFAULT_RADIUS_MILES
): TravelLocationGroup<T>[] {
  const groups: TravelLocationGroup<T>[] = [];

  for (const pin of pins) {
    const target = groups.find(
      (g) => calculateDistanceMiles(g.latitude, g.longitude, pin.latitude, pin.longitude) <= radiusMiles
    );

    if (target) {
      const n = target.shows.length;
      target.latitude = (target.latitude * n + pin.latitude) / (n + 1);
      target.longitude = (target.longitude * n + pin.longitude) / (n + 1);
      target.shows.push(pin);
      if (!target.city && pin.venue_city?.trim()) target.city = pin.venue_city.trim();
      if (!target.state && pin.venue_state?.trim()) target.state = pin.venue_state.trim();
    } else {
      groups.push({
        key: pin.id,
        city: pin.venue_city?.trim() || null,
        state: pin.venue_state?.trim() || null,
        latitude: pin.latitude,
        longitude: pin.longitude,
        shows: [pin],
      });
    }
  }

  return groups;
}
