-- DC editorial automation + content calendar (admin-only).

CREATE TABLE IF NOT EXISTS public.editorial_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metro TEXT NOT NULL DEFAULT 'washington_dc',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY[
      'pending',
      'researching',
      'researched',
      'generating',
      'completed',
      'failed'
    ]::TEXT[])),
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  subject_count INTEGER NOT NULL DEFAULT 0,
  post_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_by UUID REFERENCES auth.users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.editorial_runs IS 'Batch research/generate runs for a metro (v1: washington_dc).';

CREATE TABLE IF NOT EXISTS public.editorial_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.editorial_runs (id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type = ANY (ARRAY['venue', 'event']::TEXT[])),
  venue_id TEXT,
  event_id UUID,
  name TEXT NOT NULL,
  city TEXT,
  state TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  image_url TEXT,
  event_date TIMESTAMPTZ,
  research_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (research_status = ANY (ARRAY[
      'pending',
      'researching',
      'ready',
      'failed',
      'skipped'
    ]::TEXT[])),
  sentiment_summary TEXT,
  sentiment_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_editorial_subjects_run ON public.editorial_subjects (run_id);
CREATE INDEX IF NOT EXISTS idx_editorial_subjects_type ON public.editorial_subjects (subject_type);
CREATE INDEX IF NOT EXISTS idx_editorial_subjects_event ON public.editorial_subjects (event_id);

COMMENT ON TABLE public.editorial_subjects IS 'Venues and events selected for editorial research within a run.';

CREATE TABLE IF NOT EXISTS public.editorial_source_snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES public.editorial_subjects (id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform = ANY (ARRAY[
    'reddit',
    'news',
    'web',
    'synth_reviews',
    'apify',
    'other'
  ]::TEXT[])),
  url TEXT,
  title TEXT,
  excerpt TEXT NOT NULL,
  polarity TEXT CHECK (polarity IS NULL OR polarity = ANY (ARRAY[
    'positive',
    'neutral',
    'negative',
    'mixed'
  ]::TEXT[])),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS idx_editorial_snippets_subject ON public.editorial_source_snippets (subject_id);

COMMENT ON TABLE public.editorial_source_snippets IS 'Quoted/sourced community sentiment snippets for editorial subjects.';

CREATE TABLE IF NOT EXISTS public.content_calendar_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.editorial_runs (id) ON DELETE SET NULL,
  subject_id UUID REFERENCES public.editorial_subjects (id) ON DELETE SET NULL,
  content_feed_item_id UUID REFERENCES public.content_feed_items (id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform = ANY (ARRAY[
    'instagram',
    'linkedin',
    'substack',
    'reddit',
    'x'
  ]::TEXT[])),
  format TEXT NOT NULL DEFAULT 'short'
    CHECK (format = ANY (ARRAY['short', 'long', 'thread']::TEXT[])),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status = ANY (ARRAY[
      'draft',
      'pending_review',
      'approved',
      'scheduled',
      'publishing',
      'published',
      'failed',
      'rejected'
    ]::TEXT[])),
  title TEXT,
  body TEXT NOT NULL DEFAULT '',
  hashtags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  media_urls TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  target_forum TEXT,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  external_post_id TEXT,
  error TEXT,
  created_by UUID REFERENCES auth.users (id),
  approved_by UUID REFERENCES auth.users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_calendar_posts_status ON public.content_calendar_posts (status);
CREATE INDEX IF NOT EXISTS idx_content_calendar_posts_scheduled ON public.content_calendar_posts (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_content_calendar_posts_platform ON public.content_calendar_posts (platform);
CREATE INDEX IF NOT EXISTS idx_content_calendar_posts_run ON public.content_calendar_posts (run_id);

COMMENT ON TABLE public.content_calendar_posts IS 'Editable, approve-before-publish social/editorial calendar slots.';

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.set_editorial_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_editorial_runs_updated_at ON public.editorial_runs;
CREATE TRIGGER trg_editorial_runs_updated_at
  BEFORE UPDATE ON public.editorial_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_editorial_updated_at();

DROP TRIGGER IF EXISTS trg_editorial_subjects_updated_at ON public.editorial_subjects;
CREATE TRIGGER trg_editorial_subjects_updated_at
  BEFORE UPDATE ON public.editorial_subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_editorial_updated_at();

DROP TRIGGER IF EXISTS trg_content_calendar_posts_updated_at ON public.content_calendar_posts;
CREATE TRIGGER trg_content_calendar_posts_updated_at
  BEFORE UPDATE ON public.content_calendar_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_editorial_updated_at();

-- RLS: admin only
ALTER TABLE public.editorial_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_source_snippets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_calendar_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins select editorial_runs"
  ON public.editorial_runs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ));

CREATE POLICY "Admins insert editorial_runs"
  ON public.editorial_runs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ));

CREATE POLICY "Admins update editorial_runs"
  ON public.editorial_runs FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ));

CREATE POLICY "Admins delete editorial_runs"
  ON public.editorial_runs FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ));

CREATE POLICY "Admins select editorial_subjects"
  ON public.editorial_subjects FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ));

CREATE POLICY "Admins insert editorial_subjects"
  ON public.editorial_subjects FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ));

CREATE POLICY "Admins update editorial_subjects"
  ON public.editorial_subjects FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ));

CREATE POLICY "Admins delete editorial_subjects"
  ON public.editorial_subjects FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ));

CREATE POLICY "Admins select editorial_source_snippets"
  ON public.editorial_source_snippets FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ));

CREATE POLICY "Admins insert editorial_source_snippets"
  ON public.editorial_source_snippets FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ));

CREATE POLICY "Admins update editorial_source_snippets"
  ON public.editorial_source_snippets FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ));

CREATE POLICY "Admins delete editorial_source_snippets"
  ON public.editorial_source_snippets FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ));

CREATE POLICY "Admins select content_calendar_posts"
  ON public.content_calendar_posts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ));

CREATE POLICY "Admins insert content_calendar_posts"
  ON public.content_calendar_posts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ));

CREATE POLICY "Admins update content_calendar_posts"
  ON public.content_calendar_posts FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ));

CREATE POLICY "Admins delete content_calendar_posts"
  ON public.content_calendar_posts FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ));
