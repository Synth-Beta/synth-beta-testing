-- Persistent product scenes SoT (LOI-589)
-- Locked IDs: scene.dc.this_week (required) + scene.dc.going_out (optional).
-- Third active scene blocked until Room 1 warmth holds 2 consecutive DC weeks.
-- Exposes live member counts + warmth / co-presence for Home, Messages, onboarding.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Allow entity_type = 'scene' for product rooms (distinct from cultural scenes table)
ALTER TABLE public.chats
  DROP CONSTRAINT IF EXISTS chats_entity_type_check;

ALTER TABLE public.chats
  ADD CONSTRAINT chats_entity_type_check
  CHECK (
    entity_type IS NULL
    OR entity_type IN ('event', 'artist', 'venue', 'genre', 'scene')
  );

-- Optional warmth-compat columns (no-op if LOI-577 already added them)
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS chat_key text;
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS chat_kind text;
ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS demo_seed_live boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chats_chat_kind_check'
  ) THEN
    ALTER TABLE public.chats
      ADD CONSTRAINT chats_chat_kind_check
      CHECK (chat_kind IS NULL OR chat_kind IN ('scene_persistent', 'featured_show'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_chat_key_unique
  ON public.chats (chat_key)
  WHERE chat_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_scenes (
  id text PRIMARY KEY
    CHECK (id ~ '^scene\.[a-z0-9_]+\.[a-z0-9_]+$'),
  metro text NOT NULL DEFAULT 'dc' CHECK (metro = 'dc'),
  display_name text NOT NULL,
  join_mode text NOT NULL CHECK (join_mode IN ('required', 'optional')),
  sort_order int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  chat_id uuid REFERENCES public.chats(id) ON DELETE SET NULL,
  seed_live boolean NOT NULL DEFAULT false,
  seed_live_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_scenes_metro_sort_uidx
  ON public.product_scenes (metro, sort_order)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS product_scenes_chat_id_idx
  ON public.product_scenes (chat_id)
  WHERE chat_id IS NOT NULL;

COMMENT ON TABLE public.product_scenes IS
  'Product-owned persistent scene rooms (LOI-589). Shared SoT for Home, Discover, Messages, onboarding.';

CREATE TABLE IF NOT EXISTS public.product_scene_launch_gate (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  room1_scene_id text NOT NULL DEFAULT 'scene.dc.this_week',
  consecutive_warm_weeks int NOT NULL DEFAULT 0 CHECK (consecutive_warm_weeks >= 0),
  last_recorded_week_id text,
  third_scene_unlocked boolean NOT NULL DEFAULT false,
  third_scene_unlocked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_scene_launch_gate IS
  'Unlocks a 3rd persistent product scene only after Room 1 warmth holds 2 consecutive DC weeks.';

INSERT INTO public.product_scenes (id, metro, display_name, join_mode, sort_order, is_active)
VALUES
  ('scene.dc.this_week', 'dc', 'This week in DC', 'required', 1, true),
  ('scene.dc.going_out', 'dc', 'Going out tonight / this weekend', 'optional', 2, true)
ON CONFLICT (id) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  join_mode = EXCLUDED.join_mode,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.product_scene_launch_gate (id, room1_scene_id, consecutive_warm_weeks, third_scene_unlocked)
VALUES (1, 'scene.dc.this_week', 0, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.product_scene_launch_gate
  DROP CONSTRAINT IF EXISTS product_scene_launch_gate_room1_scene_id_fkey;
ALTER TABLE public.product_scene_launch_gate
  ADD CONSTRAINT product_scene_launch_gate_room1_scene_id_fkey
  FOREIGN KEY (room1_scene_id) REFERENCES public.product_scenes(id);

CREATE UNIQUE INDEX IF NOT EXISTS chats_scene_entity_uidx
  ON public.chats (entity_id)
  WHERE entity_type = 'scene'
    AND is_group_chat IS TRUE
    AND entity_id IS NOT NULL;

-- Cap active scenes at 2 until gate unlocks
CREATE OR REPLACE FUNCTION public.enforce_product_scene_active_cap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  active_count int;
  unlocked boolean;
BEGIN
  IF NEW.is_active IS DISTINCT FROM TRUE THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  SELECT third_scene_unlocked INTO unlocked
  FROM public.product_scene_launch_gate WHERE id = 1;

  SELECT count(*)::int INTO active_count
  FROM public.product_scenes
  WHERE is_active AND id IS DISTINCT FROM NEW.id;

  IF active_count >= 2 AND COALESCE(unlocked, false) IS NOT TRUE THEN
    RAISE EXCEPTION
      'third persistent product scene blocked until Room 1 warmth holds 2 consecutive weeks (LOI-589)'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_scenes_active_cap ON public.product_scenes;
CREATE TRIGGER trg_product_scenes_active_cap
  BEFORE INSERT OR UPDATE OF is_active ON public.product_scenes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_product_scene_active_cap();

-- DC ICP helpers
CREATE OR REPLACE FUNCTION public.is_dc_location_city(p_city text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_city IS NULL OR length(trim(p_city)) = 0 THEN false
    ELSE (
      lower(trim(p_city)) IN (
        'dc','washington','washington dc','washington, dc',
        'washington d.c.','washington d.c','washington, d.c.',
        'district of columbia','washington, d.c'
      )
      OR lower(trim(p_city)) LIKE 'washington%dc%'
      OR lower(trim(p_city)) LIKE '%district of columbia%'
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_dc_icp_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = p_user_id
      AND public.is_dc_location_city(u.location_city)
      AND u.birthday IS NOT NULL
      AND EXTRACT(YEAR FROM age(u.birthday::date)) BETWEEN 20 AND 27
  );
$$;

-- Remap legacy aliases → locked product ids
CREATE OR REPLACE FUNCTION public.remap_legacy_product_scene_chats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('row_security', 'off', true);

  -- Prefer keeping locked-id row; retire legacy aliases by re-pointing entity_id when free
  UPDATE public.chats c
  SET
    entity_type = 'scene',
    entity_id = 'scene.dc.this_week',
    chat_key = 'scene.dc.this_week',
    chat_kind = 'scene_persistent',
    chat_name = COALESCE(NULLIF(trim(c.chat_name), ''), 'This week in DC'),
    is_verified = true
  WHERE c.is_group_chat IS TRUE
    AND (
      (c.entity_type IN ('genre', 'scene') AND c.entity_id IN ('dc-this-week', 'scene.this_week_dc'))
      OR c.chat_key IN ('dc-this-week', 'scene.this_week_dc')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.chats x
      WHERE x.entity_type = 'scene'
        AND x.entity_id = 'scene.dc.this_week'
        AND x.id IS DISTINCT FROM c.id
    );

  UPDATE public.chats c
  SET
    entity_type = 'scene',
    entity_id = 'scene.dc.going_out',
    chat_key = 'scene.dc.going_out',
    chat_kind = 'scene_persistent',
    chat_name = COALESCE(NULLIF(trim(c.chat_name), ''), 'Going out tonight / this weekend'),
    is_verified = true
  WHERE c.is_group_chat IS TRUE
    AND (
      (c.entity_type IN ('genre', 'scene') AND c.entity_id IN ('dc-going-out', 'scene.going_out'))
      OR c.chat_key IN ('dc-going-out', 'scene.going_out')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.chats x
      WHERE x.entity_type = 'scene'
        AND x.entity_id = 'scene.dc.going_out'
        AND x.id IS DISTINCT FROM c.id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_product_scene_chats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  new_chat_id uuid;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  PERFORM public.remap_legacy_product_scene_chats();

  FOR r IN
    SELECT id, display_name, chat_id, seed_live
    FROM public.product_scenes
    WHERE is_active
    ORDER BY sort_order
  LOOP
    IF r.chat_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.chats c WHERE c.id = r.chat_id) THEN
      UPDATE public.chats
      SET
        entity_type = 'scene',
        entity_id = r.id,
        chat_key = r.id,
        chat_kind = 'scene_persistent',
        demo_seed_live = COALESCE(r.seed_live, demo_seed_live),
        is_verified = true,
        chat_name = COALESCE(NULLIF(trim(chat_name), ''), r.display_name)
      WHERE id = r.chat_id;
      CONTINUE;
    END IF;

    SELECT c.id INTO new_chat_id
    FROM public.chats c
    WHERE c.entity_type = 'scene'
      AND c.entity_id = r.id
      AND c.is_group_chat IS TRUE
    LIMIT 1;

    IF new_chat_id IS NULL THEN
      INSERT INTO public.chats (
        chat_name, is_group_chat, entity_type, entity_id,
        is_verified, chat_key, chat_kind, demo_seed_live, last_activity_at
      )
      VALUES (
        r.display_name, true, 'scene', r.id,
        true, r.id, 'scene_persistent', COALESCE(r.seed_live, false), now()
      )
      RETURNING id INTO new_chat_id;
    END IF;

    UPDATE public.product_scenes
    SET chat_id = new_chat_id, updated_at = now()
    WHERE id = r.id AND chat_id IS DISTINCT FROM new_chat_id;
  END LOOP;
END;
$$;

SELECT public.ensure_product_scene_chats();

CREATE OR REPLACE FUNCTION public.record_product_scene_warmth_week(
  p_scene_id text,
  p_week_id text,
  p_passed boolean
)
RETURNS TABLE (
  consecutive_warm_weeks int,
  third_scene_unlocked boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gate public.product_scene_launch_gate%ROWTYPE;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  SELECT * INTO gate FROM public.product_scene_launch_gate WHERE id = 1 FOR UPDATE;

  IF gate.room1_scene_id IS DISTINCT FROM p_scene_id THEN
    RETURN QUERY SELECT gate.consecutive_warm_weeks, gate.third_scene_unlocked;
    RETURN;
  END IF;

  IF gate.last_recorded_week_id IS NOT DISTINCT FROM p_week_id THEN
    RETURN QUERY SELECT gate.consecutive_warm_weeks, gate.third_scene_unlocked;
    RETURN;
  END IF;

  IF p_passed THEN
    gate.consecutive_warm_weeks := gate.consecutive_warm_weeks + 1;
  ELSE
    gate.consecutive_warm_weeks := 0;
  END IF;

  gate.last_recorded_week_id := p_week_id;
  gate.updated_at := now();

  IF gate.consecutive_warm_weeks >= 2 AND gate.third_scene_unlocked IS NOT TRUE THEN
    gate.third_scene_unlocked := true;
    gate.third_scene_unlocked_at := now();
  END IF;

  UPDATE public.product_scene_launch_gate
  SET
    consecutive_warm_weeks = gate.consecutive_warm_weeks,
    last_recorded_week_id = gate.last_recorded_week_id,
    third_scene_unlocked = gate.third_scene_unlocked,
    third_scene_unlocked_at = gate.third_scene_unlocked_at,
    updated_at = gate.updated_at
  WHERE id = 1;

  RETURN QUERY SELECT gate.consecutive_warm_weeks, gate.third_scene_unlocked;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_persistent_product_scenes(
  p_metro text DEFAULT 'dc',
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  scene_id text,
  display_name text,
  join_mode text,
  sort_order int,
  metro text,
  chat_id uuid,
  member_count int,
  active_member_count int,
  dc_icp_member_count int,
  human_msgs_24h int,
  seed_live boolean,
  passes_warmth_gate boolean,
  is_user_member boolean,
  co_presence_count int,
  third_scene_unlocked boolean,
  consecutive_warm_weeks int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  unlocked boolean;
  streak int;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  PERFORM public.ensure_product_scene_chats();

  uid := COALESCE(p_user_id, auth.uid());

  SELECT g.third_scene_unlocked, g.consecutive_warm_weeks
  INTO unlocked, streak
  FROM public.product_scene_launch_gate g WHERE g.id = 1;

  RETURN QUERY
  WITH scenes AS (
    SELECT ps.* FROM public.product_scenes ps
    WHERE ps.metro = p_metro AND ps.is_active
  ),
  members AS (
    SELECT
      s.id AS scene_id,
      count(cp.user_id)::int AS member_count,
      count(cp.user_id) FILTER (WHERE public.is_dc_icp_user(cp.user_id))::int AS dc_icp_member_count,
      count(cp.user_id) FILTER (
        WHERE public.is_dc_icp_user(cp.user_id)
          AND (
            EXISTS (
              SELECT 1 FROM public.messages m
              WHERE m.chat_id = s.chat_id
                AND m.sender_id = cp.user_id
                AND COALESCE(m.author_type, 'human') = 'human'
                AND m.created_at >= now() - interval '7 days'
            )
            OR EXISTS (
              SELECT 1 FROM public.users u
              WHERE u.user_id = cp.user_id
                AND u.last_active_at >= now() - interval '7 days'
            )
            OR cp.joined_at >= now() - interval '7 days'
          )
      )::int AS active_member_count
    FROM scenes s
    LEFT JOIN public.chat_participants cp ON cp.chat_id = s.chat_id
    GROUP BY s.id
  ),
  msgs AS (
    SELECT
      s.id AS scene_id,
      count(m.id)::int AS human_msgs_24h
    FROM scenes s
    LEFT JOIN public.messages m
      ON m.chat_id = s.chat_id
     AND COALESCE(m.author_type, 'human') = 'human'
     AND m.created_at >= now() - interval '24 hours'
    GROUP BY s.id
  ),
  membership AS (
    SELECT
      s.id AS scene_id,
      EXISTS (
        SELECT 1 FROM public.chat_participants cp
        WHERE cp.chat_id = s.chat_id AND uid IS NOT NULL AND cp.user_id = uid
      ) AS is_user_member,
      (
        SELECT count(cp.user_id)::int
        FROM public.chat_participants cp
        WHERE cp.chat_id = s.chat_id
          AND public.is_dc_icp_user(cp.user_id)
          AND (uid IS NULL OR cp.user_id IS DISTINCT FROM uid)
      ) AS co_presence_count
    FROM scenes s
  )
  SELECT
    s.id,
    s.display_name,
    s.join_mode,
    s.sort_order,
    s.metro,
    s.chat_id,
    COALESCE(mb.member_count, 0),
    COALESCE(mb.active_member_count, 0),
    COALESCE(mb.dc_icp_member_count, 0),
    COALESCE(ms.human_msgs_24h, 0),
    COALESCE(s.seed_live, false) OR COALESCE((SELECT c.demo_seed_live FROM public.chats c WHERE c.id = s.chat_id), false),
    (
      COALESCE(mb.dc_icp_member_count, 0) >= 8
      AND (
        COALESCE(ms.human_msgs_24h, 0) >= 3
        OR COALESCE(s.seed_live, false)
        OR COALESCE((SELECT c.demo_seed_live FROM public.chats c WHERE c.id = s.chat_id), false)
      )
    ),
    COALESCE(mm.is_user_member, false),
    COALESCE(mm.co_presence_count, 0),
    COALESCE(unlocked, false),
    COALESCE(streak, 0)
  FROM scenes s
  LEFT JOIN members mb ON mb.scene_id = s.id
  LEFT JOIN msgs ms ON ms.scene_id = s.id
  LEFT JOIN membership mm ON mm.scene_id = s.id
  ORDER BY s.sort_order ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_product_scene_member_counts(
  p_metro text DEFAULT 'dc'
)
RETURNS TABLE (
  scene_id text,
  chat_id uuid,
  member_count int,
  active_member_count int,
  dc_icp_member_count int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT scene_id, chat_id, member_count, active_member_count, dc_icp_member_count
  FROM public.get_persistent_product_scenes(p_metro, NULL);
$$;

CREATE OR REPLACE FUNCTION public.join_product_scene(
  p_scene_id text,
  p_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  scene public.product_scenes%ROWTYPE;
  v_chat_id uuid;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  uid := COALESCE(p_user_id, auth.uid());
  IF uid IS NULL THEN
    RAISE EXCEPTION 'join_product_scene requires authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'join_product_scene: cannot join as another user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public.ensure_product_scene_chats();

  SELECT * INTO scene FROM public.product_scenes WHERE id = p_scene_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown or inactive product scene: %', p_scene_id
      USING ERRCODE = 'no_data_found';
  END IF;

  v_chat_id := scene.chat_id;
  IF v_chat_id IS NULL THEN
    RAISE EXCEPTION 'product scene chat not provisioned: %', p_scene_id;
  END IF;

  INSERT INTO public.chat_participants (chat_id, user_id, joined_at)
  VALUES (v_chat_id, uid, now())
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  RETURN v_chat_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_product_scene_co_presence(
  p_scene_id text DEFAULT 'scene.dc.this_week',
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  scene_id text,
  chat_id uuid,
  co_presence_count int,
  meets_session_one_threshold boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  v_chat_id uuid;
  c int;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  PERFORM public.ensure_product_scene_chats();
  uid := COALESCE(p_user_id, auth.uid());

  SELECT ps.chat_id INTO v_chat_id
  FROM public.product_scenes ps
  WHERE ps.id = p_scene_id AND ps.is_active;

  IF v_chat_id IS NULL THEN
    RETURN QUERY SELECT p_scene_id, NULL::uuid, 0, false;
    RETURN;
  END IF;

  SELECT count(cp.user_id)::int INTO c
  FROM public.chat_participants cp
  WHERE cp.chat_id = v_chat_id
    AND public.is_dc_icp_user(cp.user_id)
    AND (uid IS NULL OR cp.user_id IS DISTINCT FROM uid);

  RETURN QUERY SELECT p_scene_id, v_chat_id, COALESCE(c, 0), COALESCE(c, 0) >= 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_dc_location_city(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_dc_icp_user(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_product_scene_chats() TO service_role;
GRANT EXECUTE ON FUNCTION public.record_product_scene_warmth_week(text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_persistent_product_scenes(text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_product_scene_member_counts(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_product_scene(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_product_scene_co_presence(text, uuid) TO anon, authenticated, service_role;

ALTER TABLE public.product_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_scene_launch_gate ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read product scenes" ON public.product_scenes;
CREATE POLICY "Anyone can read product scenes"
  ON public.product_scenes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage product scenes" ON public.product_scenes;
CREATE POLICY "Admins manage product scenes"
  ON public.product_scenes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = (SELECT auth.uid()) AND u.account_type = 'admin'::account_type))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = (SELECT auth.uid()) AND u.account_type = 'admin'::account_type));

DROP POLICY IF EXISTS "Anyone can read product scene launch gate" ON public.product_scene_launch_gate;
CREATE POLICY "Anyone can read product scene launch gate"
  ON public.product_scene_launch_gate FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage product scene launch gate" ON public.product_scene_launch_gate;
CREATE POLICY "Admins manage product scene launch gate"
  ON public.product_scene_launch_gate FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = (SELECT auth.uid()) AND u.account_type = 'admin'::account_type))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = (SELECT auth.uid()) AND u.account_type = 'admin'::account_type));
