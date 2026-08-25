-- ============================================================
-- LOI-598: Enroll wave-1 seed proxies into demo-week live-set chats
-- Depends on: 20260825130000_chat_warmth_evaluator.sql
-- Roster: LOI-579 invite-wave-1 · Contract: LOI-561 warmth v1
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Deterministic UUID for a seed-proxy handle (stable across re-runs).
CREATE OR REPLACE FUNCTION public.seed_proxy_user_id(p_handle text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    substr(md5('synth.demo.seed.proxy.v1:' || lower(trim(p_handle))), 1, 8) || '-' ||
    substr(md5('synth.demo.seed.proxy.v1:' || lower(trim(p_handle))), 9, 4) || '-' ||
    '4' || substr(md5('synth.demo.seed.proxy.v1:' || lower(trim(p_handle))), 13, 3) || '-' ||
    'a' || substr(md5('synth.demo.seed.proxy.v1:' || lower(trim(p_handle))), 17, 3) || '-' ||
    substr(md5('synth.demo.seed.proxy.v1:' || lower(trim(p_handle))), 21, 12)
  )::uuid;
$$;

-- Ensure auth + public.users row flagged is_seed_proxy=true (demo week only).
CREATE OR REPLACE FUNCTION public.ensure_seed_proxy_user(p_handle text, p_crew text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_handle text := lower(trim(p_handle));
  v_id uuid;
  v_email text;
  v_name text;
  v_instance uuid;
BEGIN
  IF v_handle IS NULL OR length(v_handle) = 0 THEN
    RAISE EXCEPTION 'seed proxy handle required';
  END IF;

  PERFORM set_config('row_security', 'off', true);

  v_id := public.seed_proxy_user_id(v_handle);
  v_email := 'seed+' || replace(v_handle, '.', '-') || '@demo.getsynth.internal';
  v_name := initcap(replace(replace(v_handle, '.', ' '), '-', ' '));

  SELECT id INTO v_instance FROM auth.instances LIMIT 1;
  IF v_instance IS NULL THEN
    v_instance := '00000000-0000-0000-0000-000000000000'::uuid;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_id) THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      v_instance,
      v_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(encode(gen_random_bytes(16), 'hex'), gen_salt('bf')),
      now(),
      jsonb_build_object(
        'provider', 'email',
        'providers', jsonb_build_array('email'),
        'is_seed_proxy', true,
        'demo_week_crew', p_crew
      ),
      jsonb_build_object(
        'username', v_handle,
        'name', v_name,
        'preferred_username', v_handle,
        'is_seed_proxy', true
      ),
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      v_id,
      v_id,
      jsonb_build_object('sub', v_id::text, 'email', v_email),
      'email',
      v_id::text,
      now(),
      now(),
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Trigger may have created public.users; upsert seed-proxy flags + DC ICP tags.
  INSERT INTO public.users (
    user_id,
    name,
    username,
    email,
    account_type,
    is_public_profile,
    location_city,
    location_state,
    birthday,
    is_seed_proxy,
    is_bot,
    created_at,
    updated_at
  ) VALUES (
    v_id,
    v_name,
    v_handle,
    v_email,
    'user',
    true,
    'Washington',
    'DC',
    (CURRENT_DATE - interval '23 years')::date,
    true,
    false,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    name = EXCLUDED.name,
    username = EXCLUDED.username,
    email = coalesce(public.users.email, EXCLUDED.email),
    location_city = 'Washington',
    location_state = 'DC',
    birthday = coalesce(public.users.birthday, EXCLUDED.birthday),
    is_seed_proxy = true,
    is_bot = false,
    updated_at = now();

  RETURN v_id;
END;
$$;

-- Join a seed proxy into a chat by chat_key (idempotent).
CREATE OR REPLACE FUNCTION public.seed_proxy_join_chat(p_user_id uuid, p_chat_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id uuid;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  SELECT id INTO v_chat_id FROM public.chats WHERE chat_key = p_chat_key LIMIT 1;
  IF v_chat_id IS NULL THEN
    RAISE EXCEPTION 'chat_key not found: %', p_chat_key;
  END IF;

  INSERT INTO public.chat_participants (chat_id, user_id, joined_at)
  VALUES (v_chat_id, p_user_id, now())
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  RETURN v_chat_id;
END;
$$;

-- Full wave-1 enrollment per LOI-579 landing map. Standby seats are created+flagged but not joined.
CREATE OR REPLACE FUNCTION public.enroll_wave1_seed_proxies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host text[] := ARRAY['host.dc.maya', 'host.dc.jordan', 'host.dc.riley'];
  v_scene_a text[] := ARRAY[
    'crew.a.01','crew.a.02','crew.a.03','crew.a.04','crew.a.05',
    'crew.a.06','crew.a.07','crew.a.08','crew.a.09','crew.a.10'
  ];
  v_scene_b text[] := ARRAY[
    'crew.b.01','crew.b.02','crew.b.03','crew.b.04','crew.b.05',
    'crew.b.06','crew.b.07','crew.b.08','crew.b.09','crew.b.10'
  ];
  v_depth text[] := ARRAY[
    'depth.01','depth.02','depth.03','depth.04',
    'depth.05','depth.06','depth.07','depth.08'
  ];
  v_standby text[] := ARRAY[
    'standby.01','standby.02','standby.03','standby.04','standby.05'
  ];
  v_live text[] := ARRAY[
    'scene.this_week_dc',
    'scene.going_out',
    'FIX-SHOW-01',
    'FIX-SHOW-02',
    'FIX-SHOW-03',
    'FIX-SHOW-04',
    'FIX-SHOW-05'
  ];
  v_handle text;
  v_uid uuid;
  v_chat text;
  v_room jsonb;
  v_rooms jsonb := '[]'::jsonb;
  v_snap jsonb;
  v_chat_id uuid;
  v_seed jsonb;
  v_map jsonb;
  v_created int := 0;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  -- Ensure density rooms exist (scene + FIX-SHOW-01..12).
  v_map := public.ensure_density_demo_chats();

  -- Host → all live chats
  FOREACH v_handle IN ARRAY v_host LOOP
    v_uid := public.ensure_seed_proxy_user(v_handle, 'host');
    v_created := v_created + 1;
    FOREACH v_chat IN ARRAY v_live LOOP
      PERFORM public.seed_proxy_join_chat(v_uid, v_chat);
    END LOOP;
  END LOOP;

  -- Scene A → this_week_dc + FIX-SHOW-01/02
  FOREACH v_handle IN ARRAY v_scene_a LOOP
    v_uid := public.ensure_seed_proxy_user(v_handle, 'scene_a');
    v_created := v_created + 1;
    PERFORM public.seed_proxy_join_chat(v_uid, 'scene.this_week_dc');
    PERFORM public.seed_proxy_join_chat(v_uid, 'FIX-SHOW-01');
    PERFORM public.seed_proxy_join_chat(v_uid, 'FIX-SHOW-02');
  END LOOP;

  -- Scene B → going_out + FIX-SHOW-04/05
  FOREACH v_handle IN ARRAY v_scene_b LOOP
    v_uid := public.ensure_seed_proxy_user(v_handle, 'scene_b');
    v_created := v_created + 1;
    PERFORM public.seed_proxy_join_chat(v_uid, 'scene.going_out');
    PERFORM public.seed_proxy_join_chat(v_uid, 'FIX-SHOW-04');
    PERFORM public.seed_proxy_join_chat(v_uid, 'FIX-SHOW-05');
  END LOOP;

  -- Show-depth → FIX-SHOW-01/02/03 only
  FOREACH v_handle IN ARRAY v_depth LOOP
    v_uid := public.ensure_seed_proxy_user(v_handle, 'show_depth');
    v_created := v_created + 1;
    PERFORM public.seed_proxy_join_chat(v_uid, 'FIX-SHOW-01');
    PERFORM public.seed_proxy_join_chat(v_uid, 'FIX-SHOW-02');
    PERFORM public.seed_proxy_join_chat(v_uid, 'FIX-SHOW-03');
  END LOOP;

  -- Standby → flag only; do not join until Community pages
  FOREACH v_handle IN ARRAY v_standby LOOP
    v_uid := public.ensure_seed_proxy_user(v_handle, 'standby');
    v_created := v_created + 1;
  END LOOP;

  -- demoSeedLive=true on live-set keys only
  v_seed := public.set_demo_seed_live_set(v_live);

  -- Seat counts + warmth snapshot per live room
  FOREACH v_chat IN ARRAY v_live LOOP
    SELECT id INTO v_chat_id FROM public.chats WHERE chat_key = v_chat LIMIT 1;
    v_snap := public.evaluate_chat_warmth(v_chat_id);
    v_room := jsonb_build_object(
      'chatKey', v_chat,
      'chatId', v_chat_id,
      'dcIcpMemberCount', (v_snap->'gate'->>'dcIcpMemberCount')::int,
      'demoSeedLive', (v_snap->'gate'->>'demoSeedLive')::boolean,
      'homeEligible', (v_snap->>'homeEligible')::boolean,
      'membersOk', ((v_snap->'gate'->>'dcIcpMemberCount')::int >= 8)
    );
    v_rooms := v_rooms || jsonb_build_array(v_room);
  END LOOP;

  RETURN jsonb_build_object(
    'wave', 1,
    'proxiesEnsured', v_created,
    'activeJoinSeats', 31,
    'standbyHeld', 5,
    'liveSet', v_seed,
    'chatKeyToId', v_map,
    'rooms', v_rooms,
    'appliedAt', to_jsonb(now())
  );
END;
$$;

COMMENT ON FUNCTION public.enroll_wave1_seed_proxies() IS
  'LOI-598: enroll Community wave-1 seed proxies into live-set chats; standby held.';

GRANT EXECUTE ON FUNCTION public.seed_proxy_user_id(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_seed_proxy_user(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_proxy_join_chat(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.enroll_wave1_seed_proxies() TO service_role;

-- Enrollment is invoked by scripts/enroll-wave1-seed-proxies.mjs (service role)
-- after this migration + chat_warmth_evaluator are applied:
--   select public.enroll_wave1_seed_proxies();
