export type EditorialRunStatus =
  | 'pending'
  | 'researching'
  | 'researched'
  | 'generating'
  | 'completed'
  | 'failed';

export type CalendarPlatform = 'instagram' | 'linkedin' | 'substack' | 'reddit' | 'x';

export type CalendarPostStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'rejected';

export interface EditorialRun {
  id: string;
  metro: string;
  status: EditorialRunStatus;
  window_start: string | null;
  window_end: string | null;
  subject_count: number;
  post_count: number;
  error: string | null;
  created_at: string;
  source_status?: SourceStatusRow[] | Record<string, unknown> | null;
}

export interface SourceStatusRow {
  source: string;
  name: string;
  kind: string;
  status: 'ok' | 'skipped' | 'error' | 'empty' | 'disabled';
  result_count: number;
  duration_ms: number;
  error?: string;
  env_missing?: string[];
}

export interface EditorialSubject {
  id: string;
  run_id: string;
  subject_type: 'venue' | 'event';
  name: string;
  city: string | null;
  sentiment_summary: string | null;
  research_status: string;
  event_date: string | null;
}

export interface EditorialSnippet {
  id: string;
  subject_id: string;
  platform: string;
  url: string | null;
  title: string | null;
  excerpt: string;
  polarity: string | null;
  canonical_url?: string | null;
  content_hash?: string | null;
  published_at?: string | null;
  signal_type?: string | null;
  confidence?: number | null;
  sentiment?: string | null;
}

export interface ContentCalendarPost {
  id: string;
  run_id: string | null;
  subject_id: string | null;
  platform: CalendarPlatform;
  format: 'short' | 'long' | 'thread';
  status: CalendarPostStatus;
  title: string | null;
  body: string;
  hashtags: string[] | null;
  media_urls: string[] | null;
  target_forum: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  external_post_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  approved_by?: string | null;
  editorial_meta?: EditorialPostMeta | null;
  editorial_subjects?: Pick<EditorialSubject, 'id' | 'name' | 'sentiment_summary' | 'subject_type'> | null;
}

export interface EditorialPostMeta {
  claims_used?: string[];
  source_urls?: string[];
  editor_notes?: string[];
  risk_flags?: string[];
  alt_text?: string | null;
  cta?: string | null;
  score?: number;
  score_breakdown?: Record<string, number>;
  score_verdict?: string;
  lint_hard_fails?: string[];
  lint_soft_warnings?: string[];
  claim_ledger_snapshot?: Array<{
    id: string;
    claim: string;
    source_url: string | null;
    public_use: boolean;
  }>;
  revision_history?: Array<{
    round: string;
    label: string;
    body: string;
    title?: string | null;
    editor_notes: string[];
    scorecard: Record<string, number | string>;
    hard_failures: string[];
    changed: boolean;
    approved_unchanged_reason?: string | null;
  }>;
  initial_body?: string | null;
  publication_failures?: string[];
  revision_rounds_completed?: number;
}

export interface ResearchResult {
  run_id: string;
  subject_count: number;
  event_count: number;
  venue_count: number;
  snippet_count: number;
}

export interface GenerateResult {
  run_id: string;
  posts_created: number;
  subjects_processed: number;
  warnings?: string[];
}
