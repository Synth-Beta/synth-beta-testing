-- ============================================================
-- LOI-597: Demo warmth product holes
-- Canonical room keys: scene.dc.this_week + scene.dc.going_out
-- Bridges LOI-562 scene rooms + LOI-577 warmth + LOI-566 featured pins
-- ============================================================

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_chats_archived_at
  ON public.chats (archived_at)
  WHERE archived_at IS NOT NULL;

UPDATE public.chats
SET
  entity_type = 'scene',
  entity_id = 'scene.dc.this_week',
  chat_key = 'scene.dc.this_week',
  chat_kind = 'scene_persistent',
  chat_name = COALESCE(NULLIF(chat_name, ''), 'This week in DC'),
  updated_at = now()
WHERE (
  (entity_type IN ('scene', 'genre') AND entity_id IN ('dc-this-week', 'scene.dc.this_week'))
  OR chat_key IN ('dc-this-week', 'scene.this_week_dc', 'scene.dc.this_week')
);

UPDATE public.chats
SET
  entity_type = 'scene',
  entity_id = 'scene.dc.going_out',
  chat_key = 'scene.dc.going_out',
  chat_kind = 'scene_persistent',
  chat_name = COALESCE(NULLIF(chat_name, ''), 'Going out tonight / this weekend'),
  updated_at = now()
WHERE (
  (entity_type IN ('scene', 'genre') AND entity_id IN ('dc-going-out', 'scene.dc.going_out'))
  OR chat_key IN ('dc-going-out', 'scene.going_out', 'scene.dc.going_out')
);

SELECT public.ensure_density_chat('scene.dc.this_week', 'scene_persistent', 'This week in DC');
SELECT public.ensure_density_chat('scene.dc.going_out', 'scene_persistent', 'Going out tonight / this weekend');

UPDATE public.chats
SET entity_type = 'scene', entity_id = chat_key, chat_kind = 'scene_persistent', updated_at = now()
WHERE chat_key IN ('scene.dc.this_week', 'scene.dc.going_out');

CREATE OR REPLACE FUNCTION public.join_scene_by_key(p_chat_key text, p_user_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid; v_chat_id uuid; v_name text;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  uid := COALESCE(p_user_id, auth.uid());
  IF uid IS NULL THEN RAISE EXCEPTION 'join_scene_by_key requires authenticated user' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'join_scene_by_key: cannot join as another user' USING ERRCODE = 'insufficient_privilege';
  END IF;
  p_chat_key := CASE trim(p_chat_key)
    WHEN 'dc-this-week' THEN 'scene.dc.this_week'
    WHEN 'scene.this_week_dc' THEN 'scene.dc.this_week'
    WHEN 'dc-going-out' THEN 'scene.dc.going_out'
    WHEN 'scene.going_out' THEN 'scene.dc.going_out'
    ELSE trim(p_chat_key) END;
  IF p_chat_key NOT IN ('scene.dc.this_week', 'scene.dc.going_out')
     AND p_chat_key NOT LIKE 'featured_show:%' AND p_chat_key NOT LIKE 'FIX-SHOW-%' THEN
    RAISE EXCEPTION 'join_scene_by_key: unsupported chat key %', p_chat_key USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_name := CASE p_chat_key
    WHEN 'scene.dc.this_week' THEN 'This week in DC'
    WHEN 'scene.dc.going_out' THEN 'Going out tonight / this weekend'
    ELSE p_chat_key END;
  IF p_chat_key LIKE 'scene.dc.%' THEN
    v_chat_id := public.ensure_density_chat(p_chat_key, 'scene_persistent', v_name);
    UPDATE public.chats SET entity_type = 'scene', entity_id = p_chat_key, updated_at = now() WHERE id = v_chat_id;
  ELSE
    SELECT id INTO v_chat_id FROM public.chats WHERE chat_key = p_chat_key LIMIT 1;
    IF v_chat_id IS NULL THEN RAISE EXCEPTION 'chat not provisioned for key %', p_chat_key USING ERRCODE = 'no_data_found'; END IF;
  END IF;
  INSERT INTO public.chat_participants (chat_id, user_id, joined_at) VALUES (v_chat_id, uid, now())
  ON CONFLICT (chat_id, user_id) DO NOTHING;
  PERFORM public.evaluate_chat_warmth(v_chat_id);
  RETURN v_chat_id;
END; $$;

CREATE OR REPLACE FUNCTION public.set_chat_seed_live(p_chat_key text, p_live boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text; v_id uuid; v_snap jsonb;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  v_key := CASE trim(p_chat_key)
    WHEN 'dc-this-week' THEN 'scene.dc.this_week' WHEN 'scene.this_week_dc' THEN 'scene.dc.this_week'
    WHEN 'dc-going-out' THEN 'scene.dc.going_out' WHEN 'scene.going_out' THEN 'scene.dc.going_out'
    ELSE trim(p_chat_key) END;
  SELECT id INTO v_id FROM public.chats WHERE chat_key = v_key LIMIT 1;
  IF v_id IS NULL AND v_key LIKE 'scene.dc.%' THEN
    v_id := public.ensure_density_chat(v_key, 'scene_persistent',
      CASE v_key WHEN 'scene.dc.this_week' THEN 'This week in DC' ELSE 'Going out tonight / this weekend' END);
  END IF;
  IF v_id IS NULL THEN RAISE EXCEPTION 'unknown chat_key: %', v_key USING ERRCODE = 'no_data_found'; END IF;
  UPDATE public.chats SET demo_seed_live = coalesce(p_live, false), updated_at = now() WHERE id = v_id;
  v_snap := public.evaluate_chat_warmth(v_id);
  RETURN jsonb_build_object('chatKey', v_key, 'chatId', v_id, 'demoSeedLive', coalesce(p_live, false), 'snapshot', v_snap);
END; $$;

CREATE OR REPLACE FUNCTION public.ensure_density_demo_chats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids jsonb := '{}'::jsonb; v_id uuid; i int; v_key text;
BEGIN
  v_id := public.ensure_density_chat('scene.dc.this_week', 'scene_persistent', 'This week in DC');
  UPDATE public.chats SET entity_type = 'scene', entity_id = 'scene.dc.this_week', updated_at = now() WHERE id = v_id;
  v_ids := v_ids || jsonb_build_object('scene.dc.this_week', v_id);
  v_id := public.ensure_density_chat('scene.dc.going_out', 'scene_persistent', 'Going out tonight / this weekend');
  UPDATE public.chats SET entity_type = 'scene', entity_id = 'scene.dc.going_out', updated_at = now() WHERE id = v_id;
  v_ids := v_ids || jsonb_build_object('scene.dc.going_out', v_id);
  FOR i IN 1..12 LOOP
    v_key := 'FIX-SHOW-' || lpad(i::text, 2, '0');
    v_id := public.ensure_density_chat(v_key, 'featured_show', 'Show crew · ' || v_key, v_key);
    v_ids := v_ids || jsonb_build_object(v_key, v_id);
  END LOOP;
  RETURN v_ids;
END; $$;

SELECT public.ensure_density_demo_chats();
SELECT public.set_demo_seed_live_set(ARRAY[
  'scene.dc.this_week','scene.dc.going_out','FIX-SHOW-01','FIX-SHOW-02','FIX-SHOW-03','FIX-SHOW-04','FIX-SHOW-05'
]);

CREATE OR REPLACE FUNCTION public.ensure_featured_show_chat(p_week_id text, p_event_id uuid, p_chat_name text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text; v_id uuid; v_name text; v_title text;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  IF p_week_id IS NULL OR p_event_id IS NULL THEN RAISE EXCEPTION 'week_id and event_id required'; END IF;
  v_key := 'featured_show:' || p_week_id || ':' || p_event_id::text;
  SELECT coalesce(nullif(title, ''), nullif(artist_name, ''), 'Show crew') INTO v_title FROM public.events WHERE id = p_event_id;
  v_name := coalesce(nullif(trim(p_chat_name), ''), 'Show crew · ' || coalesce(v_title, p_event_id::text));
  v_id := public.ensure_density_chat(v_key, 'featured_show', v_name, p_event_id::text);
  UPDATE public.chats SET entity_type = 'event', entity_id = p_event_id::text, entity_uuid = p_event_id,
    chat_kind = 'featured_show', archived_at = NULL, updated_at = now() WHERE id = v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_featured_show_chats_for_week(p_week_id text DEFAULT NULL, p_metro text DEFAULT 'dc')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_week text; r record; v_id uuid; v_map jsonb := '{}'::jsonb; v_count int := 0;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  v_week := coalesce(nullif(trim(p_week_id), ''), public.dc_week_id(now()));
  FOR r IN
    SELECT s.week_id, i.event_id, e.title, e.artist_name
    FROM public.weekly_featured_sets s
    JOIN public.weekly_featured_items i ON i.set_id = s.id
    LEFT JOIN public.events e ON e.id = i.event_id
    WHERE s.metro = coalesce(p_metro, 'dc') AND s.week_id = v_week AND s.status = 'published'
    ORDER BY i.position
  LOOP
    v_id := public.ensure_featured_show_chat(r.week_id, r.event_id,
      'Show crew · ' || coalesce(nullif(r.title, ''), nullif(r.artist_name, ''), r.event_id::text));
    v_map := v_map || jsonb_build_object(('featured_show:' || r.week_id || ':' || r.event_id::text), v_id);
    v_count := v_count + 1;
    PERFORM public.evaluate_chat_warmth(v_id);
  END LOOP;
  RETURN jsonb_build_object('weekId', v_week, 'provisionedCount', v_count, 'chats', v_map);
END; $$;

CREATE OR REPLACE FUNCTION public.is_show_in_featured_set(p_show_id text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids text[]; v_exists boolean;
BEGIN
  IF p_show_id IS NULL OR length(trim(p_show_id)) = 0 THEN RETURN false; END IF;
  PERFORM set_config('row_security', 'off', true);
  SELECT EXISTS (
    SELECT 1 FROM public.weekly_featured_sets s
    JOIN public.weekly_featured_items i ON i.set_id = s.id
    WHERE s.status = 'published' AND s.metro = 'dc'
      AND (i.event_id::text = p_show_id OR ('featured_show:' || s.week_id || ':' || i.event_id::text) = p_show_id)
      AND s.week_start_date = public.dc_week_start(now())
  ) INTO v_exists;
  IF coalesce(v_exists, false) THEN RETURN true; END IF;
  SELECT c.featured_show_ids INTO v_ids FROM public.density_runtime_config c WHERE c.id = 'default';
  IF v_ids IS NOT NULL AND p_show_id = ANY (v_ids) THEN RETURN true; END IF;
  RETURN false;
END; $$;

CREATE OR REPLACE FUNCTION public.archive_featured_show_chats_past_doors(p_as_of timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids uuid[] := ARRAY[]::uuid[]; r record;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  FOR r IN
    SELECT c.id FROM public.chats c
    JOIN public.events e ON e.id = coalesce(c.entity_uuid, NULLIF(c.entity_id, '')::uuid)
    WHERE c.chat_kind = 'featured_show' AND c.archived_at IS NULL
      AND e.event_date IS NOT NULL AND e.event_date + interval '48 hours' <= p_as_of
  LOOP
    UPDATE public.chats SET archived_at = p_as_of, warmth_home_eligible = false, demo_seed_live = false, updated_at = p_as_of WHERE id = r.id;
    v_ids := array_append(v_ids, r.id);
  END LOOP;
  RETURN jsonb_build_object('archivedChatIds', to_jsonb(v_ids), 'archivedCount', coalesce(array_length(v_ids, 1), 0), 'asOf', to_jsonb(p_as_of));
END; $$;

CREATE OR REPLACE FUNCTION public.get_home_warm_chats(p_limit int DEFAULT 5)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_items jsonb := '[]'::jsonb; v_snap jsonb; v_count int := 0;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  PERFORM public.archive_featured_show_chats_past_doors(now());
  FOR r IN
    SELECT c.id FROM public.chats c
    WHERE c.archived_at IS NULL AND (c.chat_kind IN ('scene_persistent', 'featured_show') OR c.chat_key IS NOT NULL)
    ORDER BY CASE WHEN c.warmth_home_eligible IS TRUE THEN 0 ELSE 1 END,
      c.warmth_evaluated_at DESC NULLS LAST, c.updated_at DESC NULLS LAST
  LOOP
    v_snap := public.get_chat_warmth_snapshot(r.id, false);
    IF (v_snap->>'homeEligible')::boolean IS TRUE THEN
      v_items := v_items || jsonb_build_array(v_snap);
      v_count := v_count + 1;
      IF v_count >= greatest(1, least(coalesce(p_limit, 5), 15)) THEN EXIT; END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('items', v_items, 'fetchedAt', to_jsonb(now()));
END; $$;

CREATE OR REPLACE FUNCTION public.set_user_seed_proxy(p_user_id uuid, p_is_proxy boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('row_security', 'off', true);
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'p_user_id required'; END IF;
  UPDATE public.users SET is_seed_proxy = coalesce(p_is_proxy, false) WHERE user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found: %', p_user_id USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.evaluate_chat_warmth(cp.chat_id) FROM public.chat_participants cp WHERE cp.user_id = p_user_id;
  RETURN jsonb_build_object('userId', p_user_id, 'isSeedProxy', coalesce(p_is_proxy, false));
END; $$;

CREATE OR REPLACE FUNCTION public.get_demo_warmth_room_directory()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_scenes jsonb := '[]'::jsonb; v_shows jsonb := '[]'::jsonb; r record;
BEGIN
  PERFORM set_config('row_security', 'off', true);
  PERFORM public.ensure_density_demo_chats();
  BEGIN PERFORM public.sync_featured_show_chats_for_week(NULL, 'dc'); EXCEPTION WHEN OTHERS THEN NULL; END;
  FOR r IN SELECT c.id, c.chat_key, c.chat_name, c.demo_seed_live, c.warmth_home_eligible, c.chat_kind
    FROM public.chats c WHERE c.chat_key IN ('scene.dc.this_week', 'scene.dc.going_out') ORDER BY c.chat_key
  LOOP
    v_scenes := v_scenes || jsonb_build_array(jsonb_build_object(
      'chatId', r.id, 'chatKey', r.chat_key, 'chatName', r.chat_name,
      'demoSeedLive', r.demo_seed_live, 'homeEligible', coalesce(r.warmth_home_eligible, false), 'chatKind', r.chat_kind));
  END LOOP;
  FOR r IN SELECT c.id, c.chat_key, c.chat_name, c.demo_seed_live, c.warmth_home_eligible, c.chat_kind
    FROM public.chats c WHERE c.chat_kind = 'featured_show' AND c.archived_at IS NULL
      AND (c.chat_key LIKE 'featured_show:%' OR c.chat_key LIKE 'FIX-SHOW-%')
    ORDER BY c.chat_key LIMIT 20
  LOOP
    v_shows := v_shows || jsonb_build_array(jsonb_build_object(
      'chatId', r.id, 'chatKey', r.chat_key, 'chatName', r.chat_name,
      'demoSeedLive', r.demo_seed_live, 'homeEligible', coalesce(r.warmth_home_eligible, false), 'chatKind', r.chat_kind));
  END LOOP;
  RETURN jsonb_build_object('scenes', v_scenes, 'featuredShowChats', v_shows, 'fetchedAt', to_jsonb(now()));
END; $$;

GRANT EXECUTE ON FUNCTION public.join_scene_by_key(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_chat_seed_live(text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_featured_show_chat(text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_featured_show_chats_for_week(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_featured_show_chats_past_doors(timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_user_seed_proxy(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_demo_warmth_room_directory() TO anon, authenticated, service_role;
