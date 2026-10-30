-- Brevo outbound / transactional email event ingest + admin analytics.
-- Webhook: POST /api/brevo-webhook (service role inserts).
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.get_admin_email_analytics(integer);
--   DROP TABLE IF EXISTS public.brevo_email_events;

CREATE TABLE IF NOT EXISTS public.brevo_email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  email TEXT,
  brevo_message_id TEXT,
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  subject TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  link TEXT,
  reason TEXT,
  custom_delivery_key TEXT,
  idempotency_key TEXT NOT NULL,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT brevo_email_events_idempotency_key_key UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS brevo_email_events_event_at_idx
  ON public.brevo_email_events (event_at DESC);

CREATE INDEX IF NOT EXISTS brevo_email_events_message_id_idx
  ON public.brevo_email_events (brevo_message_id)
  WHERE brevo_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS brevo_email_events_type_at_idx
  ON public.brevo_email_events (event_type, event_at DESC);

CREATE INDEX IF NOT EXISTS brevo_email_events_tags_gin_idx
  ON public.brevo_email_events USING GIN (tags);

CREATE INDEX IF NOT EXISTS brevo_email_events_email_idx
  ON public.brevo_email_events (email)
  WHERE email IS NOT NULL;

COMMENT ON TABLE public.brevo_email_events IS
  'Granular Brevo transactional email events (sent, delivered, opened, click, bounce, …).';
COMMENT ON COLUMN public.brevo_email_events.idempotency_key IS
  'Stable key for webhook retries: message_id|event_type|event_at|email|link';
COMMENT ON COLUMN public.brevo_email_events.custom_delivery_key IS
  'Value of Brevo X-Mailin-custom header when present (Synth delivery key).';

ALTER TABLE public.brevo_email_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can select brevo_email_events" ON public.brevo_email_events;
CREATE POLICY "Admins can select brevo_email_events"
  ON public.brevo_email_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
    )
  );

-- No direct client writes; webhook uses service_role.
DROP POLICY IF EXISTS "No client insert on brevo_email_events" ON public.brevo_email_events;
CREATE POLICY "No client insert on brevo_email_events"
  ON public.brevo_email_events FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "No client update on brevo_email_events" ON public.brevo_email_events;
CREATE POLICY "No client update on brevo_email_events"
  ON public.brevo_email_events FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "No client delete on brevo_email_events" ON public.brevo_email_events;
CREATE POLICY "No client delete on brevo_email_events"
  ON public.brevo_email_events FOR DELETE TO authenticated USING (false);

CREATE OR REPLACE FUNCTION public.get_admin_email_analytics(p_days integer DEFAULT 28)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := GREATEST(1, LEAST(COALESCE(p_days, 28), 365));
  v_since timestamptz := now() - make_interval(days => v_days);
  v_kpis jsonb;
  v_series jsonb;
  v_campaigns jsonb;
  v_recent jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.account_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;

  WITH scoped AS (
    SELECT *
    FROM public.brevo_email_events e
    WHERE e.event_at >= v_since
  ),
  counts AS (
    SELECT
      count(*) FILTER (WHERE event_type IN ('sent', 'request')) AS sent,
      count(*) FILTER (WHERE event_type = 'delivered') AS delivered,
      count(DISTINCT coalesce(brevo_message_id, email || '|' || event_at::text))
        FILTER (WHERE event_type IN ('opened', 'unique_opened')) AS unique_opens,
      count(*) FILTER (WHERE event_type IN ('opened', 'unique_opened')) AS opens,
      count(*) FILTER (WHERE event_type = 'click') AS clicks,
      count(*) FILTER (WHERE event_type = 'soft_bounce') AS soft_bounces,
      count(*) FILTER (WHERE event_type = 'hard_bounce') AS hard_bounces,
      count(*) FILTER (WHERE event_type = 'spam') AS spam,
      count(*) FILTER (WHERE event_type = 'unsubscribed') AS unsubscribed,
      count(*) FILTER (WHERE event_type IN ('blocked', 'invalid', 'error')) AS blocked
    FROM scoped
  )
  SELECT jsonb_build_object(
    'days', v_days,
    'since', v_since,
    'sent', sent,
    'delivered', delivered,
    'opens', opens,
    'unique_opens', unique_opens,
    'clicks', clicks,
    'soft_bounces', soft_bounces,
    'hard_bounces', hard_bounces,
    'bounces', soft_bounces + hard_bounces,
    'spam', spam,
    'unsubscribed', unsubscribed,
    'blocked', blocked,
    'delivery_rate', CASE WHEN sent > 0 THEN round((delivered::numeric / sent) * 1000) / 10 ELSE 0 END,
    'open_rate', CASE WHEN delivered > 0 THEN round((unique_opens::numeric / delivered) * 1000) / 10 ELSE 0 END,
    'click_rate', CASE WHEN delivered > 0 THEN round((clicks::numeric / delivered) * 1000) / 10 ELSE 0 END,
    'bounce_rate', CASE WHEN sent > 0 THEN round(((soft_bounces + hard_bounces)::numeric / sent) * 1000) / 10 ELSE 0 END
  )
  INTO v_kpis
  FROM counts;

  SELECT coalesce(jsonb_agg(row_to_json(d)::jsonb ORDER BY d.day), '[]'::jsonb)
  INTO v_series
  FROM (
    SELECT
      to_char(date_trunc('day', e.event_at), 'YYYY-MM-DD') AS day,
      count(*) FILTER (WHERE e.event_type IN ('sent', 'request')) AS sent,
      count(*) FILTER (WHERE e.event_type = 'delivered') AS delivered,
      count(*) FILTER (WHERE e.event_type IN ('opened', 'unique_opened')) AS opens,
      count(*) FILTER (WHERE e.event_type = 'click') AS clicks,
      count(*) FILTER (WHERE e.event_type IN ('soft_bounce', 'hard_bounce')) AS bounces
    FROM public.brevo_email_events e
    WHERE e.event_at >= v_since
    GROUP BY 1
  ) d;

  SELECT coalesce(jsonb_agg(row_to_json(c)::jsonb ORDER BY c.sent DESC, c.campaign), '[]'::jsonb)
  INTO v_campaigns
  FROM (
    SELECT
      base.campaign,
      base.campaign_date,
      base.tag,
      base.sample_subject,
      base.recipients,
      base.sent,
      base.delivered,
      base.unique_opens,
      base.clicks,
      base.bounces,
      CASE WHEN base.delivered > 0
        THEN round((base.unique_opens::numeric / base.delivered) * 1000) / 10
        ELSE 0 END AS open_rate,
      CASE WHEN base.delivered > 0
        THEN round((base.clicks::numeric / base.delivered) * 1000) / 10
        ELSE 0 END AS click_rate,
      CASE WHEN base.sent > 0
        THEN round((base.bounces::numeric / base.sent) * 1000) / 10
        ELSE 0 END AS bounce_rate
    FROM (
      SELECT
        coalesce(
          nd.edition_date::text,
          nullif(e.tags[1], ''),
          nullif(e.subject, ''),
          'untagged'
        ) AS campaign,
        coalesce(nd.edition_date::text, to_char(date_trunc('day', min(e.event_at)), 'YYYY-MM-DD')) AS campaign_date,
        coalesce(nullif(e.tags[1], ''), 'untagged') AS tag,
        max(e.subject) AS sample_subject,
        count(DISTINCT coalesce(e.brevo_message_id, e.email))
          FILTER (WHERE e.event_type IN ('sent', 'request', 'delivered')) AS recipients,
        count(*) FILTER (WHERE e.event_type IN ('sent', 'request')) AS sent,
        count(*) FILTER (WHERE e.event_type = 'delivered') AS delivered,
        count(DISTINCT coalesce(e.brevo_message_id, e.email))
          FILTER (WHERE e.event_type IN ('opened', 'unique_opened')) AS unique_opens,
        count(*) FILTER (WHERE e.event_type = 'click') AS clicks,
        count(*) FILTER (WHERE e.event_type IN ('soft_bounce', 'hard_bounce')) AS bounces
      FROM public.brevo_email_events e
      LEFT JOIN public.newsletter_drafts nd
        ON nd.brevo_message_id IS NOT NULL
       AND nd.brevo_message_id = e.brevo_message_id
      WHERE e.event_at >= v_since
      GROUP BY
        coalesce(nd.edition_date::text, nullif(e.tags[1], ''), nullif(e.subject, ''), 'untagged'),
        nd.edition_date,
        coalesce(nullif(e.tags[1], ''), 'untagged')
      ORDER BY sent DESC
      LIMIT 50
    ) base
  ) c;

  SELECT coalesce(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.event_at DESC), '[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT
      e.id,
      e.event_type,
      e.email,
      e.subject,
      e.link,
      e.reason,
      e.tags,
      e.brevo_message_id,
      e.event_at
    FROM public.brevo_email_events e
    WHERE e.event_at >= v_since
    ORDER BY e.event_at DESC
    LIMIT 100
  ) r;

  RETURN jsonb_build_object(
    'kpis', v_kpis,
    'series', v_series,
    'campaigns', v_campaigns,
    'recent', v_recent
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_email_analytics(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_email_analytics(integer) TO authenticated, service_role;
