-- ============================================================
-- LOI-577: Chat warmth evaluator + demoSeedLive (contract v1)
-- Thresholds live only server-side. Frontend reads homeEligible.
-- ============================================================

-- ---------------------------------------------------------------------------
-- Schema: chat keys, kinds, demo seed flag, seed proxies, snapshot cache
-- ---------------------------------------------------------------------------
ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS chat_key text;

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS chat_kind text;

ALTER TABLE public.chats
  DROP CONSTRAINT IF EXISTS chats_chat_kind_check;

ALTER TABLE public.chats
  ADD CONSTRAINT chats_chat_kind_check
  CHECK (chat_kind IS NULL OR chat_kind IN ('scene_persistent', 'featured_show'));

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS demo_seed_live boolean NOT NULL DEFAULT false;

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS warmth_home_eligible boolean;

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS warmth_gate jsonb;

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS warmth_evaluated_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_chat_key_unique
  ON public.chats (chat_key)
  WHERE chat_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chats_home_eligible
  ON public.chats (warmth_home_eligible)
  WHERE warmth_home_eligible IS TRUE;

CREATE INDEX IF NOT EXISTS idx_chats_demo_seed_live
  ON public.chats (demo_seed_live)
  WHERE demo_seed_live IS TRUE;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_seed_proxy boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_is_seed_proxy
  ON public.users (user_id)
  WHERE is_seed_proxy IS TRUE;

-- Runtime config (demo week proxy counting + featured fixture set)
CREATE TABLE IF NOT EXISTS public.density_runtime_config (
  id text PRIMARY KEY DEFAULT 'default',
  demo_week_proxy_counting boolean NOT NULL DEFAULT true,
  featured_show_ids text[] NOT NULL DEFAULT ARRAY[
    'FIX-SHOW-01','FIX-SHOW-02','FIX-SHOW-03','FIX-SHOW-04','FIX-SHOW-05',
    'FIX-SHOW-06','FIX-SHOW-07','FIX-SHOW-08','FIX-SHOW-09','FIX-SHOW-10',
    'FIX-SHOW-11','FIX-SHOW-12'
  ]::text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.density_runtime_config (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.density_runtime_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS density_runtime_config_select_authenticated ON public.density_runtime_config;
CREATE POLICY density_runtime_config_select_authenticated
  ON public.density_runtime_config
  FOR SELECT
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- Helpers: DC ICP / seed proxy membership
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_dc_location(p_city text, p_state text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_city IS NULL AND p_state IS NULL THEN false
    WHEN lower(coalesce(p_state, '')) IN ('dc', 'd.c.', 'district of columbia') THEN true
    WHEN lower(coalesce(p_city, '')) ~ '(^|[[:space:],])(washington([[:space:]]*,?[[:space:]]*d\.?c\.?)?|washington dc|dc)$' THEN true
    WHEN lower(trim(coalesce(p_city, ''))) IN ('dc', 'd.c.', 'washington', 'washington dc', 'washington, dc', 'washington, d.c.') THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.user_age_years(p_birthday date, p_as_of date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_birthday IS NULL THEN NULL
    ELSE (
      EXTRACT(YEAR FROM age(p_as_of, p_birthday))
    )::integer
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_dc_icp_or_seed_proxy(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_birthday date;
  v_city text;
  v_state text;
  v_is_seed boolean;
  v_proxy_ok boolean;
  v_age integer;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  SELECT u.birthday::date,
         u.location_city,
         u.location_state,
         coalesce(u.is_seed_proxy, false)
    INTO v_birthday, v_city, v_state, v_is_seed
  FROM public.users u
  WHERE u.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT coalesce(c.demo_week_proxy_counting, true)
    INTO v_proxy_ok
  FROM public.density_runtime_config c
  WHERE c.id = 'default';

  IF v_is_seed AND coalesce(v_proxy_ok, true) THEN
    RETURN true;
  END IF;

  v_age := public.user_age_years(v_birthday);
  IF v_age IS NULL OR v_age < 20 OR v_age > 27 THEN
    RETURN false;
  END IF;

  RETURN public.is_dc_location(v_city, v_state);
END;
$$;

-- ---------------------------------------------------------------------------
-- Featured parent check (fixture ids + live promoted DC week events)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_show_in_featured_set(p_show_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids text[];
  v_exists boolean;
BEGIN
  IF p_show_id IS NULL OR length(trim(p_show_id)) = 0 THEN
    RETURN false;
  END IF;

  PERFORM set_config('row_security', 'off', true);

  -- Prefer LOI-566 published weekly featured set when that schema is present.
  IF to_regclass('public.weekly_featured_sets') IS NOT NULL
     AND to_regclass('public.weekly_featured_items') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.weekly_featured_sets s
      JOIN public.weekly_featured_items i ON i.set_id = s.id
      WHERE s.metro = 'dc'
        AND s.status = 'published'
        AND s.week_id = CASE
          WHEN to_regprocedure('public.dc_week_id(timestamptz)') IS NOT NULL
            THEN public.dc_week_id(now())
          ELSE to_char(date_trunc('week', now()), 'IYYY') || '-W' || to_char(date_trunc('week', now()), 'IW')
        END
        AND (
          i.event_id::text = p_show_id
          OR i.event_id::text = replace(p_show_id, 'featured.', '')
        )
    ) INTO v_exists;
    IF coalesce(v_exists, false) THEN
      RETURN true;
    END IF;
  END IF;

  SELECT c.featured_show_ids INTO v_ids
  FROM public.density_runtime_config c
  WHERE c.id = 'default';

  IF v_ids IS NOT NULL AND p_show_id = ANY (v_ids) THEN
    RETURN true;
  END IF;

  -- Live curated/promoted events this week in DC (fallback)
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id::text = p_show_id
      AND (e.is_promoted IS TRUE OR e.promotion_tier IS NOT NULL)
      AND e.event_date >= date_trunc('week', now())
      AND e.event_date < date_trunc('week', now()) + interval '7 days'
      AND (
        public.is_dc_location(e.venue_city, e.venue_state)
        OR lower(coalesce(e.venue_state, '')) IN ('dc', 'd.c.', 'md', 'va')
      )
  ) INTO v_exists;

  RETURN coalesce(v_exists, false);
END;
$$;

-- ---------------------------------------------------------------------------
-- Core evaluator (contract v1)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_chat_warmth(p_chat_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat public.chats%ROWTYPE;
  v_kind text;
  v_show_id text;
  v_members int := 0;
  v_human_msgs int := 0;
  v_demo boolean := false;
  v_featured boolean := true;
  v_members_ok boolean;
  v_activity_ok boolean;
  v_featured_ok boolean;
  v_home boolean;
  v_fail text[] := ARRAY[]::text[];
  v_gate jsonb;
  v_snapshot jsonb;
  v_now timestamptz := now();
BEGIN
  PERFORM set_config('row_security', 'off', true);

  SELECT * INTO v_chat FROM public.chats WHERE id = p_chat_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'chat_not_found: %', p_chat_id;
  END IF;

  v_kind := coalesce(
    v_chat.chat_kind,
    CASE
      WHEN v_chat.chat_key LIKE 'scene.%' THEN 'scene_persistent'
      WHEN v_chat.entity_type = 'event' OR v_chat.chat_key LIKE 'FIX-SHOW-%' OR v_chat.chat_key LIKE 'featured.%'
        THEN 'featured_show'
      ELSE NULL
    END
  );

  v_show_id := coalesce(
    NULLIF(v_chat.entity_uuid::text, ''),
    CASE
      WHEN v_chat.chat_key LIKE 'featured.%' THEN substring(v_chat.chat_key from 10)
      WHEN v_chat.chat_key LIKE 'FIX-SHOW-%' THEN v_chat.chat_key
      ELSE NULLIF(v_chat.entity_id, '')
    END
  );

  v_demo := coalesce(v_chat.demo_seed_live, false);

  SELECT COUNT(*)::int INTO v_members
  FROM public.chat_participants cp
  WHERE cp.chat_id = p_chat_id
    AND public.is_dc_icp_or_seed_proxy(cp.user_id);

  -- Human messages in 24h: author_type human/null, sender NOT seed proxy
  SELECT COUNT(*)::int INTO v_human_msgs
  FROM public.messages m
  JOIN public.users u ON u.user_id = m.sender_id
  WHERE m.chat_id = p_chat_id
    AND m.created_at >= v_now - interval '24 hours'
    AND coalesce(m.author_type, 'human') = 'human'
    AND coalesce(u.is_seed_proxy, false) = false;

  IF v_kind = 'featured_show' THEN
    v_featured := public.is_show_in_featured_set(v_show_id);
  ELSE
    v_featured := true;
  END IF;

  v_members_ok := v_members >= 8;
  v_activity_ok := (v_human_msgs >= 3) OR v_demo;
  v_featured_ok := (v_kind IS DISTINCT FROM 'featured_show') OR v_featured;
  v_home := v_members_ok AND v_activity_ok AND v_featured_ok;

  IF NOT v_members_ok THEN
    v_fail := array_append(v_fail, 'members_below_8');
  END IF;
  IF NOT v_activity_ok THEN
    v_fail := array_append(v_fail, 'activity_below_3');
    IF NOT v_demo THEN
      v_fail := array_append(v_fail, 'not_demo_seed_live');
    END IF;
  END IF;
  IF NOT v_featured_ok THEN
    v_fail := array_append(v_fail, 'show_not_featured');
  END IF;

  v_gate := jsonb_build_object(
    'dcIcpMemberCount', v_members,
    'humanMessageCount24h', v_human_msgs,
    'demoSeedLive', v_demo,
    'featuredParentInSet', v_featured,
    'failReasons', to_jsonb(v_fail)
  );

  v_snapshot := jsonb_build_object(
    'chatId', p_chat_id::text,
    'chatKind', v_kind,
    'showId', to_jsonb(v_show_id),
    'homeEligible', v_home,
    'gate', v_gate,
    'evaluatedAt', to_jsonb(v_now)
  );

  UPDATE public.chats
  SET chat_kind = coalesce(chat_kind, v_kind),
      warmth_home_eligible = v_home,
      warmth_gate = v_gate,
      warmth_evaluated_at = v_now,
      updated_at = v_now
  WHERE id = p_chat_id;

  RETURN v_snapshot;
END;
$$;

COMMENT ON FUNCTION public.evaluate_chat_warmth(uuid) IS
  'LOI-577 / contract v1: evaluates Home warmth gates and caches snapshot on chats.';

-- ---------------------------------------------------------------------------
-- Read APIs for Frontend (homeEligible only path)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_chat_warmth_snapshot(p_chat_id uuid, p_refresh boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snap jsonb;
  v_cached_at timestamptz;
  v_eligible boolean;
  v_gate jsonb;
  v_kind text;
  v_show text;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  IF p_refresh THEN
    RETURN public.evaluate_chat_warmth(p_chat_id);
  END IF;

  SELECT warmth_evaluated_at, warmth_home_eligible, warmth_gate, chat_kind,
         coalesce(entity_uuid::text, entity_id, chat_key)
    INTO v_cached_at, v_eligible, v_gate, v_kind, v_show
  FROM public.chats
  WHERE id = p_chat_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'chat_not_found: %', p_chat_id;
  END IF;

  IF v_cached_at IS NULL OR v_gate IS NULL THEN
    RETURN public.evaluate_chat_warmth(p_chat_id);
  END IF;

  RETURN jsonb_build_object(
    'chatId', p_chat_id::text,
    'chatKind', v_kind,
    'showId', to_jsonb(v_show),
    'homeEligible', coalesce(v_eligible, false),
    'gate', v_gate,
    'evaluatedAt', to_jsonb(v_cached_at)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_home_warm_chats(p_limit int DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_items jsonb := '[]'::jsonb;
  v_snap jsonb;
  v_count int := 0;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  FOR r IN
    SELECT c.id
    FROM public.chats c
    WHERE c.chat_kind IN ('scene_persistent', 'featured_show')
       OR c.chat_key IS NOT NULL
    ORDER BY
      CASE WHEN c.warmth_home_eligible IS TRUE THEN 0 ELSE 1 END,
      c.warmth_evaluated_at DESC NULLS LAST,
      c.updated_at DESC NULLS LAST
  LOOP
    v_snap := public.get_chat_warmth_snapshot(r.id, false);
    IF (v_snap->>'homeEligible')::boolean IS TRUE THEN
      v_items := v_items || jsonb_build_array(v_snap);
      v_count := v_count + 1;
      IF v_count >= greatest(1, least(coalesce(p_limit, 5), 15)) THEN
        EXIT;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'items', v_items,
    'fetchedAt', to_jsonb(now())
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Community live-set toggle (demoSeedLive only from published keys)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_demo_seed_live_set(p_chat_keys text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_id uuid;
  v_set text[] := ARRAY[]::text[];
  v_updated uuid[] := ARRAY[]::uuid[];
  v_cleared int := 0;
  v_snap jsonb;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  IF p_chat_keys IS NULL THEN
    p_chat_keys := ARRAY[]::text[];
  END IF;

  -- Normalize / dedupe
  SELECT array_agg(DISTINCT trim(k)) INTO v_set
  FROM unnest(p_chat_keys) AS k
  WHERE length(trim(k)) > 0;

  v_set := coalesce(v_set, ARRAY[]::text[]);

  UPDATE public.chats
  SET demo_seed_live = false,
      updated_at = now()
  WHERE demo_seed_live IS TRUE
    AND (chat_key IS NULL OR NOT (chat_key = ANY (v_set)));

  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  FOREACH v_key IN ARRAY v_set LOOP
    SELECT id INTO v_id FROM public.chats WHERE chat_key = v_key LIMIT 1;
    IF v_id IS NULL THEN
      CONTINUE;
    END IF;
    UPDATE public.chats
    SET demo_seed_live = true,
        updated_at = now()
    WHERE id = v_id;
    v_updated := array_append(v_updated, v_id);
    v_snap := public.evaluate_chat_warmth(v_id);
  END LOOP;

  -- Re-evaluate chats that lost the flag
  FOR v_id IN
    SELECT c.id FROM public.chats c
    WHERE c.chat_kind IN ('scene_persistent', 'featured_show')
      AND c.demo_seed_live IS FALSE
      AND c.warmth_evaluated_at IS NOT NULL
  LOOP
    PERFORM public.evaluate_chat_warmth(v_id);
  END LOOP;

  RETURN jsonb_build_object(
    'liveKeys', to_jsonb(v_set),
    'updatedChatIds', to_jsonb(v_updated),
    'clearedCount', v_cleared,
    'appliedAt', to_jsonb(now())
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_density_featured_show_ids(p_show_ids text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids text[];
  v_id uuid;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  SELECT array_agg(DISTINCT trim(x)) INTO v_ids
  FROM unnest(coalesce(p_show_ids, ARRAY[]::text[])) AS x
  WHERE length(trim(x)) > 0;

  UPDATE public.density_runtime_config
  SET featured_show_ids = coalesce(v_ids, ARRAY[]::text[]),
      updated_at = now()
  WHERE id = 'default';

  FOR v_id IN
    SELECT c.id FROM public.chats c
    WHERE c.chat_kind = 'featured_show'
       OR c.entity_type = 'event'
       OR c.chat_key LIKE 'FIX-SHOW-%'
       OR c.chat_key LIKE 'featured.%'
  LOOP
    PERFORM public.evaluate_chat_warmth(v_id);
  END LOOP;

  RETURN jsonb_build_object(
    'featuredShowIds', to_jsonb(coalesce(v_ids, ARRAY[]::text[])),
    'updatedAt', to_jsonb(now())
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Ensure density scene rooms + fixture show-crew chats (no full event_groups)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_density_chat(
  p_chat_key text,
  p_chat_kind text,
  p_chat_name text,
  p_show_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  SELECT id INTO v_id FROM public.chats WHERE chat_key = p_chat_key LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.chats
    SET chat_kind = p_chat_kind,
        chat_name = coalesce(nullif(chat_name, ''), p_chat_name),
        entity_type = CASE WHEN p_chat_kind = 'featured_show' THEN 'event' ELSE entity_type END,
        entity_id = CASE
          WHEN p_chat_kind = 'featured_show' THEN coalesce(p_show_id, entity_id)
          ELSE entity_id
        END,
        updated_at = now()
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.chats (
    chat_name,
    is_group_chat,
    chat_key,
    chat_kind,
    entity_type,
    entity_id,
    demo_seed_live
  ) VALUES (
    p_chat_name,
    true,
    p_chat_key,
    p_chat_kind,
    CASE WHEN p_chat_kind = 'featured_show' THEN 'event' ELSE NULL END,
    CASE WHEN p_chat_kind = 'featured_show' THEN p_show_id ELSE NULL END,
    false
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_density_demo_chats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids jsonb := '{}'::jsonb;
  v_id uuid;
  i int;
  v_key text;
BEGIN
  v_id := public.ensure_density_chat('scene.this_week_dc', 'scene_persistent', 'This week in DC');
  v_ids := v_ids || jsonb_build_object('scene.this_week_dc', v_id);

  v_id := public.ensure_density_chat('scene.going_out', 'scene_persistent', 'Going out tonight / this weekend');
  v_ids := v_ids || jsonb_build_object('scene.going_out', v_id);

  FOR i IN 1..12 LOOP
    v_key := 'FIX-SHOW-' || lpad(i::text, 2, '0');
    v_id := public.ensure_density_chat(v_key, 'featured_show', 'Show crew · ' || v_key, v_key);
    v_ids := v_ids || jsonb_build_object(v_key, v_id);
  END LOOP;

  RETURN v_ids;
END;
$$;

-- Seed rooms + default live set (P0 scenes + P1/P2 shows 01-05)
DO $$
DECLARE
  v_map jsonb;
BEGIN
  v_map := public.ensure_density_demo_chats();
  PERFORM public.set_demo_seed_live_set(ARRAY[
    'scene.this_week_dc',
    'scene.going_out',
    'FIX-SHOW-01',
    'FIX-SHOW-02',
    'FIX-SHOW-03',
    'FIX-SHOW-04',
    'FIX-SHOW-05'
  ]);
END $$;

-- ---------------------------------------------------------------------------
-- Re-evaluate triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_reevaluate_chat_warmth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id uuid;
  v_sender uuid;
BEGIN
  IF TG_TABLE_NAME = 'chat_participants' THEN
    v_chat_id := coalesce(NEW.chat_id, OLD.chat_id);
  ELSIF TG_TABLE_NAME = 'messages' THEN
    v_chat_id := NEW.chat_id;
    v_sender := NEW.sender_id;
    -- Skip non-human / seed-proxy authors for write path still re-eval (counts ignore them)
    NULL;
  ELSIF TG_TABLE_NAME = 'chats' THEN
    v_chat_id := NEW.id;
    -- Only when demo flag or kind/key/entity changes
    IF TG_OP = 'UPDATE'
       AND NEW.demo_seed_live IS NOT DISTINCT FROM OLD.demo_seed_live
       AND NEW.chat_kind IS NOT DISTINCT FROM OLD.chat_kind
       AND NEW.chat_key IS NOT DISTINCT FROM OLD.chat_key
       AND NEW.entity_uuid IS NOT DISTINCT FROM OLD.entity_uuid
       AND NEW.entity_id IS NOT DISTINCT FROM OLD.entity_id
    THEN
      RETURN NEW;
    END IF;
  ELSE
    RETURN coalesce(NEW, OLD);
  END IF;

  IF v_chat_id IS NOT NULL THEN
    BEGIN
      PERFORM public.evaluate_chat_warmth(v_chat_id);
    EXCEPTION WHEN OTHERS THEN
      -- Never block chat writes on warmth failures
      RAISE WARNING 'evaluate_chat_warmth failed for %: %', v_chat_id, SQLERRM;
    END;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_participants_warmth ON public.chat_participants;
CREATE TRIGGER trg_chat_participants_warmth
  AFTER INSERT OR DELETE OR UPDATE OF user_id, chat_id
  ON public.chat_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_reevaluate_chat_warmth();

DROP TRIGGER IF EXISTS trg_messages_warmth ON public.messages;
CREATE TRIGGER trg_messages_warmth
  AFTER INSERT
  ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_reevaluate_chat_warmth();

DROP TRIGGER IF EXISTS trg_chats_demo_seed_warmth ON public.chats;
CREATE TRIGGER trg_chats_demo_seed_warmth
  AFTER UPDATE OF demo_seed_live, chat_kind, chat_key, entity_uuid, entity_id
  ON public.chats
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_reevaluate_chat_warmth();

-- Featured-set change → re-evaluate featured_show chats (when LOI-566 tables exist)
CREATE OR REPLACE FUNCTION public.trg_reevaluate_warmth_on_featured_set()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT c.id FROM public.chats c
    WHERE c.chat_kind = 'featured_show'
       OR c.entity_type = 'event'
       OR c.chat_key LIKE 'FIX-SHOW-%'
       OR c.chat_key LIKE 'featured.%'
  LOOP
    BEGIN
      PERFORM public.evaluate_chat_warmth(v_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'evaluate_chat_warmth failed for %: %', v_id, SQLERRM;
    END;
  END LOOP;
  RETURN coalesce(NEW, OLD);
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.weekly_featured_sets') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_weekly_featured_sets_warmth ON public.weekly_featured_sets;
    CREATE TRIGGER trg_weekly_featured_sets_warmth
      AFTER INSERT OR UPDATE OR DELETE
      ON public.weekly_featured_sets
      FOR EACH STATEMENT
      EXECUTE FUNCTION public.trg_reevaluate_warmth_on_featured_set();
  END IF;
  IF to_regclass('public.weekly_featured_items') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_weekly_featured_items_warmth ON public.weekly_featured_items;
    CREATE TRIGGER trg_weekly_featured_items_warmth
      AFTER INSERT OR UPDATE OR DELETE
      ON public.weekly_featured_items
      FOR EACH STATEMENT
      EXECUTE FUNCTION public.trg_reevaluate_warmth_on_featured_set();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.evaluate_chat_warmth(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_chat_warmth_snapshot(uuid, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_home_warm_chats(int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_demo_seed_live_set(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_density_featured_show_ids(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_density_demo_chats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_density_chat(text, text, text, text) TO authenticated, service_role;
GRANT SELECT ON public.density_runtime_config TO anon, authenticated;
