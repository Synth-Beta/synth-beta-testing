import { supabase } from '@/integrations/supabase/client';
import type {
  CalendarPlatform,
  CalendarPostStatus,
  ContentCalendarPost,
  EditorialRun,
  EditorialSnippet,
  GenerateResult,
} from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const DC_CENTER = { lat: 38.9072, lng: -77.0369 };
const DC_RADIUS_MILES = 50;
/** Approx 50-mile bounding box used to query Postgres before haversine refine. */
const DC_BBOX = {
  latMin: 38.18,
  latMax: 39.63,
  lngMin: -77.96,
  lngMax: -76.11,
};
const DC_CITIES = new Set([
  'washington dc',
  'washington',
  'washington, dc',
  'washington, d.c.',
  'washington d.c.',
  'district of columbia',
]);

function normalizeCity(city: string | null | undefined) {
  return (city ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isDcCity(city: string | null | undefined, state: string | null | undefined) {
  const st = (state ?? '').trim().toUpperCase();
  if (st === 'DC') return true;
  return DC_CITIES.has(normalizeCity(city));
}

function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function isInDcMetro(row: {
  venue_city?: string | null;
  venue_state?: string | null;
  city?: string | null;
  state?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
}) {
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  // Lat/long is the source of truth for DMV radius.
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return milesBetween(DC_CENTER.lat, DC_CENTER.lng, lat, lng) <= DC_RADIUS_MILES;
  }
  // Fallback only when coords are missing: DC proper, not all of MD/VA.
  const city = row.venue_city ?? row.city;
  const state = row.venue_state ?? row.state;
  return isDcCity(city, state);
}

export type DcStreamEvent = {
  id: string;
  title: string;
  event_date: string;
  venue_city: string | null;
  venue_state: string | null;
  latitude: number | null;
  longitude: number | null;
  event_media_url: string | null;
  artist_id: string | null;
  venue_id: string | null;
  artists: { id: string; name: string; image_url: string | null } | null;
  venues: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    latitude?: number | null;
    longitude?: number | null;
    image_url: string | null;
  } | null;
};

export type DcStreamVenue = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  num_upcoming_events: number | null;
};

export async function listDcUpcomingEvents(limit = 250): Promise<DcStreamEvent[]> {
  const nowIso = new Date().toISOString();
  // Filter on events lat/lng (denormalized from venues). Avoids PostgREST
  // `venues!inner` + `venues.latitude` filters, which intermittently 500.
  const { data, error } = await db
    .from('events')
    .select(
      'id,title,event_date,venue_city,venue_state,latitude,longitude,event_media_url,artist_id,venue_id,artists(id,name,image_url),venues(id,name,city,state,latitude,longitude,image_url)',
    )
    .gte('event_date', nowIso)
    .gte('latitude', DC_BBOX.latMin)
    .lte('latitude', DC_BBOX.latMax)
    .gte('longitude', DC_BBOX.lngMin)
    .lte('longitude', DC_BBOX.lngMax)
    .order('event_date', { ascending: true })
    .limit(Math.max(limit * 3, 500));

  if (error) {
    // Fallback: venue bbox → event ids (still no embed column filters).
    const { data: metroVenues, error: venueErr } = await db
      .from('venues')
      .select('id')
      .gte('latitude', DC_BBOX.latMin)
      .lte('latitude', DC_BBOX.latMax)
      .gte('longitude', DC_BBOX.lngMin)
      .lte('longitude', DC_BBOX.lngMax)
      .limit(1000);
    if (venueErr) throw new Error(venueErr.message);
    const venueIds = ((metroVenues ?? []) as { id: string }[]).map((v) => v.id);
    if (venueIds.length === 0) return [];

    const { data: byVenue, error: byVenueErr } = await db
      .from('events')
      .select(
        'id,title,event_date,venue_city,venue_state,latitude,longitude,event_media_url,artist_id,venue_id,artists(id,name,image_url),venues(id,name,city,state,latitude,longitude,image_url)',
      )
      .gte('event_date', nowIso)
      .in('venue_id', venueIds)
      .order('event_date', { ascending: true })
      .limit(Math.max(limit * 3, 500));
    if (byVenueErr) throw new Error(byVenueErr.message);
    return ((byVenue ?? []) as DcStreamEvent[])
      .filter((e) =>
        isInDcMetro({
          venue_city: e.venue_city || e.venues?.city,
          venue_state: e.venue_state || e.venues?.state,
          latitude: e.latitude ?? e.venues?.latitude,
          longitude: e.longitude ?? e.venues?.longitude,
        }),
      )
      .slice(0, limit);
  }

  return ((data ?? []) as DcStreamEvent[])
    .filter((e) =>
      isInDcMetro({
        venue_city: e.venue_city || e.venues?.city,
        venue_state: e.venue_state || e.venues?.state,
        latitude: e.latitude ?? e.venues?.latitude,
        longitude: e.longitude ?? e.venues?.longitude,
      }),
    )
    .slice(0, limit);
}

export async function listDcVenues(limit = 300): Promise<DcStreamVenue[]> {
  // Query DMV by lat/long bbox. Ordering national venues by upcoming and taking
  // the first 800 missed almost the entire metro (only ~9 DC rooms happened to rank high).
  const { data, error } = await db
    .from('venues')
    .select('id,name,city,state,latitude,longitude,image_url,num_upcoming_events')
    .gte('latitude', DC_BBOX.latMin)
    .lte('latitude', DC_BBOX.latMax)
    .gte('longitude', DC_BBOX.lngMin)
    .lte('longitude', DC_BBOX.lngMax)
    .order('num_upcoming_events', { ascending: false, nullsFirst: false })
    .limit(1000);
  if (error) throw new Error(error.message);

  const byId = new Map<string, DcStreamVenue>();
  for (const v of (data ?? []) as DcStreamVenue[]) {
    if (isInDcMetro(v)) byId.set(v.id, v);
  }

  const { data: labeled, error: labeledErr } = await db
    .from('venues')
    .select('id,name,city,state,latitude,longitude,image_url,num_upcoming_events')
    .or(
      'state.eq.DC,state.ilike.District of Columbia,city.ilike.Washington%,city.eq.Washington DC',
    )
    .limit(500);
  if (!labeledErr) {
    for (const v of (labeled ?? []) as DcStreamVenue[]) {
      if (!byId.has(v.id) && isInDcMetro(v)) byId.set(v.id, v);
    }
  }

  return [...byId.values()]
    .sort(
      (a, b) =>
        (b.num_upcoming_events || 0) - (a.num_upcoming_events || 0) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

export async function listEditorialRuns(limit = 10): Promise<EditorialRun[]> {
  const { data, error } = await db
    .from('editorial_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listCalendarPosts(filters?: {
  status?: string;
  platform?: string;
  subjectId?: string;
}): Promise<ContentCalendarPost[]> {
  let q = db
    .from('content_calendar_posts')
    .select('*, editorial_subjects(id, name, sentiment_summary, subject_type)')
    .order('scheduled_at', { ascending: true, nullsFirst: false });

  if (filters?.status && filters.status !== 'all') q = q.eq('status', filters.status);
  if (filters?.platform && filters.platform !== 'all') q = q.eq('platform', filters.platform);
  if (filters?.subjectId) q = q.eq('subject_id', filters.subjectId);

  const { data, error } = await q.limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listSnippetsForSubject(subjectId: string): Promise<EditorialSnippet[]> {
  const { data, error } = await db
    .from('editorial_source_snippets')
    .select('*')
    .eq('subject_id', subjectId)
    .order('fetched_at', { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function findLatestSavedResearch(input: {
  event_id?: string;
  venue_id?: string;
}): Promise<{
  subject: {
    id: string;
    run_id: string;
    name: string;
    subject_type: string;
    sentiment_summary: string | null;
    sentiment_json: Record<string, unknown> | null;
    research_status: string;
    event_id: string | null;
    venue_id: string | null;
  };
  snippets: EditorialSnippet[];
  posts: ContentCalendarPost[];
} | null> {
  if (!input.event_id && !input.venue_id) return null;

  let q = db
    .from('editorial_subjects')
    .select(
      'id,run_id,name,subject_type,sentiment_summary,sentiment_json,research_status,event_id,venue_id,created_at',
    )
    .order('created_at', { ascending: false })
    .limit(8);

  if (input.event_id) q = q.eq('event_id', input.event_id);
  else q = q.eq('venue_id', input.venue_id!);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    id: string;
    run_id: string;
    name: string;
    subject_type: string;
    sentiment_summary: string | null;
    sentiment_json: Record<string, unknown> | null;
    research_status: string;
    event_id: string | null;
    venue_id: string | null;
  }>;
  if (!rows.length) return null;

  const subject =
    rows.find((r) => r.research_status === 'ready') ||
    rows.find((r) => r.sentiment_summary) ||
    rows[0];

  const [snippets, posts] = await Promise.all([
    listSnippetsForSubject(subject.id),
    listCalendarPosts({ subjectId: subject.id }),
  ]);

  return { subject, snippets, posts };
}

export async function createManualCalendarPost(input: {
  platform: CalendarPlatform;
  title?: string | null;
  body?: string;
  scheduled_at: string;
  subject_id?: string | null;
  run_id?: string | null;
  target_forum?: string | null;
  hashtags?: string[];
  created_by?: string | null;
  status?: CalendarPostStatus;
}): Promise<ContentCalendarPost> {
  const { data, error } = await db
    .from('content_calendar_posts')
    .insert({
      platform: input.platform,
      format: input.platform === 'substack' || input.platform === 'reddit' ? 'long' : 'short',
      status: input.status || 'draft',
      title: input.title ?? 'Untitled draft',
      body: input.body ?? '',
      hashtags: input.hashtags ?? [],
      media_urls: [],
      target_forum: input.target_forum ?? (input.platform === 'reddit' ? 'r/washingtondc' : null),
      scheduled_at: input.scheduled_at,
      subject_id: input.subject_id ?? null,
      run_id: input.run_id ?? null,
      created_by: input.created_by ?? null,
      editorial_meta: { manual: true },
    })
    .select('*, editorial_subjects(id, name, sentiment_summary, subject_type)')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteCalendarPost(id: string): Promise<void> {
  const { error } = await db.from('content_calendar_posts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function moveCalendarPost(id: string, scheduledAt: string): Promise<ContentCalendarPost> {
  return updateCalendarPost(id, { scheduled_at: scheduledAt });
}


export async function updateCalendarPost(
  id: string,
  patch: Partial<ContentCalendarPost>,
): Promise<ContentCalendarPost> {
  const { data, error } = await db
    .from('content_calendar_posts')
    .update(patch)
    .eq('id', id)
    .select('*, editorial_subjects(id, name, sentiment_summary, subject_type)')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function approvePost(id: string, userId: string): Promise<ContentCalendarPost> {
  const { data: existing, error: loadErr } = await db
    .from('content_calendar_posts')
    .select('id,body,title,status')
    .eq('id', id)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  assertBodyPublishable(existing?.body || '', existing?.title);
  return updateCalendarPost(id, {
    status: 'scheduled',
    approved_by: userId,
  } as Partial<ContentCalendarPost>);
}

function assertBodyPublishable(body: string, title?: string | null) {
  const text = `${title || ''}\n${body || ''}`;
  const blocked = [
    /editor score\s*:/i,
    /status remains pending_review/i,
    /sentiment analysis shows/i,
    /\b\d+\s+positive\s+signals?\b/i,
    /\{[\s\S]*"(revised_body|scorecard|hard_failures)"[\s\S]*\}/,
    /key destination for live music enthusiasts/i,
    /as venues evolve, they play a crucial role/i,
  ];
  const hit = blocked.find((re) => re.test(text));
  if (hit) {
    throw new Error(
      'Cannot approve: body still contains editorial metadata, internal research language, or banned filler. Fix the final body first.',
    );
  }
}

export async function rejectPost(id: string): Promise<ContentCalendarPost> {
  return updateCalendarPost(id, { status: 'rejected' });
}

export async function markPublishedManually(id: string): Promise<ContentCalendarPost> {
  const { data: existing, error: loadErr } = await db
    .from('content_calendar_posts')
    .select('id,body,title')
    .eq('id', id)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  assertBodyPublishable(existing?.body || '', existing?.title);
  return updateCalendarPost(id, {
    status: 'published',
    published_at: new Date().toISOString(),
  });
}

export type ResearchBrief = {
  summary: string;
  highlights: string[];
  article_topics: string[];
  interesting_snippets: Array<{
    title: string | null;
    excerpt: string;
    url: string | null;
    source: string;
  }>;
  related_events: Array<{
    id: string;
    title: string;
    event_date: string | null;
    artist_name: string | null;
  }>;
  caveats: string[];
  editor_prompt: string;
};

export type SubjectResearchResult = {
  run_id: string;
  subject_id: string;
  name: string;
  facets: { artist: string | null; venue: string | null; event: string | null };
  snippet_count: number;
  sentiment_summary: string;
  research_brief?: ResearchBrief;
  related_events?: ResearchBrief['related_events'];
  source_status?: Array<{
    source: string;
    name: string;
    kind: string;
    status: string;
    result_count: number;
    duration_ms: number;
    error?: string;
    env_missing?: string[];
  }>;
  discovered_count?: number;
  enriched_subject_count?: number;
};

export async function researchSubject(input: {
  event_id?: string;
  venue_id?: string;
}): Promise<SubjectResearchResult> {
  return invokeEditorialApi<SubjectResearchResult>('editorial-research', input);
}

export async function generateDraftsForSubject(
  subjectId: string,
  opts?: {
    platforms?: Array<'instagram' | 'linkedin' | 'substack' | 'reddit'>;
    editorGuidance?: string;
    selectedTopics?: string[];
  },
): Promise<GenerateResult> {
  return invokeEditorialApi<GenerateResult>('editorial-generate', {
    subject_id: subjectId,
    platforms: opts?.platforms,
    editor_guidance: opts?.editorGuidance,
    selected_topics: opts?.selectedTopics,
  });
}

export async function publishPostNow(postId: string, opts?: { dryRun?: boolean; force?: boolean }) {
  return invokeEditorialApi('content-calendar-publish', {
    mode: 'single',
    post_id: postId,
    dry_run: opts?.dryRun ?? false,
    force: opts?.force ?? true,
  });
}

export async function dispatchDuePosts(opts?: { dryRun?: boolean }) {
  return invokeEditorialApi('content-calendar-publish', {
    mode: 'due',
    dry_run: opts?.dryRun ?? false,
  });
}

const EDITORIAL_API_BASE =
  import.meta.env.VITE_EDITORIAL_API_URL || 'https://synth-editorial-api-nine.vercel.app';

/** Notify Slack #alerts when admin editorial calls fail (including hard 504s). */
async function notifyEditorialFailure(opts: {
  path: string;
  status: number;
  error: string;
  subjectId?: string;
}): Promise<void> {
  // Local Vite has no /api/ops-alert — only getsynth.app / Vercel does.
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return;
  }

  const isTimeout = opts.status === 504 || /timeout|timed out|deadline/i.test(opts.error);
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return;

  try {
    // Same-origin on getsynth.app — posts into Slack #alerts.
    await fetch('/api/ops-alert', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        area: 'admin-editorial',
        severity: opts.status === 422 ? 'warning' : 'down',
        status: opts.status,
        subject_id: opts.subjectId || null,
        fail_log: `getsynth.app/admin ${opts.path} → ${opts.status}: ${opts.error}`.slice(0, 800),
        link: 'https://getsynth.app/admin',
        next_step: isTimeout
          ? 'Retry one platform (avoid Substack first). Check OpenAI latency if it keeps 504ing.'
          : opts.status === 422
            ? 'Check claim ledger / sources, add editor guidance, or re-run research.'
            : 'Inspect generate/research failure details in admin toast and function logs.',
      }),
    });
  } catch (err) {
    console.warn('[contentCalendar] ops-alert post failed', err);
  }
}

async function invokeEditorialApi<T = unknown>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Not signed in');

  let res: Response;
  try {
    res = await fetch(`${EDITORIAL_API_BASE}/api/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    await notifyEditorialFailure({
      path,
      status: 0,
      error: message,
      subjectId: typeof body.subject_id === 'string' ? body.subject_id : undefined,
    });
    throw err instanceof Error ? err : new Error(message);
  }

  const payload = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) {
    const message =
      (typeof payload?.error === 'string' && payload.error) || `Editorial API ${res.status}`;
    await notifyEditorialFailure({
      path,
      status: res.status,
      error: message,
      subjectId: typeof body.subject_id === 'string' ? body.subject_id : undefined,
    });
    throw new Error(message);
  }
  if (payload?.error) throw new Error(String(payload.error));
  return payload.data as T;
}
