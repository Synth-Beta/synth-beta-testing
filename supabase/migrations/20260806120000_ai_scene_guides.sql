-- AI Scene Guides: personas, grounded facts, plans, audits, settings, shadow pilot
-- Production posting defaults OFF. Shadow mode must never write via consumer paths.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Messages: AI authorship columns (nullable until Phase 4 publisher uses them)
-- ---------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS author_type text NOT NULL DEFAULT 'human';

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_author_type_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_author_type_check
  CHECK (author_type IN ('human', 'ai_scene_guide', 'system'));

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS persona_id uuid;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS plan_id uuid;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS cited_fact_ids uuid[];

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS contains_setlist_spoiler boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_messages_author_type ON public.messages (author_type)
  WHERE author_type = 'ai_scene_guide';

-- ---------------------------------------------------------------------------
-- Personas (cast library — not Auth users)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_guide_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  genre_id text NOT NULL,
  display_name text NOT NULL,
  avatar_asset text,
  archetype text NOT NULL,
  voice_traits jsonb NOT NULL DEFAULT '{}'::jsonb,
  interest_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  message_length_distribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  emoji_rate numeric(4,3) NOT NULL DEFAULT 0.08,
  question_rate numeric(4,3) NOT NULL DEFAULT 0.30,
  slang_level numeric(4,3) NOT NULL DEFAULT 0.15,
  activity_windows jsonb NOT NULL DEFAULT '[]'::jsonb,
  disclosure_label text NOT NULL DEFAULT 'AI Scene Guide',
  is_active boolean NOT NULL DEFAULT true,
  seed_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (genre_id, display_name)
);

CREATE INDEX IF NOT EXISTS idx_ai_guide_personas_genre
  ON public.ai_guide_personas (genre_id) WHERE is_active;

-- ---------------------------------------------------------------------------
-- Grounded facts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grounded_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('event', 'setlist', 'artist', 'venue', 'release', 'topic_signal')),
  claim text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('jambase', 'approved_reddit_api', 'fixture')),
  source_url text NOT NULL,
  source_title text NOT NULL,
  occurred_at timestamptz,
  retrieved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  confidence numeric(4,3) NOT NULL DEFAULT 0.5,
  raw_source_id text NOT NULL,
  provenance_key text NOT NULL UNIQUE,
  artist_name text,
  event_id text,
  venue_name text,
  genre_id text,
  city text,
  data_segment text NOT NULL DEFAULT 'live'
    CHECK (data_segment IN ('live', 'fixture', 'replay')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grounded_facts_genre ON public.grounded_facts (genre_id);
CREATE INDEX IF NOT EXISTS idx_grounded_facts_expires ON public.grounded_facts (expires_at);

-- ---------------------------------------------------------------------------
-- Conversation plans
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_conversation_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id text NOT NULL,
  genre_id text NOT NULL,
  trigger_type text NOT NULL,
  trigger_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN (
      'planned', 'generating', 'approved', 'posting', 'paused',
      'completed', 'rejected', 'suppressed', 'reviewable', 'verified'
    )),
  objective text,
  fact_ids uuid[] NOT NULL DEFAULT '{}',
  participating_persona_ids uuid[] NOT NULL DEFAULT '{}',
  max_messages integer NOT NULL DEFAULT 3,
  spacing_seconds integer[] NOT NULL DEFAULT '{}',
  spoiler_mode boolean NOT NULL DEFAULT false,
  human_message_cutoff_at timestamptz,
  generator_version text,
  data_segment text NOT NULL DEFAULT 'live'
    CHECK (data_segment IN ('live', 'fixture', 'replay')),
  why_generated text,
  expires_at timestamptz NOT NULL,
  simulated_human_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversation_plans_room
  ON public.ai_conversation_plans (room_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_conversation_plans_trigger
  ON public.ai_conversation_plans (trigger_at);

-- ---------------------------------------------------------------------------
-- Message audits (immutable generation/publish decisions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_message_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid,
  candidate_message_id text,
  plan_id uuid REFERENCES public.ai_conversation_plans(id) ON DELETE SET NULL,
  persona_id uuid REFERENCES public.ai_guide_personas(id) ON DELETE SET NULL,
  model_provider text,
  model_version text,
  prompt_version text,
  cited_fact_ids uuid[] NOT NULL DEFAULT '{}',
  generated_text text,
  contains_setlist_spoiler boolean NOT NULL DEFAULT false,
  intent text,
  confidence numeric(4,3),
  moderation_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  verifier_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  generation_latency_ms integer,
  generation_cost_usd numeric(10,6),
  publisher_decision text NOT NULL DEFAULT 'pending'
    CHECK (publisher_decision IN (
      'pending', 'would_publish', 'published', 'rejected', 'suppressed'
    )),
  rejection_reason text,
  suppression_reason text,
  data_segment text NOT NULL DEFAULT 'live'
    CHECK (data_segment IN ('live', 'fixture', 'replay')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_message_audits_plan ON public.ai_message_audits (plan_id);
CREATE INDEX IF NOT EXISTS idx_ai_message_audits_persona ON public.ai_message_audits (persona_id);

-- FKs from messages (deferred until tables exist)
DO $$ BEGIN
  ALTER TABLE public.messages
    ADD CONSTRAINT messages_persona_id_fkey
    FOREIGN KEY (persona_id) REFERENCES public.ai_guide_personas(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.messages
    ADD CONSTRAINT messages_plan_id_fkey
    FOREIGN KEY (plan_id) REFERENCES public.ai_conversation_plans(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AI messages must carry persona_id
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_ai_persona_required;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_ai_persona_required
  CHECK (
    author_type <> 'ai_scene_guide'
    OR persona_id IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- Settings (single-row style config + kill switch)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_scene_guides_settings (
  id text PRIMARY KEY DEFAULT 'global',
  enabled boolean NOT NULL DEFAULT false,
  dry_run boolean NOT NULL DEFAULT true,
  mode text NOT NULL DEFAULT 'fixture'
    CHECK (mode IN ('fixture', 'shadow_slack', 'staff_approve', 'production')),
  max_ai_messages_per_room_day integer NOT NULL DEFAULT 30,
  max_bot_chain_length integer NOT NULL DEFAULT 4,
  max_consecutive_ai_without_delay integer NOT NULL DEFAULT 2,
  consecutive_delay_seconds integer NOT NULL DEFAULT 90,
  active_persona_count_min integer NOT NULL DEFAULT 3,
  active_persona_count_max integer NOT NULL DEFAULT 5,
  quiet_hours jsonb NOT NULL DEFAULT '{"startHour": 1, "endHour": 7}'::jsonb,
  confidence_threshold numeric(4,3) NOT NULL DEFAULT 0.55,
  freshness_hours integer NOT NULL DEFAULT 72,
  pause_on_human_activity boolean NOT NULL DEFAULT true,
  setlist_generation_enabled boolean NOT NULL DEFAULT false,
  per_genre_enabled jsonb NOT NULL DEFAULT '{}'::jsonb,
  per_room_enabled jsonb NOT NULL DEFAULT '{}'::jsonb,
  staff_room_allowlist text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

INSERT INTO public.ai_scene_guides_settings (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Per-user mute preference
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_scene_guide_room_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  room_id text NOT NULL,
  mute_ai_guides boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_scene_guide_room_prefs_room
  ON public.ai_scene_guide_room_prefs (room_id)
  WHERE mute_ai_guides;

-- ---------------------------------------------------------------------------
-- Shadow pilot deliveries + reviews
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shadow_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.ai_conversation_plans(id) ON DELETE CASCADE,
  candidate_message_id text,
  slack_channel_id text NOT NULL,
  slack_message_ts text,
  slack_thread_ts text,
  delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'delivered', 'failed', 'reconciled')),
  simulated_publisher_outcome text NOT NULL
    CHECK (simulated_publisher_outcome IN ('would_publish', 'rejected', 'suppressed')),
  suppression_reason text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, candidate_message_id)
);

CREATE TABLE IF NOT EXISTS public.shadow_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.ai_conversation_plans(id) ON DELETE CASCADE,
  candidate_message_id text,
  reviewer_slack_user_id text NOT NULL,
  label text NOT NULL CHECK (label IN ('pass', 'fail', 'flag')),
  reason text,
  note text,
  naturalness_score integer CHECK (naturalness_score IS NULL OR (naturalness_score BETWEEN 1 AND 5)),
  relevance_score integer CHECK (relevance_score IS NULL OR (relevance_score BETWEEN 1 AND 5)),
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shadow_reviews_plan ON public.shadow_reviews (plan_id);
CREATE INDEX IF NOT EXISTS idx_shadow_reviews_lookup
  ON public.shadow_reviews (plan_id, candidate_message_id, reviewer_slack_user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS: service-role writes; authenticated read of settings/personas for UI
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_guide_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grounded_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversation_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_message_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_scene_guides_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_scene_guide_room_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active AI personas" ON public.ai_guide_personas;
CREATE POLICY "Anyone can read active AI personas"
  ON public.ai_guide_personas FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Authenticated can read scene guide settings" ON public.ai_scene_guides_settings;
CREATE POLICY "Authenticated can read scene guide settings"
  ON public.ai_scene_guides_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users manage own AI mute prefs" ON public.ai_scene_guide_room_prefs;
CREATE POLICY "Users manage own AI mute prefs"
  ON public.ai_scene_guide_room_prefs FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated can read grounded facts for chips" ON public.grounded_facts;
CREATE POLICY "Authenticated can read grounded facts for chips"
  ON public.grounded_facts FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.ai_guide_personas IS
  'AI Scene Guide cast library. Not consumer Auth accounts. Always disclose as AI.';
COMMENT ON TABLE public.ai_scene_guides_settings IS
  'Global kill switch and rollout mode. enabled defaults false; production requires explicit enable.';
COMMENT ON COLUMN public.messages.author_type IS
  'human | ai_scene_guide | system. Never omit for AI-authored rows.';
