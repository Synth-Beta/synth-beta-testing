-- Friend invites with an optional show.
--
-- Flow: Tej taps Invite under Pick5 (optionally picks a show) -> create_invite() returns a
-- short code like K7M2QX -> Messages opens with "come to <show> with me, code K7M2QX,
-- join.getsynth.app/i/K7M2QX". The friend installs Synth, enters the code in onboarding
-- (prefilled when they open the link with the app installed) -> redeem_invite():
--   * Tej and the friend become friends (accepted, no request step)
--   * the friend is marked Interested in the show (through set_event_rsvp, so a stronger
--     'going' is never demoted)
--   * Tej gets "Sam joined Synth from your invite"
--
-- Codes, not install attribution: Apple drops link params through an App Store install,
-- and fingerprinting to recover them is against App Store rules.
--
-- Tables have RLS on and no policies: everything goes through the functions below.
--
-- Run in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.invites (
  code        text PRIMARY KEY,
  inviter_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id    uuid REFERENCES public.events(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invites_inviter_event_idx ON public.invites (inviter_id, event_id);

CREATE TABLE IF NOT EXISTS public.invite_redemptions (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code        text NOT NULL REFERENCES public.invites(code) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, code)
);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_redemptions ENABLE ROW LEVEL SECURITY;

-- One code per (inviter, show) for 30 days, so inviting five friends to the same show
-- reuses one code instead of minting five.
CREATE OR REPLACE FUNCTION public.create_invite(p_event_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_code text;
  -- no 0/O/1/I/L: people type these from a text message
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  SELECT code INTO v_code
  FROM public.invites
  WHERE inviter_id = v_user
    AND event_id IS NOT DISTINCT FROM p_event_id
    AND created_at > now() - interval '30 days'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;

  LOOP
    SELECT string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
    INTO v_code
    FROM generate_series(1, 6);
    BEGIN
      INSERT INTO public.invites (code, inviter_id, event_id) VALUES (v_code, v_user, p_event_id);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      -- collision: draw again
    END;
  END LOOP;
END;
$$;

-- Public preview for the link page and the app's invite screen. Shows only what the
-- inviter chose to share: their name/avatar and the show.
CREATE OR REPLACE FUNCTION public.get_invite(p_code text)
RETURNS TABLE (
  code text,
  inviter_id uuid,
  inviter_name text,
  inviter_avatar_url text,
  event_id uuid,
  event_title text,
  event_venue text,
  event_date timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.code, i.inviter_id, u.name, u.avatar_url,
         e.id, e.title,
         COALESCE(v.name, NULLIF(concat_ws(', ', e.venue_city, e.venue_state), '')),
         e.event_date::timestamptz
  FROM public.invites i
  LEFT JOIN public.users u ON u.user_id = i.inviter_id
  LEFT JOIN public.events e ON e.id = i.event_id
  LEFT JOIN public.venues v ON v.id = e.venue_id
  WHERE i.code = upper(btrim(p_code));
$$;

CREATE OR REPLACE FUNCTION public.redeem_invite(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_invite public.invites%ROWTYPE;
  v_first boolean;
  v_name text;
  v_title text;
  v_interest text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  SELECT * INTO v_invite FROM public.invites WHERE code = upper(btrim(p_code));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_invite.inviter_id = v_user THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'own_invite');
  END IF;

  INSERT INTO public.invite_redemptions (user_id, code)
  VALUES (v_user, v_invite.code)
  ON CONFLICT DO NOTHING;
  v_first := FOUND;

  -- Friends, no request step. Upgrade a pending request either way round.
  UPDATE public.user_relationships
  SET status = 'accepted'
  WHERE relationship_type = 'friend'
    AND ((user_id = v_invite.inviter_id AND related_user_id = v_user)
      OR (user_id = v_user AND related_user_id = v_invite.inviter_id));
  IF NOT FOUND THEN
    INSERT INTO public.user_relationships (user_id, related_user_id, relationship_type, status)
    VALUES (v_invite.inviter_id, v_user, 'friend', 'accepted');
  END IF;

  IF v_invite.event_id IS NOT NULL THEN
    -- runs as the invitee: set_event_rsvp reads auth.uid()
    v_interest := public.set_event_rsvp(v_invite.event_id, 'interested', false);
    SELECT title INTO v_title FROM public.events WHERE id = v_invite.event_id;
  END IF;

  IF v_first THEN
    SELECT name INTO v_name FROM public.users WHERE user_id = v_user;
    INSERT INTO public.notifications (user_id, type, title, message, data, actor_user_id)
    VALUES (
      v_invite.inviter_id,
      'friend_accepted',
      'Your invite worked! 🎉',
      COALESCE(v_name, 'Your friend') || ' joined Synth from your invite'
        || CASE WHEN v_title IS NOT NULL THEN ' and is interested in "' || v_title || '"' ELSE '' END,
      jsonb_build_object('actor_user_id', v_user, 'invite_code', v_invite.code, 'event_id', v_invite.event_id),
      v_user
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'inviter_id', v_invite.inviter_id,
    'event_id', v_invite.event_id,
    'interest', v_interest
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_invite(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.redeem_invite(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invite(text) TO anon, authenticated;
