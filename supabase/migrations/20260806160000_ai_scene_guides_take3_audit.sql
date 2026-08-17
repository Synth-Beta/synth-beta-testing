-- Take 3: audit fields, timezone, structural originality, admin persona writes

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS room_timezone text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS scheduled_at_local text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS event_starts_at_utc timestamptz;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS source_field_path text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS fact_confidence real;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS normalized_key text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS structural_fingerprint text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS template_family text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS nearest_message_id text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS rule_version text;

ALTER TABLE public.ai_scene_guide_scheduled_posts
  ADD COLUMN IF NOT EXISTS persona_archetype text;

DROP POLICY IF EXISTS "Admins manage AI personas" ON public.ai_guide_personas;
CREATE POLICY "Admins manage AI personas"
  ON public.ai_guide_personas FOR ALL
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
