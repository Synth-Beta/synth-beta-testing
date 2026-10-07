/** Saved-location radius for newsletter shows. Keep the edge function and admin app on this module. */
export const NEARBY_MILES = 75;

const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY",
  louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

export const canonicalState = (value?: string | null) => {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  if (STATE_NAMES[raw]) return STATE_NAMES[raw];
  if (/^[a-z]{2}$/i.test(value.trim())) return value.trim().toUpperCase();
  return raw.toUpperCase();
};

export const sameState = (left?: string | null, right?: string | null) => {
  if (!left || !right) return true;
  return canonicalState(left) === canonicalState(right);
};

export const placeKey = (city?: string | null, state?: string | null) =>
  `${String(city ?? "").trim().toLowerCase()}|${canonicalState(state) ?? ""}`;

export interface Place {
  city: string;
  state?: string | null;
}

export interface Point {
  latitude: number;
  longitude: number;
}

export const boundingBox = (latitude: number, longitude: number, miles = NEARBY_MILES) => {
  const latDelta = miles / 69;
  const lngDelta = miles / (69 * Math.max(0.2, Math.cos((latitude * Math.PI) / 180)));
  return {
    minLat: latitude - latDelta,
    maxLat: latitude + latDelta,
    minLng: longitude - lngDelta,
    maxLng: longitude + lngDelta,
  };
};

export const milesBetween = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earth = 3959;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export const eventWithinSavedLocation = (
  reader: { city?: string | null; state?: string | null; latitude?: number | null; longitude?: number | null },
  event: { city?: string | null; state?: string | null; latitude?: number | null; longitude?: number | null }
) => {
  if (finite(reader.latitude) && finite(reader.longitude) && finite(event.latitude) && finite(event.longitude)) {
    return milesBetween(reader.latitude, reader.longitude, event.latitude, event.longitude) <= NEARBY_MILES;
  }
  if (reader.city) {
    const sameCity = String(event.city ?? "").trim().toLowerCase() === reader.city.trim().toLowerCase();
    return sameCity && sameState(event.state, reader.state);
  }
  return true;
};

export type EventQuery =
  | { kind: "city-sample"; city: string; from: string }
  | { kind: "box"; minLat: number; maxLat: number; minLng: number; maxLng: number; from: string; until: string }
  | { kind: "artist"; artist: string; from: string; until: string };

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

export const loadEventsNearPlaces = async (
  places: Place[],
  artists: string[],
  now: Date,
  query: (spec: EventQuery) => Promise<any[]>
) => {
  const from = now.toISOString();
  const until = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const centers = new Map<string, Point>();
  const events: any[] = [];
  const seen = new Set<string>();
  const add = (rows: any[]) => {
    for (const row of rows) {
      const id = String(row?.id ?? "");
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      events.push(row);
    }
  };

  for (const place of places) {
    const sample = await query({ kind: "city-sample", city: place.city, from });
    const located = sample.filter(
      (row) => finite(Number(row.latitude)) && finite(Number(row.longitude)) && sameState(row.venue_state, place.state)
    );
    if (!located.length) continue;
    const center = {
      latitude: average(located.map((row) => Number(row.latitude))),
      longitude: average(located.map((row) => Number(row.longitude))),
    };
    centers.set(placeKey(place.city, place.state), center);
    const box = boundingBox(center.latitude, center.longitude);
    add(await query({ kind: "box", ...box, from, until }));
  }

  for (const artist of artists) {
    const rows = await query({ kind: "artist", artist, from, until });
    add(
      rows.filter((row) => String(row.artists?.name || row.artist_name || "").toLowerCase() === artist.toLowerCase())
    );
  }

  return { centers, events };
};
