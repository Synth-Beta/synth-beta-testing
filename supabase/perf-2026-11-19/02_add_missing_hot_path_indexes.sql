-- Adds indexes for the chat / friends / reviews / notifications lookups the apps make on
-- every screen load — but ONLY where nothing already covers them.
--
-- Safe to run more than once. For each lookup below it checks:
--   * the table and every column exist (otherwise skipped), and
--   * no existing index already starts with the same columns (otherwise skipped),
-- and only then creates the index. A NOTICE line reports what it did for each one.
--
-- Note: CREATE INDEX briefly blocks writes to that table while it builds (seconds on
-- tables of this size). Run at a quiet time.

DO $$
DECLARE
  spec record;
  v_existing text;
  v_missing_col text;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      -- chat screen: latest messages of one chat
      ('messages',           ARRAY['chat_id','created_at'],                       'idx_messages_chat_id_created_at'),
      -- chat list: my chats / members of a chat
      ('chat_participants',  ARRAY['user_id'],                                    'idx_chat_participants_user_id'),
      ('chat_participants',  ARRAY['chat_id'],                                    'idx_chat_participants_chat_id'),
      -- friends: both directions of the relationship (seen in supabase logs)
      ('user_relationships', ARRAY['user_id','relationship_type','status'],       'idx_user_relationships_user_type_status'),
      ('user_relationships', ARRAY['related_user_id','relationship_type','status'],'idx_user_relationships_related_type_status'),
      -- artist / event pages: reviews for an artist or event
      ('reviews',            ARRAY['artist_id','created_at'],                     'idx_reviews_artist_id_created_at'),
      ('reviews',            ARRAY['event_id'],                                   'idx_reviews_event_id'),
      ('reviews',            ARRAY['user_id','created_at'],                       'idx_reviews_user_id_created_at'),
      -- notifications tab
      ('notifications',      ARRAY['user_id','created_at'],                       'idx_notifications_user_id_created_at')
    ) AS t(tbl, cols, idx_name)
  LOOP
    IF to_regclass('public.' || spec.tbl) IS NULL THEN
      RAISE NOTICE 'skip %: table not found', spec.tbl;
      CONTINUE;
    END IF;

    SELECT c INTO v_missing_col
    FROM unnest(spec.cols) c
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = spec.tbl AND column_name = c
    )
    LIMIT 1;
    IF v_missing_col IS NOT NULL THEN
      RAISE NOTICE 'skip % (%): column % not found', spec.tbl, array_to_string(spec.cols, ', '), v_missing_col;
      CONTINUE;
    END IF;

    -- An existing index whose leading key columns are exactly these columns (in order).
    SELECT ic.relname INTO v_existing
    FROM pg_index i
    JOIN pg_class ic ON ic.oid = i.indexrelid
    WHERE i.indrelid = ('public.' || spec.tbl)::regclass
      AND i.indpred IS NULL
      AND array_length(spec.cols, 1) <= i.indnkeyatts
      AND (
        SELECT array_agg(a.attname ORDER BY k.ord)
        FROM unnest(i.indkey[0:array_length(spec.cols, 1) - 1]) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
      ) = spec.cols::name[]
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      RAISE NOTICE 'ok   % (%): already covered by %', spec.tbl, array_to_string(spec.cols, ', '), v_existing;
      CONTINUE;
    END IF;

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)',
                   spec.idx_name, spec.tbl,
                   (SELECT string_agg(quote_ident(c), ', ') FROM unnest(spec.cols) c));
    RAISE NOTICE 'ADD  % (%): created %', spec.tbl, array_to_string(spec.cols, ', '), spec.idx_name;
  END LOOP;
END $$;
