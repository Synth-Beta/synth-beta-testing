/** Shared types for DC editorial source adapters. */

export type SignalType =
  | 'listing'
  | 'review'
  | 'news'
  | 'social'
  | 'setlist'
  | 'place'
  | 'profile'
  | 'calendar'
  | 'website'
  | 'other';

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'mixed' | 'unknown';

export type AdapterKind = 'api' | 'rss' | 'jsonld' | 'html';

export interface NormalizedSignal {
  source: string;
  url: string | null;
  canonical_url: string | null;
  title: string | null;
  excerpt: string;
  published_at: string | null;
  fetched_at: string;
  subject: string;
  signal_type: SignalType;
  sentiment: Sentiment;
  confidence: number;
  content_hash: string;
  raw?: Record<string, unknown>;
}

export interface SourceStatus {
  source: string;
  name: string;
  kind: AdapterKind;
  status: 'ok' | 'skipped' | 'error' | 'empty' | 'disabled';
  result_count: number;
  duration_ms: number;
  error?: string;
  env_missing?: string[];
}

export interface ResearchSubjectRef {
  id?: string;
  subject_type: 'event' | 'venue' | 'artist';
  name: string;
  event_id?: string | null;
  venue_id?: string | null;
  artist_id?: string | null;
  artist_name?: string | null;
  venue_name?: string | null;
  event_title?: string | null;
  city?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  event_date?: string | null;
  image_url?: string | null;
  website?: string | null;
}

export interface DiscoveryContext {
  metro: string;
  nowIso: string;
  getEnv: (key: string) => string | undefined;
  fetchJson: <T = unknown>(url: string, init?: RequestInit) => Promise<T>;
  fetchText: (url: string, init?: RequestInit) => Promise<string>;
  cacheGet: <T>(key: string) => T | undefined;
  cacheSet: <T>(key: string, value: T, ttlMs?: number) => void;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface EnrichContext extends DiscoveryContext {
  subject: ResearchSubjectRef;
  discovered: NormalizedSignal[];
}

export interface SourceAdapter {
  id: string;
  name: string;
  kind: AdapterKind;
  /** Env keys required for full functionality. Adapter soft-skips when missing. */
  requiresEnv?: string[];
  /** Run once per research invocation (listings, feeds, venue sites). */
  discover?: (ctx: DiscoveryContext) => Promise<NormalizedSignal[]>;
  /** Run only for top enriched subjects. */
  enrich?: (ctx: EnrichContext) => Promise<NormalizedSignal[]>;
}

export interface PipelineResult {
  signals: NormalizedSignal[];
  source_status: SourceStatus[];
  discovered_count: number;
  enriched_subject_count: number;
}
