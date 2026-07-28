/** Types for research → claim ledger → platform drafts (training guide v1). */

export type Platform = 'instagram' | 'linkedin' | 'substack' | 'reddit';

export type ClaimType =
  | 'historical_fact'
  | 'current_fact'
  | 'listing'
  | 'observation'
  | 'sentiment_theme'
  | 'inference'
  | 'other';

export interface ClaimLedgerEntry {
  id: string;
  claim: string;
  claim_type: ClaimType;
  source_name: string;
  source_url: string | null;
  source_tier: 1 | 2 | 3 | 4 | 5 | 6;
  published_at: string | null;
  fetched_at: string;
  excerpt: string;
  is_first_party: boolean;
  is_promotional: boolean;
  freshness: 'evergreen' | 'time_bound' | 'check_before_publish' | 'unknown';
  confidence: number;
  corroborated_by: string[];
  public_use: boolean;
  public_use_reason?: string;
  allowed_uses: Platform[];
}

export interface SentimentMethodRecord {
  query?: string;
  window_start?: string | null;
  window_end?: string | null;
  sources?: string[];
  raw_mentions?: number;
  unique_mentions?: number;
  positive?: number;
  neutral?: number;
  negative?: number;
  excluded_first_party_posts?: number;
  excluded_duplicates?: number;
  classification_method?: string;
  top_positive_themes?: string[];
  top_negative_themes?: string[];
  limitations?: string[];
  complete: boolean;
}

export interface ForumRulesRecord {
  target_forum: string;
  rules_checked_at: string;
  self_promotion_allowed: boolean;
  link_allowed: boolean;
  required_flair?: string | null;
  account_disclosure_required: boolean;
  editor_must_reverify: boolean;
}

export interface PlatformDraft {
  platform: Platform;
  title: string | null;
  body: string;
  hashtags: string[];
  target_forum: string | null;
  cta: string | null;
  alt_text: string | null;
  claims_used: string[];
  source_urls: string[];
  editor_notes: string[];
  risk_flags: string[];
  format: 'short' | 'long';
}

export interface LintResult {
  hard_fails: string[];
  soft_warnings: string[];
  passed: boolean;
}

export interface RubricScore {
  total: number;
  breakdown: {
    accuracy: number;
    specificity: number;
    editorial_angle: number;
    platform_fit: number;
    reader_value: number;
    voice: number;
    sourcing: number;
    cta: number;
  };
  verdict: 'publishable' | 'light_edit' | 'structural_rewrite' | 'reject';
}

export interface EditorialMeta {
  claims_used: string[];
  source_urls: string[];
  editor_notes: string[];
  risk_flags: string[];
  alt_text?: string | null;
  cta?: string | null;
  score: number;
  score_breakdown: RubricScore['breakdown'];
  score_verdict: RubricScore['verdict'];
  lint_hard_fails: string[];
  lint_soft_warnings: string[];
  claim_ledger_snapshot: Array<Pick<ClaimLedgerEntry, 'id' | 'claim' | 'source_url' | 'public_use'>>;
  /** Five revision rounds; bodies are historical, notes stay out of public body. */
  revision_history?: RevisionHistoryEntry[];
  initial_body?: string | null;
  publication_failures?: string[];
  revision_rounds_completed?: number;
}

export interface RevisionHistoryEntry {
  round: string;
  label: string;
  body: string;
  title?: string | null;
  editor_notes: string[];
  scorecard: Record<string, number | string>;
  hard_failures: string[];
  changed: boolean;
  approved_unchanged_reason?: string | null;
}

export interface ScoredDraft extends PlatformDraft {
  lint: LintResult;
  score: RubricScore;
  claim_ledger: ClaimLedgerEntry[];
  forum_rules?: ForumRulesRecord | null;
  revision_history?: RevisionHistoryEntry[];
  initial_body?: string | null;
  publication_failures?: string[];
}
