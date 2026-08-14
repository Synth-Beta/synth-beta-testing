export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface ResolvedLocation extends Coordinates {
  source: 'manual' | 'live' | 'cached';
}

export interface LocationResolutionInputs {
  /** User-picked "browse this city" override. Wins unconditionally when present. */
  manual?: Coordinates | null;
  /** Fresh GPS fix from this session. */
  live?: Coordinates | null;
  /** Last-known GPS fix (persisted), used only while `live` hasn't resolved yet. */
  cached?: Coordinates | null;
}

/**
 * Single source of truth for "where is this user" across web + mobile.
 * Precedence: explicit manual override > live GPS > cached last-known GPS > none.
 *
 * Deliberately excludes any profile "home city" fallback - `users.location_city`
 * is identity data (set once at onboarding, edited rarely), not a live location
 * signal. Silently substituting it for GPS produces stale, inconsistent results
 * across features (e.g. a user who onboarded in DC seeing DC events while
 * traveling, in one feed section but not another).
 */
export function resolveLocation(inputs: LocationResolutionInputs): ResolvedLocation | null {
  if (inputs.manual) {
    return { latitude: inputs.manual.latitude, longitude: inputs.manual.longitude, source: 'manual' };
  }
  if (inputs.live) {
    return { latitude: inputs.live.latitude, longitude: inputs.live.longitude, source: 'live' };
  }
  if (inputs.cached) {
    return { latitude: inputs.cached.latitude, longitude: inputs.cached.longitude, source: 'cached' };
  }
  return null;
}
