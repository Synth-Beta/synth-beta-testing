-- AI Scene Guides: randomized cron schedule queue
-- Cron plans posts at random times; a frequent tick publishes due rows.

CREATE TABLE IF NOT EXISTS public.ai_scene_guide_scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  genre_id text NOT NULL,
  room_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  persona_id uuid REFERENCES public.ai_guide_personas(id) ON DELETE SET NULL,
  sender_user_id uuid NOT NULL,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'posting', 'posted', 'skipped', 'failed', 'cancelled')),
  content text,
  intent text,
  cited_fact_ids uuid[] NOT NULL DEFAULT '{}',
  contains_setlist_spoiler boolean NOT NULL DEFAULT false,
  plan_id uuid REFERENCES public.ai_conversation_plans(id) ON DELETE SET NULL,
  message_id uuid,
  skip_reason text,
  error text,
  data_segment text NOT NULL DEFAULT 'live'
    CHECK (data_segment IN ('live', 'fixture', 'replay')),
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_sg_sched_due
  ON public.ai_scene_guide_scheduled_posts (scheduled_at)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_ai_sg_sched_room_day
  ON public.ai_scene_guide_scheduled_posts (room_id, scheduled_at);

ALTER TABLE public.ai_guide_personas
  ADD COLUMN IF NOT EXISTS sender_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_ai_guide_personas_sender
  ON public.ai_guide_personas (sender_user_id)
  WHERE sender_user_id IS NOT NULL;

-- Cron controls on settings
ALTER TABLE public.ai_scene_guides_settings
  ADD COLUMN IF NOT EXISTS cron_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.ai_scene_guides_settings
  ADD COLUMN IF NOT EXISTS cron_posts_per_genre_min integer NOT NULL DEFAULT 5;

ALTER TABLE public.ai_scene_guides_settings
  ADD COLUMN IF NOT EXISTS cron_posts_per_genre_max integer NOT NULL DEFAULT 30;

-- Daily cadence: random posts per genre between 5–30 (room day cap must allow it)
ALTER TABLE public.ai_scene_guides_settings
  ALTER COLUMN cron_posts_per_genre_min SET DEFAULT 5;

ALTER TABLE public.ai_scene_guides_settings
  ALTER COLUMN cron_posts_per_genre_max SET DEFAULT 30;

ALTER TABLE public.ai_scene_guides_settings
  ALTER COLUMN max_ai_messages_per_room_day SET DEFAULT 30;

UPDATE public.ai_scene_guides_settings
SET
  cron_posts_per_genre_min = 5,
  cron_posts_per_genre_max = 30,
  max_ai_messages_per_room_day = GREATEST(COALESCE(max_ai_messages_per_room_day, 0), 30),
  updated_at = now()
WHERE id = 'global';

ALTER TABLE public.ai_scene_guides_settings
  ADD COLUMN IF NOT EXISTS cron_genres text[] NOT NULL DEFAULT ARRAY['indie','hip-hop','edm','metal','pop'];

ALTER TABLE public.ai_scene_guides_settings
  ADD COLUMN IF NOT EXISTS last_cron_schedule_at timestamptz;

ALTER TABLE public.ai_scene_guides_settings
  ADD COLUMN IF NOT EXISTS last_cron_publish_at timestamptz;

-- Optional sender pool flag (preferred over is_bot when present)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_ai_scene_guide boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_ai_scene_guide
  ON public.users (user_id)
  WHERE is_ai_scene_guide;

ALTER TABLE public.ai_scene_guide_scheduled_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read AI schedule" ON public.ai_scene_guide_scheduled_posts;
CREATE POLICY "Admins manage AI schedule"
  ON public.ai_scene_guide_scheduled_posts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.account_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.account_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "Authenticated can read scene guide settings" ON public.ai_scene_guides_settings;
CREATE POLICY "Authenticated can read scene guide settings"
  ON public.ai_scene_guides_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins update scene guide settings" ON public.ai_scene_guides_settings;
CREATE POLICY "Admins update scene guide settings"
  ON public.ai_scene_guides_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.account_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.account_type = 'admin'
    )
  );

COMMENT ON TABLE public.ai_scene_guide_scheduled_posts IS
  'Randomized AI Scene Guide cron queue. Publisher inserts disclosed author_type=ai_scene_guide messages.';
