-- ============================================================
-- UNIFIED MUSIC PREFERENCE SIGNALS AGGREGATION
-- Recalculates scores from ALL sources with consistent weights
-- Integrates: reviews, interests, follows, attendance, streaming stats
-- ============================================================

-- ============================================================
-- Function: Recalculate preference signals from all sources
-- ============================================================

CREATE OR REPLACE FUNCTION recalculate_music_preference_signals(p_user_id UUID DEFAULT NULL)
RETURNS TABLE(
  user_id UUID,
  preference_type TEXT,
  preference_value TEXT,
  total_score NUMERIC,
  total_interactions INT,
  signal_breakdown JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH all_artist_signals AS (
    -- From user_artist_interactions (reviews, follows, interests, attendance, streaming)
    SELECT 
      uai.user_id,
      uai.artist_name as preference_value,
      SUM(uai.type_score) as signal_score,
      SUM(uai.type_count)::INT as interaction_count,
      jsonb_object_agg(uai.interaction_type, uai.type_count) as signal_breakdown
    FROM (
      SELECT 
        uai_inner.user_id,
        uai_inner.artist_name,
        uai_inner.interaction_type,
        COUNT(*)::INT as type_count,
        SUM(
          CASE uai_inner.interaction_type
            WHEN 'review' THEN 15.0
            WHEN 'attendance' THEN 10.0
            WHEN 'streaming_top' THEN 8.0
            WHEN 'follow' THEN 7.0
            WHEN 'interest' THEN 6.0
            ELSE 5.0
          END
        ) as type_score
      FROM user_artist_interactions uai_inner
      WHERE (p_user_id IS NULL OR uai_inner.user_id = p_user_id)
        AND uai_inner.artist_name IS NOT NULL
      GROUP BY uai_inner.user_id, uai_inner.artist_name, uai_inner.interaction_type
    ) uai
    GROUP BY uai.user_id, uai.artist_name
    
    UNION ALL
    
    -- From user_streaming_stats_summary (top_artists)
    SELECT 
      ranked_artists.user_id,
      ranked_artists.artist_name as preference_value,
      -- Rank-based scoring: top artists get higher scores
      CASE 
        WHEN ranked_artists.artist_rank <= 10 THEN 8.0 * (1.0 - (ranked_artists.artist_rank - 1) * 0.05)
        WHEN ranked_artists.artist_rank <= 20 THEN 4.0
        ELSE 2.0
      END as signal_score,
      1 as interaction_count,
      jsonb_build_object('streaming_stats', 1) as signal_breakdown
    FROM (
      SELECT 
        uss.user_id,
        artist->>'name' as artist_name,
        ROW_NUMBER() OVER (
          PARTITION BY uss.user_id 
          ORDER BY 
            COALESCE((artist->>'popularity')::NUMERIC, 0) DESC,
            (artist->>'name')::TEXT
        ) as artist_rank
      FROM user_streaming_stats_summary uss
      CROSS JOIN jsonb_array_elements(uss.top_artists) as artist
      WHERE (p_user_id IS NULL OR uss.user_id = p_user_id)
        AND uss.time_range = 'all_time'  -- Use most comprehensive data
        AND uss.top_artists IS NOT NULL
        AND jsonb_array_length(uss.top_artists) > 0
        AND artist->>'name' IS NOT NULL
    ) ranked_artists
    WHERE ranked_artists.artist_rank <= 50  -- Limit to top 50
  ),
  artist_totals AS (
    SELECT 
      aas.user_id,
      aas.preference_value,
      SUM(aas.signal_score) as total_score,
      SUM(aas.interaction_count) as total_interactions
    FROM all_artist_signals aas
    GROUP BY aas.user_id, aas.preference_value
  ),
  artist_breakdowns AS (
    SELECT 
      breakdown.user_id,
      breakdown.preference_value,
      jsonb_object_agg(breakdown.interaction_type, breakdown.type_count_sum) FILTER (WHERE breakdown.interaction_type IS NOT NULL) as signal_breakdown
    FROM (
      SELECT 
        aas.user_id,
        aas.preference_value,
        kv.key as interaction_type,
        SUM((kv.value)::INT)::INT as type_count_sum
      FROM all_artist_signals aas
      CROSS JOIN LATERAL jsonb_each_text(aas.signal_breakdown) AS kv(key, value)
      GROUP BY aas.user_id, aas.preference_value, kv.key
    ) breakdown
    GROUP BY breakdown.user_id, breakdown.preference_value
  ),
  aggregated_artists AS (
    SELECT 
      at.user_id,
      at.preference_value,
      at.total_score,
      at.total_interactions,
      COALESCE(ab.signal_breakdown, '{}'::jsonb) as signal_breakdown
    FROM artist_totals at
    LEFT JOIN artist_breakdowns ab
      ON ab.user_id = at.user_id 
      AND ab.preference_value = at.preference_value
  ),
  all_genre_signals AS (
    -- From user_genre_interactions (reviews, follows, interests, streaming)
    SELECT 
      ugi.user_id,
      ugi.genre as preference_value,
      SUM(
        CASE ugi.interaction_type
          WHEN 'review' THEN 10.0 * ugi.total_count
          WHEN 'streaming_top' THEN 6.0 * ugi.total_count
          WHEN 'follow' THEN 5.0 * ugi.total_count
          WHEN 'interest' THEN 4.0 * ugi.total_count
          ELSE 3.0 * ugi.total_count
        END
      ) as signal_score,
      SUM(ugi.total_count)::INT as interaction_count,
      jsonb_object_agg(ugi.interaction_type, ugi.total_count) as signal_breakdown
    FROM (
      SELECT 
        ugi_inner.user_id,
        ugi_inner.genre,
        ugi_inner.interaction_type,
        SUM(ugi_inner.interaction_count)::INT as total_count
      FROM user_genre_interactions ugi_inner
      WHERE (p_user_id IS NULL OR ugi_inner.user_id = p_user_id)
        AND ugi_inner.genre IS NOT NULL
        AND ugi_inner.genre != ''
      GROUP BY ugi_inner.user_id, ugi_inner.genre, ugi_inner.interaction_type
    ) ugi
    GROUP BY ugi.user_id, ugi.genre
    
    UNION ALL
    
    -- From user_streaming_stats_summary (top_genres)
    SELECT 
      ranked_genres.user_id,
      ranked_genres.genre_name as preference_value,
      -- Rank-based scoring with count bonus
      (25.0 - (ranked_genres.genre_rank * 1.0)) + 
      LEAST(ranked_genres.genre_count, 10.0) * 0.5 as signal_score,
      ranked_genres.genre_count::INT as interaction_count,
      jsonb_build_object('streaming_stats', ranked_genres.genre_count::INT) as signal_breakdown
    FROM (
      SELECT 
        uss.user_id,
        CASE 
          WHEN jsonb_typeof(genre) = 'string' THEN genre::TEXT
          ELSE genre->>'genre'
        END as genre_name,
        CASE 
          WHEN jsonb_typeof(genre) = 'object' THEN (genre->>'count')::NUMERIC
          ELSE 1.0
        END as genre_count,
        ROW_NUMBER() OVER (
          PARTITION BY uss.user_id 
          ORDER BY 
            CASE 
              WHEN jsonb_typeof(genre) = 'object' THEN (genre->>'count')::NUMERIC
              ELSE 1.0
            END DESC
        ) as genre_rank
      FROM user_streaming_stats_summary uss
      CROSS JOIN jsonb_array_elements(uss.top_genres) as genre
      WHERE (p_user_id IS NULL OR uss.user_id = p_user_id)
        AND uss.time_range = 'all_time'  -- Use most comprehensive data
        AND uss.top_genres IS NOT NULL
        AND jsonb_array_length(uss.top_genres) > 0
        AND (
          (jsonb_typeof(genre) = 'string' AND genre::TEXT != '')
          OR (jsonb_typeof(genre) = 'object' AND genre->>'genre' IS NOT NULL)
        )
    ) ranked_genres
    WHERE ranked_genres.genre_rank <= 30  -- Limit to top 30 genres
  ),
  genre_totals AS (
    SELECT 
      ags.user_id,
      ags.preference_value,
      SUM(ags.signal_score) as total_score,
      SUM(ags.interaction_count) as total_interactions
    FROM all_genre_signals ags
    GROUP BY ags.user_id, ags.preference_value
  ),
  genre_breakdowns AS (
    SELECT 
      breakdown.user_id,
      breakdown.preference_value,
      jsonb_object_agg(breakdown.interaction_type, breakdown.type_count_sum) FILTER (WHERE breakdown.interaction_type IS NOT NULL) as signal_breakdown
    FROM (
      SELECT 
        ags.user_id,
        ags.preference_value,
        kv.key as interaction_type,
        SUM((kv.value)::INT)::INT as type_count_sum
      FROM all_genre_signals ags
      CROSS JOIN LATERAL jsonb_each_text(ags.signal_breakdown) AS kv(key, value)
      GROUP BY ags.user_id, ags.preference_value, kv.key
    ) breakdown
    GROUP BY breakdown.user_id, breakdown.preference_value
  ),
  aggregated_genres AS (
    SELECT 
      gt.user_id,
      gt.preference_value,
      gt.total_score,
      gt.total_interactions,
      COALESCE(gb.signal_breakdown, '{}'::jsonb) as signal_breakdown
    FROM genre_totals gt
    LEFT JOIN genre_breakdowns gb
      ON gb.user_id = gt.user_id 
      AND gb.preference_value = gt.preference_value
  )
  -- Return artists
  SELECT 
    aa.user_id,
    'artist'::TEXT as preference_type,
    aa.preference_value,
    aa.total_score,
    aa.total_interactions,
    aa.signal_breakdown
  FROM aggregated_artists aa
  
  UNION ALL
  
  -- Return genres
  SELECT 
    ag.user_id,
    'genre'::TEXT as preference_type,
    ag.preference_value,
    ag.total_score,
    ag.total_interactions,
    ag.signal_breakdown
  FROM aggregated_genres ag;
END;
$function$;

-- ============================================================
-- Function: Sync aggregated signals into music_preference_signals
-- ============================================================

CREATE OR REPLACE FUNCTION sync_aggregated_preference_signals(p_user_id UUID DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_updated_count INT := 0;
  v_signal RECORD;
  v_first_interaction TIMESTAMPTZ;
  v_last_interaction TIMESTAMPTZ;
  v_confidence NUMERIC;
BEGIN
  -- Insert/update aggregated signals
  FOR v_signal IN 
    SELECT * FROM recalculate_music_preference_signals(p_user_id)
  LOOP
    -- Get temporal data from interaction tables
    SELECT 
      MIN(COALESCE(uai.occurred_at, ugi.occurred_at)),
      MAX(COALESCE(uai.occurred_at, ugi.occurred_at))
    INTO v_first_interaction, v_last_interaction
    FROM (SELECT 1) dummy
    LEFT JOIN user_artist_interactions uai ON 
      uai.user_id = v_signal.user_id 
      AND uai.artist_name = v_signal.preference_value
      AND v_signal.preference_type = 'artist'
    LEFT JOIN user_genre_interactions ugi ON 
      ugi.user_id = v_signal.user_id 
      AND ugi.genre = v_signal.preference_value
      AND v_signal.preference_type = 'genre';
    
    -- Calculate confidence based on signal diversity and volume
    v_confidence := LEAST(1.0, 
      (SELECT COUNT(*)::NUMERIC FROM jsonb_object_keys(v_signal.signal_breakdown)) / 4.0 * 
      (LOG(v_signal.total_interactions + 1) / 3.0)
    );
    
    -- Set defaults if no interactions found
    v_first_interaction := COALESCE(v_first_interaction, now());
    v_last_interaction := COALESCE(v_last_interaction, now());
    v_confidence := GREATEST(0.5, v_confidence);
    
    INSERT INTO music_preference_signals (
      user_id,
      preference_type,
      preference_value,
      preference_score,
      interaction_count,
      interaction_types,
      first_interaction,
      last_interaction,
      confidence,
      updated_at
    ) VALUES (
      v_signal.user_id,
      v_signal.preference_type,
      v_signal.preference_value,
      v_signal.total_score,
      v_signal.total_interactions,
      v_signal.signal_breakdown,
      v_first_interaction,
      v_last_interaction,
      v_confidence,
      now()
    )
    ON CONFLICT (user_id, preference_type, preference_value)
    DO UPDATE SET
      preference_score = EXCLUDED.preference_score,
      interaction_count = EXCLUDED.interaction_count,
      interaction_types = EXCLUDED.interaction_types,
      first_interaction = LEAST(music_preference_signals.first_interaction, EXCLUDED.first_interaction),
      last_interaction = GREATEST(music_preference_signals.last_interaction, EXCLUDED.last_interaction),
      confidence = EXCLUDED.confidence,
      updated_at = now();
    
    v_updated_count := v_updated_count + 1;
  END LOOP;
  
  RETURN v_updated_count;
END;
$function$;

-- ============================================================
-- Trigger: Auto-recalculate when streaming stats change
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_recalculate_on_streaming_stats_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Recalculate signals for this user when streaming stats are updated
  PERFORM sync_aggregated_preference_signals(NEW.user_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_recalculate_on_streaming_stats ON user_streaming_stats_summary;
CREATE TRIGGER trigger_recalculate_on_streaming_stats
AFTER INSERT OR UPDATE ON user_streaming_stats_summary
FOR EACH ROW
WHEN (NEW.top_artists IS NOT NULL OR NEW.top_genres IS NOT NULL)
EXECUTE FUNCTION trigger_recalculate_on_streaming_stats_update();

-- ============================================================
-- RPC Function: Refresh signals for current user (called from client)
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_user_preference_signals()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_id UUID;
  v_updated_count INT;
  v_result JSONB;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not authenticated'
    );
  END IF;
  
  -- Sync signals for this user
  v_updated_count := sync_aggregated_preference_signals(v_user_id);
  
  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'signals_updated', v_updated_count,
    'timestamp', now()
  );
END;
$function$;

-- Add comments
COMMENT ON FUNCTION recalculate_music_preference_signals(UUID) IS 
  'Unified aggregation function that calculates preference scores from ALL sources: interactions, streaming stats, follows, reviews, interests, attendance';

COMMENT ON FUNCTION sync_aggregated_preference_signals(UUID) IS 
  'Syncs aggregated signals into music_preference_signals table. Can be run for specific user or all users.';

COMMENT ON FUNCTION refresh_user_preference_signals() IS 
  'RPC function to refresh preference signals for the current authenticated user. Called automatically at session start.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION refresh_user_preference_signals() TO authenticated;

