/**
 * Deno entry for editorial-research. Shares adapters with Vercel via
 * `../_shared/editorial-sources`. Prefer the Vercel API in production when
 * edge deploy is unavailable; keep this in sync for parity.
 */
import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import {
  DISCOVERY_EVENT_CAP,
  DISCOVERY_VENUE_CAP,
  ENRICH_SUBJECT_CAP,
  runEditorialSourcePipeline,
  type NormalizedSignal,
  type ResearchSubjectRef,
  type SourceStatus,
} from '../_shared/editorial-sources/mod.ts';
import {
  fetchSupabaseRest,
  isInDcMetro,
  jsonResponse,
  optionsResponse,
} from '../_shared/editorialRest.ts';

const LOG = '[editorial-research]';

async function requireAdmin(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anon) return null;

  const userRes = await fetch(`${supabaseUrl.replace(/\/+$/g, '')}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anon },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  const uid = user?.id as string | undefined;
  if (!uid) return null;

  const rows = (await fetchSupabaseRest(
    `users?user_id=eq.${uid}&select=account_type&limit=1`,
  )) as Array<{ account_type: string }>;
  if (rows?.[0]?.account_type !== 'admin') return null;
  return uid;
}

function eventImageUrl(row: Record<string, unknown>): string | null {
  const artists = row.artists as { image_url?: string } | null;
  const venues = row.venues as { image_url?: string } | null;
  const media = row.media_urls as string[] | null;
  return (
    (row.event_media_url as string) ||
    media?.[0] ||
    artists?.image_url ||
    venues?.image_url ||
    null
  );
}

async function loadUpcomingDcEvents() {
  const nowIso = new Date().toISOString();
  const select = [
    'id',
    'title',
    'event_date',
    'description',
    'venue_city',
    'venue_state',
    'latitude',
    'longitude',
    'event_media_url',
    'media_urls',
    'artist_id',
    'venue_id',
    'artists(id,name,image_url,genres)',
    'venues(id,name,city,state,latitude,longitude,image_url,url)',
  ].join(',');
  const rows = (await fetchSupabaseRest(
    `events?event_date=gte.${encodeURIComponent(nowIso)}&select=${select}&order=event_date.asc&limit=500`,
  )) as Array<Record<string, unknown>>;
  return (rows || [])
    .filter((e) => {
      const venues = e.venues as Record<string, unknown> | null;
      return isInDcMetro({
        venue_city: (e.venue_city as string) || (venues?.city as string),
        venue_state: (e.venue_state as string) || (venues?.state as string),
        latitude: (e.latitude as number) ?? (venues?.latitude as number),
        longitude: (e.longitude as number) ?? (venues?.longitude as number),
      });
    })
    .slice(0, DISCOVERY_EVENT_CAP)
    .map((e) => {
      const artists = e.artists as { id?: string; name?: string } | null;
      const venues = e.venues as { id?: string; name?: string; city?: string; state?: string; latitude?: number; longitude?: number; image_url?: string; url?: string } | null;
      return {
        event_id: e.id as string,
        venue_id: (e.venue_id as string) || venues?.id || null,
        artist_id: (e.artist_id as string) || artists?.id || null,
        artist_name: artists?.name || null,
        venue_name: venues?.name || null,
        event_title: e.title as string,
        name: `${artists?.name || e.title} at ${venues?.name || 'DC venue'}`,
        city: (e.venue_city as string) || venues?.city || null,
        state: (e.venue_state as string) || venues?.state || null,
        latitude: (e.latitude as number) ?? venues?.latitude ?? null,
        longitude: (e.longitude as number) ?? venues?.longitude ?? null,
        event_date: e.event_date as string,
        image_url: eventImageUrl(e),
        website: venues?.url || null,
        subject_type: 'event' as const,
      };
    });
}

async function loadDcVenues(fromEvents: Array<{ venue_id: string | null; venue_name: string | null; city: string | null; state: string | null; latitude: number | null; longitude: number | null; website: string | null }>) {
  const map = new Map<string, {
    venue_id: string | null;
    name: string;
    city: string | null;
    state: string | null;
    latitude: number | null;
    longitude: number | null;
    image_url: string | null;
    website: string | null;
    count: number;
  }>();
  for (const e of fromEvents) {
    const key = (e.venue_id || e.venue_name || '').toLowerCase();
    if (!key) continue;
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else {
      map.set(key, {
        venue_id: e.venue_id,
        name: e.venue_name || 'DC venue',
        city: e.city,
        state: e.state,
        latitude: e.latitude,
        longitude: e.longitude,
        image_url: null,
        website: e.website || null,
        count: 1,
      });
    }
  }
  try {
    const venueRows = (await fetchSupabaseRest(
      `venues?select=id,name,city,state,latitude,longitude,image_url,url,num_upcoming_events&num_upcoming_events=gt.0&order=num_upcoming_events.desc&limit=200`,
    )) as Array<Record<string, unknown>>;
    for (const v of venueRows || []) {
      if (!isInDcMetro(v as { city?: string; state?: string; latitude?: number; longitude?: number })) continue;
      const key = String(v.id).toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.image_url = existing.image_url || (v.image_url as string);
        existing.website = existing.website || (v.url as string);
        existing.count = Math.max(existing.count, (v.num_upcoming_events as number) || 0);
      } else {
        map.set(key, {
          venue_id: v.id as string,
          name: v.name as string,
          city: v.city as string,
          state: v.state as string,
          latitude: v.latitude as number,
          longitude: v.longitude as number,
          image_url: v.image_url as string,
          website: v.url as string,
          count: (v.num_upcoming_events as number) || 1,
        });
      }
    }
  } catch (err) {
    console.warn(LOG, 'venues query failed', err);
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, DISCOVERY_VENUE_CAP);
}

function toSubjectRefs(
  events: Awaited<ReturnType<typeof loadUpcomingDcEvents>>,
  venues: Awaited<ReturnType<typeof loadDcVenues>>,
): ResearchSubjectRef[] {
  return [
    ...events.map((e) => ({
      subject_type: 'event' as const,
      name: e.name,
      event_id: e.event_id,
      venue_id: e.venue_id,
      artist_id: e.artist_id,
      artist_name: e.artist_name,
      venue_name: e.venue_name,
      event_title: e.event_title,
      city: e.city,
      state: e.state,
      latitude: e.latitude,
      longitude: e.longitude,
      event_date: e.event_date,
      image_url: e.image_url,
      website: e.website,
    })),
    ...venues.map((v) => ({
      subject_type: 'venue' as const,
      name: v.name,
      event_id: null,
      venue_id: v.venue_id,
      artist_id: null,
      artist_name: null,
      venue_name: v.name,
      event_title: null,
      city: v.city,
      state: v.state,
      latitude: v.latitude,
      longitude: v.longitude,
      event_date: null,
      image_url: v.image_url,
      website: v.website,
    })),
  ];
}

async function insertSignals(subjectId: string, signals: NormalizedSignal[]) {
  if (!signals.length) return 0;
  const rows = signals.map((s) => ({
    subject_id: subjectId,
    platform: s.source,
    url: s.url,
    title: s.title,
    excerpt: s.excerpt,
    polarity: s.sentiment === 'unknown' ? 'neutral' : s.sentiment,
    fetched_at: s.fetched_at,
    canonical_url: s.canonical_url,
    content_hash: s.content_hash,
    published_at: s.published_at,
    signal_type: s.signal_type,
    confidence: s.confidence,
    subject_label: s.subject,
    sentiment: s.sentiment,
    raw: {
      source: s.source,
      canonical_url: s.canonical_url,
      content_hash: s.content_hash,
      published_at: s.published_at,
      signal_type: s.signal_type,
      sentiment: s.sentiment,
      confidence: s.confidence,
      subject: s.subject,
      ...(s.raw || {}),
    },
  }));
  try {
    await fetchSupabaseRest('editorial_source_snippets', {
      method: 'POST',
      body: JSON.stringify(rows),
    });
    return rows.length;
  } catch {
    const legacy = rows.map((r) => ({
      subject_id: r.subject_id,
      platform: ['reddit', 'news', 'web', 'synth_reviews', 'apify', 'other'].includes(r.platform)
        ? r.platform
        : 'web',
      url: r.url,
      title: r.title,
      excerpt: r.excerpt,
      polarity: r.polarity,
      fetched_at: r.fetched_at,
      raw: r.raw,
    }));
    await fetchSupabaseRest('editorial_source_snippets', {
      method: 'POST',
      body: JSON.stringify(legacy),
    });
    return legacy.length;
  }
}

async function saveSourceStatus(runId: string, source_status: SourceStatus[]) {
  try {
    await fetchSupabaseRest(`editorial_runs?id=eq.${runId}`, {
      method: 'PATCH',
      body: JSON.stringify({ source_status }),
    });
  } catch {
    /* column may not exist yet */
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const adminId = await requireAdmin(req.headers.get('Authorization'));
    if (!adminId) return jsonResponse({ error: 'Admin auth required' }, 401);
    const body = await req.json().catch(() => ({}));

    if (body.event_id || body.venue_id) {
      return await researchOneSubject(req, adminId, body);
    }

    const events = await loadUpcomingDcEvents();
    const venues = await loadDcVenues(events);
    const subjectRefs = toSubjectRefs(events, venues);

    const dmvVenues = (
      ((await fetchSupabaseRest(
        `venues?select=id,name,city,state,url,latitude,longitude&or=(state.eq.DC,state.eq.VA,state.eq.MD)&limit=200`,
      )) as Array<Record<string, unknown>>) || []
    ).filter((v) => isInDcMetro(v as { city?: string; state?: string; latitude?: number; longitude?: number }));

    const runs = (await fetchSupabaseRest('editorial_runs', {
      method: 'POST',
      body: JSON.stringify([
        {
          metro: 'washington_dc',
          status: 'researching',
          window_start: events[0]?.event_date || new Date().toISOString(),
          window_end: events[events.length - 1]?.event_date || new Date().toISOString(),
          created_by: adminId,
          source_status: {},
        },
      ]),
    })) as Array<{ id: string }>;
    const runId = runs?.[0]?.id;
    if (!runId) throw new Error('Failed to create editorial run');

    const subjects = (await fetchSupabaseRest('editorial_subjects', {
      method: 'POST',
      body: JSON.stringify(
        subjectRefs.map((s) => ({
          run_id: runId,
          subject_type: s.subject_type === 'artist' ? 'event' : s.subject_type,
          event_id: s.event_id,
          venue_id: s.venue_id,
          name: s.name,
          city: s.city,
          state: s.state,
          latitude: s.latitude,
          longitude: s.longitude,
          event_date: s.event_date,
          research_status: 'pending',
          image_url: s.image_url,
        })),
      ),
    })) as Array<{ id: string; name: string }>;

    const refsWithIds = (subjects || []).map((row, i) => ({
      ...subjectRefs[i],
      id: row.id,
    }));

    const pipeline = await runEditorialSourcePipeline({
      subjects: refsWithIds,
      dmvVenues: dmvVenues.map((v) => ({
        id: String(v.id),
        name: String(v.name),
        city: v.city as string | null,
        state: v.state as string | null,
        url: v.url as string | null,
      })),
      log: (msg, meta) => console.log(LOG, msg, meta || {}),
    });

    await saveSourceStatus(runId, pipeline.source_status);

    let snippetTotal = 0;
    const top = refsWithIds.slice(0, ENRICH_SUBJECT_CAP);
    for (const subject of subjects || []) {
      const isTop = top.some((t) => t.id === subject.id);
      const matched = pipeline.signals.filter((s) => {
        const label = (s.subject || '').toLowerCase();
        const name = (subject.name || '').toLowerCase();
        return label.includes(name.split(' ')[0]) || name.includes(label.split(' ')[0]) || label === name;
      });
      const forSubject = isTop ? matched : matched.slice(0, 3);
      snippetTotal += await insertSignals(subject.id, forSubject);

      const summary =
        forSubject.length === 0
          ? `Public chatter about ${subject.name} is light across configured sources.`
          : `Found ${forSubject.length} signals for ${subject.name} across ${[
              ...new Set(forSubject.map((s) => s.source)),
            ].join(', ')}.`;

      await fetchSupabaseRest(`editorial_subjects?id=eq.${subject.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          research_status: 'ready',
          sentiment_summary: summary,
          sentiment_json: {
            snippet_count: forSubject.length,
            enriched: isTop,
            source_status: pipeline.source_status,
            by_source: forSubject.reduce<Record<string, number>>((acc, s) => {
              acc[s.source] = (acc[s.source] || 0) + 1;
              return acc;
            }, {}),
          },
        }),
      });
    }

    await fetchSupabaseRest(`editorial_runs?id=eq.${runId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'researched',
        subject_count: subjects?.length || 0,
        source_status: pipeline.source_status,
      }),
    });

    return jsonResponse({
      data: {
        run_id: runId,
        subject_count: subjects?.length || 0,
        event_count: events.length,
        venue_count: venues.length,
        snippet_count: snippetTotal,
        discovered_count: pipeline.discovered_count,
        enriched_subject_count: pipeline.enriched_subject_count,
        source_status: pipeline.source_status,
      },
    });
  } catch (err) {
    console.error(LOG, err);
    return jsonResponse({ error: (err as Error).message || 'Research failed' }, 500);
  }
});

async function researchOneSubject(
  req: Request,
  adminId: string,
  body: { event_id?: string; venue_id?: string },
) {
  let bundle: ResearchSubjectRef;
  if (body.event_id) {
    const rows = (await fetchSupabaseRest(
      `events?id=eq.${body.event_id}&select=id,title,event_date,venue_city,venue_state,latitude,longitude,event_media_url,media_urls,artist_id,venue_id,artists(id,name,image_url),venues(id,name,city,state,latitude,longitude,image_url,url)&limit=1`,
    )) as Array<Record<string, unknown>>;
    const e = rows?.[0];
    if (!e) return jsonResponse({ error: 'Event not found' }, 404);
    const artists = e.artists as { id?: string; name?: string } | null;
    const venues = e.venues as { id?: string; name?: string; city?: string; state?: string; latitude?: number; longitude?: number; url?: string } | null;
    bundle = {
      subject_type: 'event',
      event_id: e.id as string,
      venue_id: (e.venue_id as string) || venues?.id || null,
      artist_id: (e.artist_id as string) || artists?.id || null,
      artist_name: artists?.name || null,
      venue_name: venues?.name || null,
      event_title: e.title as string,
      name: `${artists?.name || e.title} at ${venues?.name || 'DC venue'}`,
      city: (e.venue_city as string) || venues?.city || null,
      state: (e.venue_state as string) || venues?.state || null,
      latitude: (e.latitude as number) ?? venues?.latitude ?? null,
      longitude: (e.longitude as number) ?? venues?.longitude ?? null,
      event_date: e.event_date as string,
      image_url: eventImageUrl(e),
      website: venues?.url || null,
    };
  } else {
    const rows = (await fetchSupabaseRest(
      `venues?id=eq.${body.venue_id}&select=id,name,city,state,latitude,longitude,image_url,url&limit=1`,
    )) as Array<Record<string, unknown>>;
    const v = rows?.[0];
    if (!v) return jsonResponse({ error: 'Venue not found' }, 404);
    bundle = {
      subject_type: 'venue',
      event_id: null,
      venue_id: v.id as string,
      artist_id: null,
      artist_name: null,
      venue_name: v.name as string,
      event_title: null,
      name: v.name as string,
      city: v.city as string,
      state: v.state as string,
      latitude: v.latitude as number,
      longitude: v.longitude as number,
      event_date: null,
      image_url: v.image_url as string,
      website: v.url as string,
    };
  }

  const dmvVenues = (
    ((await fetchSupabaseRest(
      `venues?select=id,name,city,state,url,latitude,longitude&or=(state.eq.DC,state.eq.VA,state.eq.MD)&limit=200`,
    )) as Array<Record<string, unknown>>) || []
  ).filter((v) => isInDcMetro(v as { city?: string; state?: string; latitude?: number; longitude?: number }));

  const runs = (await fetchSupabaseRest('editorial_runs', {
    method: 'POST',
    body: JSON.stringify([
      {
        metro: 'washington_dc',
        status: 'researching',
        window_start: bundle.event_date || new Date().toISOString(),
        window_end: bundle.event_date || new Date().toISOString(),
        created_by: adminId,
      },
    ]),
  })) as Array<{ id: string }>;
  const runId = runs?.[0]?.id;
  if (!runId) throw new Error('Failed to create editorial run');

  const subjects = (await fetchSupabaseRest('editorial_subjects', {
    method: 'POST',
    body: JSON.stringify([
      {
        run_id: runId,
        subject_type: bundle.subject_type,
        event_id: bundle.event_id,
        venue_id: bundle.venue_id,
        name: bundle.name,
        city: bundle.city,
        state: bundle.state,
        latitude: bundle.latitude,
        longitude: bundle.longitude,
        event_date: bundle.event_date,
        research_status: 'researching',
        image_url: bundle.image_url,
      },
    ]),
  })) as Array<{ id: string }>;
  const subject = subjects?.[0];
  if (!subject?.id) throw new Error('Failed to create editorial subject');

  const pipeline = await runEditorialSourcePipeline({
    subjects: [{ ...bundle, id: subject.id }],
    dmvVenues: dmvVenues.map((v) => ({
      id: String(v.id),
      name: String(v.name),
      city: v.city as string | null,
      state: v.state as string | null,
      url: v.url as string | null,
    })),
  });

  await saveSourceStatus(runId, pipeline.source_status);
  const written = await insertSignals(subject.id, pipeline.signals);

  const summary =
    pipeline.signals.length === 0
      ? `Public chatter about ${bundle.name} is light across configured sources.`
      : `Found ${pipeline.signals.length} signals for ${bundle.name} across ${[
          ...new Set(pipeline.signals.map((s) => s.source)),
        ].join(', ')}.`;

  await fetchSupabaseRest(`editorial_subjects?id=eq.${subject.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      research_status: 'ready',
      sentiment_summary: summary,
      sentiment_json: {
        facets: {
          artist: bundle.artist_name,
          venue: bundle.venue_name,
          event: bundle.event_title,
        },
        snippet_count: written,
        source_status: pipeline.source_status,
        artist_id: bundle.artist_id,
        venue_id: bundle.venue_id,
        event_id: bundle.event_id,
      },
    }),
  });

  await fetchSupabaseRest(`editorial_runs?id=eq.${runId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'researched',
      subject_count: 1,
      source_status: pipeline.source_status,
    }),
  });

  return jsonResponse({
    data: {
      run_id: runId,
      subject_id: subject.id,
      name: bundle.name,
      facets: {
        artist: bundle.artist_name,
        venue: bundle.venue_name,
        event: bundle.event_title,
      },
      snippet_count: written,
      sentiment_summary: summary,
      source_status: pipeline.source_status,
      discovered_count: pipeline.discovered_count,
      enriched_subject_count: pipeline.enriched_subject_count,
    },
  });
}
