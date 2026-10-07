-- Atomic regeneration: refresh pending AND approved drafts, never claimed/sent rows.
-- Only the authenticated admin Edge Function (service_role) can call this RPC.
CREATE OR REPLACE FUNCTION public.regenerate_newsletter_drafts(p_edition_date date, p_drafts jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  changed integer;
  replaced integer := 0;
  kept integer := 0;
BEGIN
  IF jsonb_typeof(p_drafts) IS DISTINCT FROM 'array' OR jsonb_array_length(p_drafts) > 15 THEN
    RAISE EXCEPTION 'Expected an array of at most 15 drafts';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_drafts) LOOP
    INSERT INTO public.newsletter_drafts AS existing (
      edition_date, user_id, email, subject, preheader, html, content_hash,
      sources, retrieved_at, status, approved_content_hash, approved_by, approved_at, sent_at
    ) VALUES (
      p_edition_date, (item->>'user_id')::uuid, lower(trim(item->>'email')),
      item->>'subject', coalesce(item->>'preheader', ''), item->>'html', item->>'content_hash',
      coalesce(item->'sources', '[]'::jsonb), now(), 'needs_approval', NULL, NULL, NULL, NULL
    ) ON CONFLICT (edition_date, user_id) DO UPDATE SET
      email = EXCLUDED.email, subject = EXCLUDED.subject, preheader = EXCLUDED.preheader,
      html = EXCLUDED.html, content_hash = EXCLUDED.content_hash, sources = EXCLUDED.sources,
      retrieved_at = EXCLUDED.retrieved_at, status = 'needs_approval',
      approved_content_hash = NULL, approved_by = NULL, approved_at = NULL
    WHERE existing.status <> 'sent' AND existing.sent_at IS NULL;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed = 1 THEN replaced := replaced + 1; ELSE kept := kept + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('replaced', replaced, 'kept', kept);
END;
$$;
REVOKE ALL ON FUNCTION public.regenerate_newsletter_drafts(date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_newsletter_drafts(date, jsonb) TO service_role;
