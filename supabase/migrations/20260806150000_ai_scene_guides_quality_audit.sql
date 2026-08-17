-- AI Scene Guides quality seed: conversation links + audit fields

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS conversation_id uuid;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS turn_number integer;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS reply_to_turn integer;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS event_id text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS artist_name text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS venue_name text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS event_local_date text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS event_local_time text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS source_url text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS source_retrieved_at timestamptz;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS reviewer_decision text
    CHECK (reviewer_decision IS NULL OR reviewer_decision IN ('PASS', 'FAIL', 'FLAG'));

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS failure_reasons text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS gate_summary text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS similarity_score real;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS guide_version text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS generator_version text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS intent_confidence real;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS human_interruption_outcome text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS persona_name text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS audit jsonb;

CREATE INDEX IF NOT EXISTS idx_ai_sg_sched_conversation
  ON public.ai_scene_guide_scheduled_posts (conversation_id);

COMMENT ON COLUMN public.ai_scene_guide_scheduled_posts.conversation_id IS
  'Links 3–5 turn AI Scene Guide conversations for coherence testing';
