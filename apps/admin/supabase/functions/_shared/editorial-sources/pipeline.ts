import { discoverVenueWebsites } from './adapters/index';
import { dedupeSignals } from './normalize';
import { SOURCE_REGISTRY } from './registry';
import { MemoryCache, RateLimiter, createFetchHelpers, withTimeout } from './runtime';
import type {
  DiscoveryContext,
  NormalizedSignal,
  PipelineResult,
  ResearchSubjectRef,
  SourceAdapter,
  SourceStatus,
} from './types';

export const DISCOVERY_EVENT_CAP = 8;
export const DISCOVERY_VENUE_CAP = 5;
export const ENRICH_SUBJECT_CAP = 5;

/** Full batch runs can afford longer waits; single-subject UI cannot (Vercel 504). */
const ADAPTER_TIMEOUT_FULL_MS = 12_000;
const ADAPTER_TIMEOUT_FAST_MS = 3_500;

/** High-signal adapters for click-to-research (skip slow/unrelated HTML crawls). */
const FAST_ADAPTER_IDS = new Set([
  'ticketmaster',
  'jambase',
  'imp',
  'reddit',
  'setlistfm',
  'musicbrainz',
  'capitalbop',
  'dc_music_review',
  'washington_org',
  'venue_website_discovery',
]);

export interface PipelineInput {
  subjects: ResearchSubjectRef[];
  dmvVenues?: Array<{ id: string; name: string; city?: string | null; state?: string | null; url?: string | null }>;
  getEnv?: (key: string) => string | undefined;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
  /** `fast` = single-subject UI path (avoid gateway timeouts). */
  mode?: 'fast' | 'full';
}

function adaptersForMode(mode: 'fast' | 'full'): SourceAdapter[] {
  if (mode === 'full') return SOURCE_REGISTRY;
  return SOURCE_REGISTRY.filter((a) => FAST_ADAPTER_IDS.has(a.id));
}

function venueMatchedAdapters(subject: ResearchSubjectRef, adapters: SourceAdapter[]): SourceAdapter[] {
  const hay = `${subject.venue_name || ''} ${subject.name || ''}`.toLowerCase();
  return adapters.filter((a) => {
    if (!['imp', 'union_stage', 'black_cat', 'songbyrd', 'the_wharf'].includes(a.id)) return true;
    const needle = a.name.toLowerCase().split(/[/\s]/)[0];
    if (a.id === 'imp') return /9:?30|imp/.test(hay);
    return hay.includes(needle) || hay.includes(a.id.replace(/_/g, ' '));
  });
}

async function runAdapter(
  adapter: SourceAdapter,
  mode: 'discover' | 'enrich',
  ctx: DiscoveryContext,
  timeoutMs: number,
  enrichSubject?: ResearchSubjectRef,
  discovered: NormalizedSignal[] = [],
): Promise<{ signals: NormalizedSignal[]; status: SourceStatus }> {
  const started = Date.now();

  if (
    (adapter.id === 'ticketmaster' && !ctx.getEnv('TICKETMASTER_API_KEY')) ||
    (adapter.id === 'google_places' && !ctx.getEnv('GOOGLE_PLACES_API_KEY')) ||
    (adapter.id === 'yelp' && !ctx.getEnv('YELP_API_KEY'))
  ) {
    return {
      signals: [],
      status: {
        source: adapter.id,
        name: adapter.name,
        kind: adapter.kind,
        status: 'disabled',
        result_count: 0,
        duration_ms: 0,
        env_missing: adapter.requiresEnv,
      },
    };
  }

  try {
    const fn =
      mode === 'discover'
        ? adapter.discover?.(ctx)
        : adapter.enrich?.({ ...ctx, subject: enrichSubject!, discovered });
    if (!fn) {
      return {
        signals: [],
        status: {
          source: adapter.id,
          name: adapter.name,
          kind: adapter.kind,
          status: 'skipped',
          result_count: 0,
          duration_ms: Date.now() - started,
        },
      };
    }
    const signals = await withTimeout(fn, timeoutMs, adapter.id);
    return {
      signals: signals || [],
      status: {
        source: adapter.id,
        name: adapter.name,
        kind: adapter.kind,
        status: (signals || []).length ? 'ok' : 'empty',
        result_count: (signals || []).length,
        duration_ms: Date.now() - started,
      },
    };
  } catch (err) {
    return {
      signals: [],
      status: {
        source: adapter.id,
        name: adapter.name,
        kind: adapter.kind,
        status: 'error',
        result_count: 0,
        duration_ms: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

function mergeStatus(source_status: SourceStatus[], next: SourceStatus) {
  const existing = source_status.find((s) => s.source === next.source);
  if (!existing) {
    source_status.push(next);
    return;
  }
  existing.result_count += next.result_count;
  existing.duration_ms += next.duration_ms;
  if (next.status === 'error' && existing.status !== 'error') {
    existing.status = 'error';
    existing.error = next.error;
  } else if (existing.status === 'empty' && next.result_count > 0) {
    existing.status = 'ok';
  } else if (existing.status === 'skipped' && next.status !== 'skipped') {
    existing.status = next.status;
  }
}

export async function runEditorialSourcePipeline(input: PipelineInput): Promise<PipelineResult> {
  // Default full research — fast mode only when callers opt in explicitly.
  const mode = input.mode || 'full';
  const timeoutMs = mode === 'fast' ? ADAPTER_TIMEOUT_FAST_MS : ADAPTER_TIMEOUT_FULL_MS;
  const fetchTimeout = mode === 'fast' ? 3500 : 7000;

  const cache = new MemoryCache();
  const limiter = new RateLimiter(mode === 'fast' ? 12 : 8, 1000);
  const helpers = createFetchHelpers(limiter, cache, fetchTimeout);
  const getEnv = input.getEnv || helpers.getEnv;

  const ctx: DiscoveryContext = {
    metro: 'washington_dc',
    nowIso: new Date().toISOString(),
    getEnv,
    fetchJson: helpers.fetchJson,
    fetchText: helpers.fetchText,
    cacheGet: helpers.cacheGet,
    cacheSet: helpers.cacheSet,
    log: input.log,
  };

  const registry = adaptersForMode(mode);
  const source_status: SourceStatus[] = [];
  const discovered: NormalizedSignal[] = [];

  // Fast path: skip broad metro discovery (biggest timeout risk). Enrich-only + subject venue site.
  if (mode === 'full') {
    const discoverResults = await Promise.allSettled(
      registry.map((adapter) => runAdapter(adapter, 'discover', ctx, timeoutMs)),
    );
    for (const r of discoverResults) {
      if (r.status === 'fulfilled') {
        discovered.push(...r.value.signals);
        source_status.push(r.value.status);
      }
    }
  }

  const venuesForDiscovery =
    mode === 'fast'
      ? (input.dmvVenues || []).slice(0, 3)
      : input.dmvVenues || [];

  if (venuesForDiscovery.length) {
    const started = Date.now();
    try {
      const venueSignals = await withTimeout(
        discoverVenueWebsites(ctx, venuesForDiscovery),
        timeoutMs,
        'venue_website_discovery',
      );
      discovered.push(...venueSignals);
      mergeStatus(source_status, {
        source: 'venue_website_discovery',
        name: 'DMV venue websites',
        kind: 'html',
        status: venueSignals.length ? 'ok' : 'empty',
        result_count: venueSignals.length,
        duration_ms: Date.now() - started,
      });
    } catch (err) {
      mergeStatus(source_status, {
        source: 'venue_website_discovery',
        name: 'DMV venue websites',
        kind: 'html',
        status: 'error',
        result_count: 0,
        duration_ms: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const websiteByVenue = new Map<string, string>();
  for (const s of discovered) {
    if (s.source === 'venue_website_discovery' && s.url) {
      websiteByVenue.set(s.subject.toLowerCase(), s.url);
    }
  }
  for (const sub of input.subjects) {
    if (!sub.website && sub.venue_name) {
      sub.website = websiteByVenue.get(sub.venue_name.toLowerCase()) || sub.website;
    }
    if (!sub.website) {
      sub.website = websiteByVenue.get(sub.name.toLowerCase()) || undefined;
    }
  }

  const topSubjects = input.subjects.slice(0, mode === 'fast' ? 1 : ENRICH_SUBJECT_CAP);
  const enriched: NormalizedSignal[] = [];

  for (const subject of topSubjects) {
    const adapters = mode === 'fast' ? venueMatchedAdapters(subject, registry) : registry;
    const enrichResults = await Promise.allSettled(
      adapters.map((adapter) => runAdapter(adapter, 'enrich', ctx, timeoutMs, subject, discovered)),
    );
    for (const r of enrichResults) {
      if (r.status !== 'fulfilled') continue;
      enriched.push(...r.value.signals);
      mergeStatus(source_status, r.value.status);
    }
  }

  // Mark skipped adapters so admin still sees full status board
  if (mode === 'fast') {
    for (const adapter of SOURCE_REGISTRY) {
      if (!source_status.some((s) => s.source === adapter.id)) {
        source_status.push({
          source: adapter.id,
          name: adapter.name,
          kind: adapter.kind,
          status: 'skipped',
          result_count: 0,
          duration_ms: 0,
          error: 'Skipped in fast research mode',
        });
      }
    }
  }

  const signals = dedupeSignals([...discovered, ...enriched]);
  input.log?.('pipeline done', {
    mode,
    discovered: discovered.length,
    enriched: enriched.length,
    unique: signals.length,
  });

  return {
    signals,
    source_status,
    discovered_count: discovered.length,
    enriched_subject_count: topSubjects.length,
  };
}

export { DISCOVERY_EVENT_CAP as EVENT_CAP, DISCOVERY_VENUE_CAP as VENUE_CAP };
