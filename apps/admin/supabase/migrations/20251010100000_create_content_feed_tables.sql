-- Unified content feed tables, taxonomy, relations, and helper view for SEO content.
-- Provides backend foundation for /stories and media surfaces.

-- Create source/status enums via CHECK constraints instead of custom types for flexibility.

CREATE TABLE IF NOT EXISTS public.content_feed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT,
  content_markdown TEXT,
  source_type TEXT NOT NULL CHECK (source_type = ANY (ARRAY[
    'press',
    'story',
    'substack',
    'announcement',
    'guide',
    'update'
  ]::TEXT[])),
  source_url TEXT,
  cover_image_url TEXT,
  cover_image_alt TEXT,
  seo_title TEXT,
  seo_description TEXT,
  primary_keyword TEXT,
  secondary_keywords TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  cta_copy TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status = ANY (ARRAY['draft','scheduled','published']::TEXT[])),
  published_at TIMESTAMPTZ,
  hero_media_id UUID,
  created_by UUID REFERENCES auth.users (id),
  updated_by UUID REFERENCES auth.users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_feed_items_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  CONSTRAINT content_feed_items_publish_requires_date CHECK (status <> 'published' OR published_at IS NOT NULL)
);

COMMENT ON TABLE public.content_feed_items IS 'Central content hub for press, stories, Substack, announcements, and SEO articles.';
COMMENT ON COLUMN public.content_feed_items.source_type IS 'Content classification for SEO clusters (press/story/substack/announcement/guide/update).';
COMMENT ON COLUMN public.content_feed_items.status IS 'draft | scheduled | published';
COMMENT ON COLUMN public.content_feed_items.secondary_keywords IS 'Array of supporting SEO keywords.';
COMMENT ON COLUMN public.content_feed_items.cta_copy IS 'Optional CTA snippet rendered at the end of the article.';

CREATE INDEX IF NOT EXISTS idx_content_feed_items_slug ON public.content_feed_items (slug);
CREATE INDEX IF NOT EXISTS idx_content_feed_items_published_at ON public.content_feed_items (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_feed_items_status ON public.content_feed_items (status);
CREATE INDEX IF NOT EXISTS idx_content_feed_items_source_type ON public.content_feed_items (source_type);
CREATE INDEX IF NOT EXISTS idx_content_feed_items_search ON public.content_feed_items
USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(content_markdown,'')));

-- Tag taxonomy
CREATE TABLE IF NOT EXISTS public.content_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.content_tags IS 'Reusable taxonomy for content feed items.';

CREATE TABLE IF NOT EXISTS public.content_item_tags (
  content_id UUID NOT NULL REFERENCES public.content_feed_items(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.content_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (content_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_content_item_tags_tag ON public.content_item_tags (tag_id);

-- Relations to artists, venues, cities, etc.
CREATE TABLE IF NOT EXISTS public.content_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES public.content_feed_items(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type = ANY (ARRAY['artist','venue','city','event','topic','playlist']::TEXT[])),
  related_id UUID,
  related_slug TEXT,
  related_label TEXT,
  related_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.content_relations IS 'Associations between content items and artists/venues/cities/events for internal linking.';

CREATE INDEX IF NOT EXISTS idx_content_relations_content_type ON public.content_relations (content_id, relation_type);
CREATE INDEX IF NOT EXISTS idx_content_relations_lookup ON public.content_relations (relation_type, related_id);

-- Enable RLS
ALTER TABLE public.content_feed_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_item_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_relations ENABLE ROW LEVEL SECURITY;

-- Helper policy predicate
CREATE POLICY "Public read published content feed"
ON public.content_feed_items
FOR SELECT
TO public
USING (
  status = 'published'
  AND published_at IS NOT NULL
  AND published_at <= now()
);

CREATE POLICY "Admins read all content feed"
ON public.content_feed_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.user_id = auth.uid()
    AND users.account_type = 'admin'
  )
);

CREATE POLICY "Admins manage content feed"
ON public.content_feed_items
FOR ALL
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

CREATE POLICY "Public read content tags"
ON public.content_tags
FOR SELECT
TO public
USING (true);

CREATE POLICY "Admins manage content tags"
ON public.content_tags
FOR ALL
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

CREATE POLICY "Public read content item tags"
ON public.content_item_tags
FOR SELECT
TO public
USING (true);

CREATE POLICY "Admins manage content item tags"
ON public.content_item_tags
FOR ALL
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

CREATE POLICY "Public read content relations"
ON public.content_relations
FOR SELECT
TO public
USING (true);

CREATE POLICY "Admins manage content relations"
ON public.content_relations
FOR ALL
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

-- Updated-at triggers
CREATE TRIGGER update_content_feed_items_updated_at
  BEFORE UPDATE ON public.content_feed_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_content_tags_updated_at
  BEFORE UPDATE ON public.content_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Aggregated view for public consumption (published items only)
CREATE OR REPLACE VIEW public.content_feed_items_public_v1 AS
SELECT
  i.id,
  i.slug,
  i.title,
  i.summary,
  i.content_markdown,
  i.source_type,
  i.source_url,
  i.cover_image_url,
  i.cover_image_alt,
  i.seo_title,
  i.seo_description,
  i.primary_keyword,
  i.secondary_keywords,
  i.cta_copy,
  i.published_at,
  i.created_at,
  i.updated_at,
  COALESCE(
    jsonb_agg(
      DISTINCT jsonb_build_object(
        'id', t.id,
        'slug', t.slug,
        'label', t.label
      )
    ) FILTER (WHERE t.id IS NOT NULL),
    '[]'::jsonb
  ) AS tags,
  COALESCE(
    jsonb_agg(
      DISTINCT jsonb_build_object(
        'id', r.id,
        'type', r.relation_type,
        'relatedId', r.related_id,
        'slug', r.related_slug,
        'label', r.related_label,
        'url', r.related_url
      )
    ) FILTER (WHERE r.id IS NOT NULL),
    '[]'::jsonb
  ) AS relations
FROM public.content_feed_items i
LEFT JOIN public.content_item_tags cit ON cit.content_id = i.id
LEFT JOIN public.content_tags t ON t.id = cit.tag_id
LEFT JOIN public.content_relations r ON r.content_id = i.id
WHERE i.status = 'published'
  AND i.published_at IS NOT NULL
  AND i.published_at <= now()
GROUP BY i.id;

COMMENT ON VIEW public.content_feed_items_public_v1 IS 'Published content feed items with aggregated tags and relations for public consumption.';

-- Helper function returning a single item (published or admin accessible via RLS)
CREATE OR REPLACE FUNCTION public.content_feed_item_by_slug(_slug TEXT)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  title TEXT,
  summary TEXT,
  content_markdown TEXT,
  source_type TEXT,
  source_url TEXT,
  cover_image_url TEXT,
  cover_image_alt TEXT,
  seo_title TEXT,
  seo_description TEXT,
  primary_keyword TEXT,
  secondary_keywords TEXT[],
  cta_copy TEXT,
  status TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  tags JSONB,
  relations JSONB
) AS $$
  SELECT
    i.id,
    i.slug,
    i.title,
    i.summary,
    i.content_markdown,
    i.source_type,
    i.source_url,
    i.cover_image_url,
    i.cover_image_alt,
    i.seo_title,
    i.seo_description,
    i.primary_keyword,
    i.secondary_keywords,
    i.cta_copy,
    i.status,
    i.published_at,
    i.created_at,
    i.updated_at,
    COALESCE(
      jsonb_agg(
        DISTINCT jsonb_build_object(
          'id', t.id,
          'slug', t.slug,
          'label', t.label
        )
      ) FILTER (WHERE t.id IS NOT NULL),
      '[]'::jsonb
    ) AS tags,
    COALESCE(
      jsonb_agg(
        DISTINCT jsonb_build_object(
          'id', r.id,
          'type', r.relation_type,
          'relatedId', r.related_id,
          'slug', r.related_slug,
          'label', r.related_label,
          'url', r.related_url
        )
      ) FILTER (WHERE r.id IS NOT NULL),
      '[]'::jsonb
    ) AS relations
  FROM public.content_feed_items i
  LEFT JOIN public.content_item_tags cit ON cit.content_id = i.id
  LEFT JOIN public.content_tags t ON t.id = cit.tag_id
  LEFT JOIN public.content_relations r ON r.content_id = i.id
  WHERE i.slug = _slug
  GROUP BY i.id;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION public.content_feed_item_by_slug IS 'Returns a single content feed item with aggregated tags and relations. Honors RLS for published/admin access.';
