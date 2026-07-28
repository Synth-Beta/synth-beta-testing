-- News items for the Media / "In the News" section (public /pr page).
-- Admins manage these in the Admin dashboard; public can read.

CREATE TABLE IF NOT EXISTS public.news_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  url text NOT NULL,
  image_url text NULL,
  source text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT news_items_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_news_items_sort_created ON public.news_items (sort_order ASC, created_at DESC) TABLESPACE pg_default;

ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;

-- Public read (anon + authenticated) so /pr Media page can fetch without login
CREATE POLICY "Anyone can read news items"
  ON public.news_items
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only admins can insert
CREATE POLICY "Admins can insert news items"
  ON public.news_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  );

-- Only admins can update
CREATE POLICY "Admins can update news items"
  ON public.news_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  );

-- Only admins can delete
CREATE POLICY "Admins can delete news items"
  ON public.news_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  );

COMMENT ON TABLE public.news_items IS 'Items for the Media / In the News section at /pr';
