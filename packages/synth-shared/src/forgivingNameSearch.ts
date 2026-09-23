import type { SynthSupabaseClient } from './supabaseClientType';

/** Clamp so a typed search cannot fan out into an unbounded scan. */
const MAX_LIMIT = 100;
const FALLBACK_POOL = 120;

export function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Safe fragment for PostgREST `.or()` values (commas/parens would inject clauses). */
export function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,()"'\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function searchWords(query: string): string[] {
  return sanitizeSearchTerm(query).toLowerCase().split(/[\s'’]+/).filter(Boolean);
}

function tokenWildcardPatterns(word: string): string[] {
  if (word.length < 4 || word.length > 12) return [`%${escapeIlikePattern(word)}%`];
  const patterns = [`%${escapeIlikePattern(word)}%`];
  for (let i = 0; i < word.length; i++) {
    const deleted = escapeIlikePattern(word.slice(0, i) + word.slice(i + 1));
    if (deleted) patterns.push(`%${deleted}%`);
    // One-character substitution via ILIKE `_` so "gtacie" → "%g_acie%" matches "gracie".
    const substituted =
      escapeIlikePattern(word.slice(0, i)) + '_' + escapeIlikePattern(word.slice(i + 1));
    patterns.push(`%${substituted}%`);
  }
  return patterns;
}

/**
 * ILIKE patterns that match substrings, token prefixes, 1-character deletions,
 * and 1-character substitutions. "grace ab" becomes "%grace%ab%" (Gracie Abrams);
 * "gtacie" also tries "%g_acie%".
 */
export function forgivingIlikePatterns(query: string): string[] {
  const q = sanitizeSearchTerm(query);
  if (!q) return [];
  const words = searchWords(q);
  const patterns = new Set<string>([`%${escapeIlikePattern(q)}%`]);

  if (words.length > 1) {
    patterns.add(`%${words.map((w) => escapeIlikePattern(w)).join('%')}%`);
  }

  for (const word of words) {
    if (word.length >= 4) {
      for (const pattern of tokenWildcardPatterns(word)) patterns.add(pattern);
    } else if (word.length >= 2 && words.length > 1) {
      patterns.add(`% ${escapeIlikePattern(word)}%`);
      patterns.add(`${escapeIlikePattern(word)}%`);
    }
  }

  return [...patterns];
}

function tokenMatchScore(queryWord: string, nameWord: string): number {
  if (!queryWord || !nameWord) return 0;
  if (queryWord === nameWord) return 1;
  if (queryWord.length >= 2 && nameWord.startsWith(queryWord)) return 0.94;
  if (nameWord.length >= 3 && queryWord.startsWith(nameWord)) return 0.82;
  if (queryWord.length >= 3 && nameWord.includes(queryWord)) return 0.76;
  if (queryWord.length >= 4 && nameWord.length >= 4) {
    const distance = levenshtein(queryWord, nameWord);
    if (distance <= 1) return 0.9;
    if (distance === 2 && Math.min(queryWord.length, nameWord.length) >= 5) return 0.8;
    const similarity = 1 - distance / Math.max(queryWord.length, nameWord.length);
    if (similarity >= 0.7) return similarity * 0.85;
  }
  return 0;
}

function scoreTokenAlignment(queryWords: string[], nameWords: string[]): number {
  if (queryWords.length === 0 || nameWords.length === 0) return 0;
  const used = new Set<number>();
  let total = 0;
  let hits = 0;
  for (const queryWord of queryWords) {
    let best = 0;
    let bestIdx = -1;
    nameWords.forEach((nameWord, idx) => {
      if (used.has(idx)) return;
      const score = tokenMatchScore(queryWord, nameWord);
      if (score > best) {
        best = score;
        bestIdx = idx;
      }
    });
    if (best > 0 && bestIdx >= 0) {
      used.add(bestIdx);
      total += best;
      hits += 1;
    }
  }
  if (hits === 0) return 0;
  const coverage =
    queryWords.reduce((sum, word) => sum + word.length, 0) /
    Math.max(nameWords.reduce((sum, word) => sum + word.length, 0), 1);
  if (hits === queryWords.length) {
    let score = 72 + (total / hits) * 26;
    if (coverage < 0.3) score -= (0.3 - coverage) * 80;
    return Math.max(60, Math.round(score));
  }
  if (hits >= Math.ceil(queryWords.length * 0.5)) {
    return Math.round(52 + (total / queryWords.length) * 28);
  }
  return 0;
}

export function scoreNameMatch(query: string, name: string): number {
  const q = query.toLowerCase().trim();
  const n = name.toLowerCase().trim();
  if (!q || !n) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 95;

  const qWords = q.split(/[\s'’]+/).filter(Boolean);
  const nWords = n.split(/[\s'’]+/).filter(Boolean);
  const aligned = scoreTokenAlignment(qWords, nWords);
  if (aligned > 0) return aligned;

  if (n.includes(q)) {
    const coverage = q.length / n.length;
    return coverage >= 0.3 ? 85 + Math.round(coverage * 10) : 72 + Math.round(coverage * 15);
  }

  if (q.length >= 4) {
    let bestWord = 0;
    for (const nw of nWords) {
      if (nw.length < 3) continue;
      const distance = levenshtein(q, nw);
      const maxLength = Math.max(q.length, nw.length);
      const similarity = 1 - distance / maxLength;
      if (distance <= 1) bestWord = Math.max(bestWord, 88);
      else if (distance === 2 && Math.min(q.length, nw.length) >= 6) bestWord = Math.max(bestWord, 82);
      else if (similarity >= 0.75) bestWord = Math.max(bestWord, Math.round(70 + similarity * 15));
    }
    if (bestWord > 0) return bestWord;
  }

  const similarity = 1 - levenshtein(q, n) / Math.max(q.length, n.length);
  return similarity > 0.5 ? Math.round(similarity * 60) : 0;
}

function levenshtein(a: string, b: string): number {
  const rows = b.length + 1;
  const cols = a.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < cols; i++) matrix[0][i] = i;
  for (let j = 0; j < rows; j++) matrix[j][0] = j;
  for (let j = 1; j < rows; j++) {
    for (let i = 1; i < cols; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || !limit) return 20;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

function orIlike(column: string, query: string): string | null {
  const patterns = forgivingIlikePatterns(query);
  if (patterns.length === 0) return null;
  return patterns.map((p) => `${column}.ilike.${p}`).join(',');
}

async function fetchByNamePatterns(
  client: SynthSupabaseClient,
  table: string,
  columns: string,
  query: string,
  poolSize: number
): Promise<Array<Record<string, unknown>>> {
  const filter = orIlike('name', query);
  const words = searchWords(query);
  const requests: Promise<{ data: unknown; error: unknown }>[] = [];

  if (filter) {
    requests.push(
      client
        .from(table)
        .select(columns)
        .or(filter)
        .order('num_upcoming_events', { ascending: false, nullsFirst: false })
        .limit(poolSize)
    );
  }

  // AND each token so "grace ab" requires both fragments, not the exact phrase.
  if (words.length > 1 && words.every((word) => word.length >= 2)) {
    let andQuery = client.from(table).select(columns);
    for (const word of words) {
      andQuery = andQuery.ilike('name', `%${escapeIlikePattern(word)}%`);
    }
    requests.push(
      andQuery.order('num_upcoming_events', { ascending: false, nullsFirst: false }).limit(poolSize)
    );
  }

  if (requests.length === 0) return [];
  const results = await Promise.all(requests);
  const byId = new Map<string, Record<string, unknown>>();
  for (const result of results) {
    if (result.error || !Array.isArray(result.data)) continue;
    for (const row of result.data as Array<Record<string, unknown>>) {
      const id = row.id != null ? String(row.id) : '';
      if (id && !byId.has(id)) byId.set(id, row);
    }
  }
  return [...byId.values()];
}

export type FuzzyArtistRow = {
  id: string;
  name: string;
  identifier: string | null;
  image_url: string | null;
  genres: string[] | null;
  num_upcoming_events: number | null;
  match_score: number;
};

export type FuzzyVenueRow = {
  id: string;
  name: string;
  identifier: string | null;
  image_url: string | null;
  city: string | null;
  state: string | null;
  street_address: string | null;
  latitude: number | null;
  longitude: number | null;
  num_upcoming_events: number | null;
  match_score: number;
};

export type FuzzyUserRow = {
  user_id: string;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  account_type: string | null;
  match_score: number;
};

export type FuzzyEventRow = {
  id: string;
  title: string | null;
  event_date: string | null;
  artist_id: string | null;
  venue_id: string | null;
  artist_name: string | null;
  venue_name: string | null;
  venue_city: string | null;
  event_media_url: string | null;
  images: unknown;
  ticket_urls: unknown;
  match_score: number;
};

export async function searchArtistsFuzzy(
  client: SynthSupabaseClient,
  query: string,
  limit = 20
): Promise<FuzzyArtistRow[]> {
  const q = sanitizeSearchTerm(query);
  const capped = clampLimit(limit);
  if (q.length < 2) return [];

  const rpc = await client.rpc('search_artists_fuzzy', { p_query: q, p_limit: capped });
  if (!rpc.error && Array.isArray(rpc.data)) {
    return (rpc.data as FuzzyArtistRow[]).map(normalizeArtistRow);
  }

  const rows = await fetchByNamePatterns(
    client,
    'artists',
    'id, name, identifier, image_url, genres, num_upcoming_events',
    q,
    Math.max(capped * 5, FALLBACK_POOL)
  );
  if (rows.length === 0) return [];

  return rows
    .map((row) => normalizeArtistRow({ ...row, match_score: scoreNameMatch(q, String(row.name ?? '')) }))
    .filter((row) => row.match_score > 5)
    .sort((a, b) => b.match_score - a.match_score || (b.num_upcoming_events ?? 0) - (a.num_upcoming_events ?? 0))
    .slice(0, capped);
}

export async function searchVenuesFuzzy(
  client: SynthSupabaseClient,
  query: string,
  limit = 20
): Promise<FuzzyVenueRow[]> {
  const q = sanitizeSearchTerm(query);
  const capped = clampLimit(limit);
  if (q.length < 2) return [];

  const rpc = await client.rpc('search_venues_fuzzy', { p_query: q, p_limit: capped });
  if (!rpc.error && Array.isArray(rpc.data)) {
    return (rpc.data as FuzzyVenueRow[]).map(normalizeVenueRow);
  }

  const rows = await fetchByNamePatterns(
    client,
    'venues',
    'id, name, identifier, image_url, city, state, street_address, latitude, longitude, num_upcoming_events',
    q,
    Math.max(capped * 5, FALLBACK_POOL)
  );
  if (rows.length === 0) return [];

  return rows
    .map((row) => normalizeVenueRow({ ...row, match_score: scoreNameMatch(q, String(row.name ?? '')) }))
    .filter((row) => row.match_score > 5)
    .sort((a, b) => b.match_score - a.match_score || (b.num_upcoming_events ?? 0) - (a.num_upcoming_events ?? 0))
    .slice(0, capped);
}

export async function searchUsersFuzzy(
  client: SynthSupabaseClient,
  query: string,
  opts?: { limit?: number; offset?: number; excludeUserId?: string | null }
): Promise<FuzzyUserRow[]> {
  const q = sanitizeSearchTerm(query);
  const capped = clampLimit(opts?.limit);
  const offset = Math.max(0, opts?.offset ?? 0);
  if (q.length < 2) return [];

  const rpc = await client.rpc('search_users_fuzzy', {
    p_query: q,
    p_limit: capped,
    p_offset: offset,
    p_exclude_user_id: opts?.excludeUserId ?? null,
  });
  if (!rpc.error && Array.isArray(rpc.data)) {
    return (rpc.data as FuzzyUserRow[]).map(normalizeUserRow);
  }

  const nameFilter = orIlike('name', q);
  const usernameFilter = orIlike('username', q);
  const filter = [nameFilter, usernameFilter].filter(Boolean).join(',');
  if (!filter) return [];

  let request = client
    .from('users')
    .select('user_id, name, username, avatar_url, bio, account_type')
    .or(filter)
    .limit(Math.max(capped + offset, FALLBACK_POOL));
  if (opts?.excludeUserId) {
    request = request.neq('user_id', opts.excludeUserId);
  }
  const { data, error } = await request;
  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>)
    .map((row) => {
      const name = String(row.name ?? '');
      const username = row.username != null ? String(row.username) : '';
      return normalizeUserRow({
        ...row,
        match_score: Math.max(scoreNameMatch(q, name), scoreNameMatch(q, username)),
      });
    })
    .filter((row) => row.match_score > 5)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(offset, offset + capped);
}

export async function searchEventsFuzzy(
  client: SynthSupabaseClient,
  query: string,
  opts?: { limit?: number; offset?: number }
): Promise<FuzzyEventRow[]> {
  const q = sanitizeSearchTerm(query);
  const capped = clampLimit(opts?.limit);
  const offset = Math.max(0, opts?.offset ?? 0);
  if (q.length < 2) return [];

  const rpc = await client.rpc('search_events_fuzzy', {
    p_query: q,
    p_limit: capped,
    p_offset: offset,
  });
  if (!rpc.error && Array.isArray(rpc.data)) {
    return (rpc.data as FuzzyEventRow[]).map(normalizeEventRow);
  }

  const artistFilter = orIlike('name', q);
  const venueFilter = orIlike('name', q);
  const titleFilter = orIlike('title', q);
  const [artistsRes, venuesRes] = await Promise.all([
    artistFilter
      ? client.from('artists').select('id, name').or(artistFilter).limit(40)
      : Promise.resolve({ data: [], error: null }),
    venueFilter
      ? client.from('venues').select('id, name').or(venueFilter).limit(40)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const artistIds = ((artistsRes.data || []) as Array<{ id: string; name: string }>).map((a) => a.id);
  const venueIds = ((venuesRes.data || []) as Array<{ id: string; name: string }>).map((v) => v.id);
  const artistNames = new Map(
    ((artistsRes.data || []) as Array<{ id: string; name: string }>).map((a) => [a.id, a.name])
  );
  const venueNames = new Map(
    ((venuesRes.data || []) as Array<{ id: string; name: string }>).map((v) => [v.id, v.name])
  );

  const clauses = [
    titleFilter,
    artistIds.length ? `artist_id.in.(${artistIds.join(',')})` : null,
    venueIds.length ? `venue_id.in.(${venueIds.join(',')})` : null,
  ].filter(Boolean) as string[];
  if (clauses.length === 0) return [];

  const { data, error } = await client
    .from('events')
    .select(
      'id, title, event_date, artist_id, venue_id, venue_city, event_media_url, images, ticket_urls, artists:artist_id(name), venues:venue_id(name, city)'
    )
    .or(clauses.join(','))
    .limit(Math.max(capped + offset, FALLBACK_POOL));
  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>)
    .map((row) => {
      const artistName =
        nestedName(row.artists) ||
        (typeof row.artist_id === 'string' ? artistNames.get(row.artist_id) : undefined) ||
        '';
      const venueName =
        nestedName(row.venues) ||
        (typeof row.venue_id === 'string' ? venueNames.get(row.venue_id) : undefined) ||
        '';
      const title = String(row.title ?? '');
      const match_score = Math.max(
        scoreNameMatch(q, title),
        scoreNameMatch(q, artistName),
        scoreNameMatch(q, venueName)
      );
      return normalizeEventRow({
        ...row,
        artist_name: artistName,
        venue_name: venueName,
        venue_city: nestedCity(row.venues) ?? row.venue_city,
        match_score,
      });
    })
    .filter((row) => row.match_score > 5)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(offset, offset + capped);
}

function nestedName(value: unknown): string {
  if (value && typeof value === 'object' && 'name' in value && typeof (value as { name: unknown }).name === 'string') {
    return (value as { name: string }).name;
  }
  return '';
}

function nestedCity(value: unknown): string | null {
  if (value && typeof value === 'object' && 'city' in value) {
    const city = (value as { city: unknown }).city;
    return city == null ? null : String(city);
  }
  return null;
}

function normalizeArtistRow(row: Record<string, unknown> | FuzzyArtistRow): FuzzyArtistRow {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    identifier: row.identifier == null ? null : String(row.identifier),
    image_url: row.image_url == null ? null : String(row.image_url),
    genres: Array.isArray(row.genres) ? (row.genres as string[]) : null,
    num_upcoming_events:
      typeof row.num_upcoming_events === 'number' ? row.num_upcoming_events : Number(row.num_upcoming_events) || 0,
    match_score: Number(row.match_score) || 0,
  };
}

function normalizeVenueRow(row: Record<string, unknown> | FuzzyVenueRow): FuzzyVenueRow {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    identifier: row.identifier == null ? null : String(row.identifier),
    image_url: row.image_url == null ? null : String(row.image_url),
    city: row.city == null ? null : String(row.city),
    state: row.state == null ? null : String(row.state),
    street_address: row.street_address == null ? null : String(row.street_address),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    num_upcoming_events:
      typeof row.num_upcoming_events === 'number' ? row.num_upcoming_events : Number(row.num_upcoming_events) || 0,
    match_score: Number(row.match_score) || 0,
  };
}

function normalizeUserRow(row: Record<string, unknown> | FuzzyUserRow): FuzzyUserRow {
  return {
    user_id: String(row.user_id),
    name: row.name == null ? null : String(row.name),
    username: row.username == null ? null : String(row.username),
    avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
    bio: row.bio == null ? null : String(row.bio),
    account_type: row.account_type == null ? null : String(row.account_type),
    match_score: Number(row.match_score) || 0,
  };
}

function normalizeEventRow(row: Record<string, unknown> | FuzzyEventRow): FuzzyEventRow {
  return {
    id: String(row.id),
    title: row.title == null ? null : String(row.title),
    event_date: row.event_date == null ? null : String(row.event_date),
    artist_id: row.artist_id == null ? null : String(row.artist_id),
    venue_id: row.venue_id == null ? null : String(row.venue_id),
    artist_name: row.artist_name == null ? null : String(row.artist_name),
    venue_name: row.venue_name == null ? null : String(row.venue_name),
    venue_city: row.venue_city == null ? null : String(row.venue_city),
    event_media_url: row.event_media_url == null ? null : String(row.event_media_url),
    images: row.images ?? null,
    ticket_urls: row.ticket_urls ?? null,
    match_score: Number(row.match_score) || 0,
  };
}

export interface ReviewEventSearchRow {
  id: string;
  title: string | null;
  artist_name_normalized: string | null;
  venue_name_normalized: string | null;
  event_date: string;
  artist_id: string | null;
  venue_id: string | null;
}

function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Same local-calendar-day rule as each app's `isEventPast`. */
function isPastLocalDay(raw: unknown, now: Date): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : (() => {
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? toLocalYmd(d) : null;
  })();
  if (!ymd) return false;
  return ymd < toLocalYmd(now);
}

/**
 * Past shows matching a free-text artist / venue / title query, newest first.
 *
 * The cutoff has to live in the query: ordering by date DESC and filtering to
 * past rows client-side returns nothing, because the newest N rows for any
 * popular artist are all upcoming shows. The cutoff is deliberately one day
 * loose (event_date is timestamptz, the rule is local-calendar-day) and
 * `isPastLocalDay` does the exact gate afterwards.
 */
export async function searchPastEventsForReview(
  client: SynthSupabaseClient,
  query: string,
  opts?: { limit?: number; now?: Date }
): Promise<ReviewEventSearchRow[]> {
  const q = sanitizeSearchTerm(query);
  if (q.length < 2) return [];

  const now = opts?.now ?? new Date();
  const limit = Math.max(1, Math.min(50, opts?.limit ?? 20));
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const pattern = `%${escapeIlikePattern(q)}%`;

  const { data, error } = await client
    .from('events_with_artist_venue')
    .select('id, title, artist_name_normalized, venue_name_normalized, event_date, artist_id, venue_id')
    .or(
      `artist_name_normalized.ilike.${pattern},title.ilike.${pattern},venue_name_normalized.ilike.${pattern}`
    )
    .lt('event_date', toLocalYmd(tomorrow))
    .order('event_date', { ascending: false })
    .limit(limit * 4);
  if (error || !data) return [];

  // The view is known to emit some events twice; dedupe before slicing.
  const seen = new Set<string>();
  const rows: ReviewEventSearchRow[] = [];
  for (const row of data as ReviewEventSearchRow[]) {
    if (!isPastLocalDay(row.event_date, now)) continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
    if (rows.length >= limit) break;
  }
  return rows;
}
