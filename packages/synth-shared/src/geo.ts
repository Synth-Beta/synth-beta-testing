/** Great-circle distance between two lat/lng points, in miles (Haversine formula). */
export function calculateDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3959; // Earth's radius in miles
  const toRad = (deg: number) => deg * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Lat/lng deltas approximating a `radiusMiles` circle around `centerLat`, for a
 *  cheap bounding-box prefilter before exact-distance filtering. */
export function boundingBoxDeltas(
  centerLat: number,
  radiusMiles: number
): { latDelta: number; lngDelta: number } {
  const latDelta = radiusMiles / 69; // 1 degree latitude ≈ 69 miles
  const lngDelta = radiusMiles / (69 * Math.cos((centerLat * Math.PI) / 180));
  return { latDelta, lngDelta };
}
