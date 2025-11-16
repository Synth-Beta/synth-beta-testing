-- ============================================
-- CONSOLIDATION V2: MIGRATE DATA
-- ============================================
-- Migrate all supporting table data into core tables

DO $$
DECLARE
  migrated_count INTEGER := 0;
  total_source_rows BIGINT := 0;
  total_migrated_rows BIGINT := 0;
BEGIN
  RAISE NOTICE '=== CONSOLIDATION V2: MIGRATING DATA ===';
  RAISE NOTICE '';
  
  -- ============================================
  -- 1. MIGRATE account_permissions → users.permissions_metadata
  -- ============================================
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'account_permissions'
  ) THEN
    DECLARE
      perms_count BIGINT;
      perms_migrated BIGINT;
    BEGIN
      SELECT COUNT(*) INTO perms_count FROM public.account_permissions;
      total_source_rows := total_source_rows + perms_count;
      
      RAISE NOTICE '1. Migrating account_permissions (% rows)...', perms_count;
      
      -- Group permissions by account_type and store as JSONB per user account_type
      UPDATE public.users u
      SET permissions_metadata = COALESCE(u.permissions_metadata, '{}'::JSONB) || jsonb_build_object(
        'account_type', p.account_type::TEXT,
        'permissions', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'permission_key', ap.permission_key,
              'permission_name', ap.permission_name,
              'permission_description', ap.permission_description,
              'granted', ap.granted,
              'created_at', ap.created_at
            )
          )
          FROM public.account_permissions ap
          WHERE ap.account_type = p.account_type
        )
      )
      FROM (
        SELECT DISTINCT account_type 
        FROM public.account_permissions
      ) p
      WHERE u.account_type::TEXT = p.account_type::TEXT;
      
      SELECT COUNT(*) INTO perms_migrated
      FROM public.users
      WHERE permissions_metadata != '{}'::JSONB;
      
      total_migrated_rows := total_migrated_rows + perms_migrated;
      RAISE NOTICE '   ✅ Migrated permissions for % users', perms_migrated;
    END;
  END IF;
  
  -- ============================================
  -- 2. MIGRATE admin_actions → users.admin_actions_log
  -- ============================================
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'admin_actions'
  ) THEN
    DECLARE
      admin_count BIGINT;
      admin_migrated BIGINT;
    BEGIN
      SELECT COUNT(*) INTO admin_count FROM public.admin_actions;
      total_source_rows := total_source_rows + admin_count;
      
      RAISE NOTICE '2. Migrating admin_actions (% rows)...', admin_count;
      
      UPDATE public.users u
      SET admin_actions_log = (
        SELECT jsonb_agg(
          jsonb_build_object(
            'action_type', aa.action_type,
            'target_type', aa.target_type,
            'target_id', aa.target_id,
            'action_details', COALESCE(aa.action_details, '{}'::JSONB),
            'reason', aa.reason,
            'created_at', aa.created_at
          )
          ORDER BY aa.created_at DESC
        )
        FROM public.admin_actions aa
        WHERE aa.admin_user_id = u.user_id
      )
      WHERE EXISTS (
        SELECT 1 FROM public.admin_actions aa
        WHERE aa.admin_user_id = u.user_id
      );
      
      SELECT COUNT(*) INTO admin_migrated
      FROM public.users
      WHERE admin_actions_log != '[]'::JSONB;
      
      total_migrated_rows := total_migrated_rows + admin_migrated;
      RAISE NOTICE '   ✅ Migrated admin actions for % users', admin_migrated;
    END;
  END IF;
  
  -- ============================================
  -- 3. MIGRATE event_claims → events.claim_metadata
  -- ============================================
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_claims'
  ) THEN
    DECLARE
      claims_count BIGINT;
      claims_migrated BIGINT;
    BEGIN
      SELECT COUNT(*) INTO claims_count FROM public.event_claims;
      total_source_rows := total_source_rows + claims_count;
      
      RAISE NOTICE '3. Migrating event_claims (% rows)...', claims_count;
      
      UPDATE public.events e
      SET claim_metadata = jsonb_build_object(
        'claimer_user_id', ec.claimer_user_id,
        'claimed_at', ec.created_at,
        'claim_status', ec.claim_status,
        'claim_reason', ec.claim_reason,
        'verification_proof', ec.verification_proof,
        'reviewed_by_admin_id', ec.reviewed_by_admin_id,
        'reviewed_at', ec.reviewed_at,
        'admin_notes', ec.admin_notes,
        'updated_at', ec.updated_at
      )
      FROM public.event_claims ec
      WHERE ((e.id::TEXT = ec.event_id::TEXT) OR (e.id = ec.event_id))
        AND e.claim_metadata = '{}'::JSONB;
      
      SELECT COUNT(*) INTO claims_migrated
      FROM public.events
      WHERE claim_metadata != '{}'::JSONB;
      
      total_migrated_rows := total_migrated_rows + claims_migrated;
      RAISE NOTICE '   ✅ Migrated % event claims', claims_migrated;
    END;
  END IF;
  
  -- ============================================
  -- 4. MIGRATE event_groups → events.group_metadata
  -- ============================================
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_groups'
  ) THEN
    DECLARE
      groups_count BIGINT;
      groups_migrated BIGINT;
    BEGIN
      SELECT COUNT(*) INTO groups_count FROM public.event_groups;
      total_source_rows := total_source_rows + groups_count;
      
      RAISE NOTICE '4. Migrating event_groups (% rows)...', groups_count;
      
      UPDATE public.events e
      SET group_metadata = COALESCE(e.group_metadata, '{}'::JSONB) || jsonb_build_object(
        'groups', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'group_id', eg.id,
              'group_name', eg.name,
              'description', eg.description,
              'created_by_user_id', eg.created_by_user_id,
              'is_public', eg.is_public,
              'max_members', eg.max_members,
              'member_count', eg.member_count,
              'cover_image_url', eg.cover_image_url,
              'chat_id', eg.chat_id,
              'created_at', eg.created_at,
              'updated_at', eg.updated_at
            )
          )
          FROM public.event_groups eg
          WHERE (e.id::TEXT = eg.event_id::TEXT OR e.id = eg.event_id)
        )
      )
      WHERE EXISTS (
        SELECT 1 FROM public.event_groups eg
        WHERE (e.id::TEXT = eg.event_id::TEXT OR e.id = eg.event_id)
      );
      
      SELECT COUNT(*) INTO groups_migrated
      FROM public.events
      WHERE group_metadata != '{}'::JSONB;
      
      total_migrated_rows := total_migrated_rows + groups_migrated;
      RAISE NOTICE '   ✅ Migrated % event groups', groups_migrated;
    END;
  END IF;
  
  -- ============================================
  -- 5. MIGRATE event_group_members → relationships
  -- ============================================
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_group_members'
  ) THEN
    DECLARE
      members_count BIGINT;
      members_migrated BIGINT;
      constraint_name_found TEXT;
      constraint_name_var TEXT;
    BEGIN
      SELECT COUNT(*) INTO members_count FROM public.event_group_members;
      total_source_rows := total_source_rows + members_count;
      
      RAISE NOTICE '5. Migrating event_group_members (% rows)...', members_count;
      
      -- First, update the relationships constraint to allow 'event_group'
      SELECT constraint_name INTO constraint_name_found
      FROM information_schema.table_constraints 
      WHERE constraint_schema = 'public' 
        AND table_name = 'relationships' 
        AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%related_entity_type%'
      LIMIT 1;
      
      IF constraint_name_found IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.relationships DROP CONSTRAINT IF EXISTS %I', constraint_name_found);
        RAISE NOTICE '   Dropped existing constraint: %', constraint_name_found;
      END IF;
      
      -- Add new constraint with 'event_group' included
      ALTER TABLE public.relationships
      ADD CONSTRAINT relationships_related_entity_type_check 
      CHECK (related_entity_type IN ('user', 'artist', 'venue', 'event', 'event_group'));
      
      RAISE NOTICE '   ✅ Updated relationships constraint to include event_group';
      
      -- Also update the relationship_type constraint to allow 'event_group_member'
      -- Find and drop all relationship_type constraints
      FOR constraint_name_var IN
        SELECT constraint_name
        FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
          AND table_name = 'relationships' 
          AND constraint_type = 'CHECK'
          AND constraint_name LIKE '%relationship_type%'
      LOOP
        EXECUTE format('ALTER TABLE public.relationships DROP CONSTRAINT IF EXISTS %I', constraint_name_var);
        RAISE NOTICE '   Dropped existing relationship_type constraint: %', constraint_name_var;
      END LOOP;
      
      -- Add new constraint with 'event_group_member' included
      -- Include all common relationship types plus the new one
      ALTER TABLE public.relationships
      ADD CONSTRAINT relationships_relationship_type_check 
      CHECK (relationship_type IN ('follow', 'interest', 'friend', 'match', 'block', 'going', 'maybe', 'not_going', 'event_group_member'));
      
      RAISE NOTICE '   ✅ Updated relationships constraint to include event_group_member';
      
      INSERT INTO public.relationships (
        user_id,
        related_entity_type,
        related_entity_id,
        relationship_type,
        metadata,
        created_at
      )
      SELECT 
        egm.user_id,
        'event_group' as related_entity_type,
        egm.group_id::TEXT as related_entity_id,
        'event_group_member' as relationship_type,
        jsonb_build_object(
          'source_table', 'event_group_members',
          'group_id', egm.group_id,
          'role', egm.role,
          'joined_at', egm.joined_at,
          'last_active_at', egm.last_active_at
        ) as metadata,
        egm.joined_at
      FROM public.event_group_members egm
      WHERE NOT EXISTS (
        SELECT 1 FROM public.relationships r
        WHERE r.user_id = egm.user_id
          AND r.related_entity_type = 'event_group'
          AND r.related_entity_id = egm.group_id::TEXT
          AND r.relationship_type = 'event_group_member'
      );
      
      GET DIAGNOSTICS members_migrated = ROW_COUNT;
      total_migrated_rows := total_migrated_rows + members_migrated;
      RAISE NOTICE '   ✅ Migrated % group memberships to relationships', members_migrated;
    END;
  END IF;
  
  -- ============================================
  -- 6. MIGRATE event_photos → events.media_urls
  -- ============================================
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_photos'
  ) THEN
    DECLARE
      photos_count BIGINT;
      photos_migrated BIGINT;
    BEGIN
      SELECT COUNT(*) INTO photos_count FROM public.event_photos;
      total_source_rows := total_source_rows + photos_count;
      
      RAISE NOTICE '6. Migrating event_photos (% rows)...', photos_count;
      
      UPDATE public.events e
      SET media_urls = COALESCE(e.media_urls, ARRAY[]::TEXT[]) || ARRAY(
        SELECT DISTINCT ep.photo_url
        FROM public.event_photos ep
        WHERE (e.id::TEXT = ep.event_id::TEXT OR e.id = ep.event_id)
          AND ep.photo_url IS NOT NULL
      )
      WHERE EXISTS (
        SELECT 1 FROM public.event_photos ep
        WHERE (e.id::TEXT = ep.event_id::TEXT OR e.id = ep.event_id)
      );
      
      SELECT COUNT(*) INTO photos_migrated
      FROM public.events
      WHERE array_length(media_urls, 1) > 0;
      
      total_migrated_rows := total_migrated_rows + photos_migrated;
      RAISE NOTICE '   ✅ Migrated photos for % events', photos_migrated;
    END;
  END IF;
  
  -- ============================================
  -- 7. MIGRATE event_tickets → events.ticket_metadata
  -- ============================================
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_tickets'
  ) THEN
    DECLARE
      tickets_count BIGINT;
      tickets_migrated BIGINT;
    BEGIN
      SELECT COUNT(*) INTO tickets_count FROM public.event_tickets;
      total_source_rows := total_source_rows + tickets_count;
      
      RAISE NOTICE '7. Migrating event_tickets (% rows)...', tickets_count;
      
      UPDATE public.events e
      SET ticket_metadata = COALESCE(e.ticket_metadata, '{}'::JSONB) || jsonb_build_object(
        'tickets', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'ticket_url', et.ticket_url,
              'ticket_provider', et.ticket_provider,
              'ticket_type', et.ticket_type,
              'price_min', et.price_min,
              'price_max', et.price_max,
              'currency', et.currency,
              'available_from', et.available_from,
              'available_until', et.available_until,
              'is_primary', et.is_primary,
              'created_at', et.created_at,
              'updated_at', et.updated_at
            )
          )
          FROM public.event_tickets et
          WHERE (e.id::TEXT = et.event_id::TEXT OR e.id = et.event_id)
        )
      )
      WHERE EXISTS (
        SELECT 1 FROM public.event_tickets et
        WHERE (e.id::TEXT = et.event_id::TEXT OR e.id = et.event_id)
      );
      
      SELECT COUNT(*) INTO tickets_migrated
      FROM public.events
      WHERE ticket_metadata != '{}'::JSONB
        AND ticket_metadata ? 'tickets';
      
      total_migrated_rows := total_migrated_rows + tickets_migrated;
      RAISE NOTICE '   ✅ Migrated tickets for % events', tickets_migrated;
    END;
  END IF;
  
  -- ============================================
  -- 8. MIGRATE event_promotions → events.promotion_metadata
  -- ============================================
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'event_promotions'
  ) THEN
    DECLARE
      promotions_count BIGINT;
      promotions_migrated BIGINT;
    BEGIN
      SELECT COUNT(*) INTO promotions_count FROM public.event_promotions;
      total_source_rows := total_source_rows + promotions_count;
      
      RAISE NOTICE '8. Migrating event_promotions (% rows)...', promotions_count;
      
      UPDATE public.events e
      SET promotion_metadata = jsonb_build_object(
        'promotions', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'promotion_id', ep.id,
              'promoted_by_user_id', ep.promoted_by_user_id,
              'promotion_tier', ep.promotion_tier,
              'promotion_status', ep.promotion_status,
              'price_paid', ep.price_paid,
              'currency', ep.currency,
              'payment_status', ep.payment_status,
              'starts_at', ep.starts_at,
              'expires_at', ep.expires_at,
              'target_cities', ep.target_cities,
              'target_genres', ep.target_genres,
              'target_age_min', ep.target_age_min,
              'target_age_max', ep.target_age_max,
              'impressions', ep.impressions,
              'clicks', ep.clicks,
              'conversions', ep.conversions,
              'reviewed_by_admin_id', ep.reviewed_by_admin_id,
              'reviewed_at', ep.reviewed_at,
              'admin_notes', ep.admin_notes,
              'rejection_reason', ep.rejection_reason,
              'created_at', ep.created_at,
              'updated_at', ep.updated_at
            )
          )
          FROM public.event_promotions ep
          WHERE (e.id::TEXT = ep.event_id::TEXT OR e.id = ep.event_id)
        )
      )
      WHERE EXISTS (
        SELECT 1 FROM public.event_promotions ep
        WHERE (e.id::TEXT = ep.event_id::TEXT OR e.id = ep.event_id)
      );
      
      SELECT COUNT(*) INTO promotions_migrated
      FROM public.events
      WHERE promotion_metadata != '{}'::JSONB;
      
      total_migrated_rows := total_migrated_rows + promotions_migrated;
      RAISE NOTICE '   ✅ Migrated % event promotions', promotions_migrated;
    END;
  END IF;
  
  -- ============================================
  -- 9. MIGRATE monetization_tracking → events.monetization_metadata
  -- ============================================
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'monetization_tracking'
  ) THEN
    DECLARE
      monetization_count BIGINT;
      monetization_migrated BIGINT;
    BEGIN
      SELECT COUNT(*) INTO monetization_count FROM public.monetization_tracking;
      total_source_rows := total_source_rows + monetization_count;
      
      RAISE NOTICE '9. Migrating monetization_tracking (% rows)...', monetization_count;
      
      UPDATE public.events e
      SET monetization_metadata = COALESCE(e.monetization_metadata, '{}'::JSONB) || jsonb_build_object(
        'transactions', (
          SELECT jsonb_agg(
            to_jsonb(mt) - 'id' - 'related_entity_type' - 'related_entity_id' - 'created_at' - 'updated_at'
          )
          FROM public.monetization_tracking mt
          WHERE mt.related_entity_type = 'event'
            AND mt.related_entity_id = e.id
        )
      )
      WHERE EXISTS (
        SELECT 1 FROM public.monetization_tracking mt
        WHERE mt.related_entity_type = 'event'
          AND mt.related_entity_id = e.id
      );
      
      SELECT COUNT(*) INTO monetization_migrated
      FROM public.events
      WHERE monetization_metadata != '{}'::JSONB
        AND monetization_metadata ? 'transactions';
      
      total_migrated_rows := total_migrated_rows + monetization_migrated;
      RAISE NOTICE '   ✅ Migrated monetization data for % events', monetization_migrated;
    END;
  END IF;
  
  -- ============================================
  -- 10. MIGRATE user_genre_preferences → user_preferences.genre_preferences
  -- ============================================
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_genre_preferences'
  ) THEN
    DECLARE
      genre_prefs_count BIGINT;
      genre_prefs_migrated BIGINT;
    BEGIN
      SELECT COUNT(*) INTO genre_prefs_count FROM public.user_genre_preferences;
      total_source_rows := total_source_rows + genre_prefs_count;
      
      RAISE NOTICE '10. Migrating user_genre_preferences (% rows)...', genre_prefs_count;
      
      UPDATE public.user_preferences up
      SET genre_preferences = COALESCE(up.genre_preferences, '{}'::JSONB) || jsonb_build_object(
        'preferences', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'genre', ugp.genre,
              'subgenre', ugp.subgenre,
              'interaction_type', ugp.interaction_type,
              'preference_score', ugp.preference_score,
              'source_entity_type', ugp.source_entity_type,
              'source_entity_id', ugp.source_entity_id,
              'source_entity_name', ugp.source_entity_name,
              'context', ugp.context,
              'occurred_at', ugp.occurred_at,
              'created_at', ugp.created_at,
              'updated_at', ugp.updated_at,
              'metadata', ugp.metadata
            )
          )
          FROM public.user_genre_preferences ugp
          WHERE ugp.user_id = up.user_id
        )
      )
      WHERE EXISTS (
        SELECT 1 FROM public.user_genre_preferences ugp
        WHERE ugp.user_id = up.user_id
      );
      
      SELECT COUNT(*) INTO genre_prefs_migrated
      FROM public.user_preferences
      WHERE genre_preferences != '{}'::JSONB
        AND genre_preferences ? 'preferences';
      
      total_migrated_rows := total_migrated_rows + genre_prefs_migrated;
      RAISE NOTICE '   ✅ Migrated genre preferences for % users', genre_prefs_migrated;
    END;
  END IF;
  
  -- ============================================
  -- 11. MIGRATE moderation_flags → reviews/comments.moderation_metadata
  -- ============================================
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'moderation_flags'
  ) THEN
    DECLARE
      flags_count BIGINT;
      reviews_flagged BIGINT;
      comments_flagged BIGINT;
    BEGIN
      SELECT COUNT(*) INTO flags_count FROM public.moderation_flags;
      total_source_rows := total_source_rows + flags_count;
      
      RAISE NOTICE '11. Migrating moderation_flags (% rows)...', flags_count;
      
      -- Temporarily disable trigger that causes issues
      ALTER TABLE public.reviews DISABLE TRIGGER trigger_update_music_preferences_on_review;
      
      -- Migrate flags to reviews
      UPDATE public.reviews r
      SET moderation_metadata = COALESCE(r.moderation_metadata, '{}'::JSONB) || jsonb_build_object(
        'flags', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'flag_id', mf.id,
              'flagged_by', mf.flagged_by_user_id,
              'flag_reason', mf.flag_reason,
              'flag_details', mf.flag_details,
              'status', mf.flag_status,
              'reviewed_by', mf.reviewed_by_admin_id,
              'review_notes', mf.review_notes,
              'created_at', mf.created_at,
              'updated_at', mf.updated_at
            )
          )
          FROM public.moderation_flags mf
          WHERE mf.content_type = 'review'
            AND mf.content_id = r.id
        )
      )
      WHERE EXISTS (
        SELECT 1 FROM public.moderation_flags mf
        WHERE mf.content_type = 'review'
          AND mf.content_id = r.id
      );
      
      SELECT COUNT(*) INTO reviews_flagged
      FROM public.reviews
      WHERE moderation_metadata != '{}'::JSONB
        AND moderation_metadata ? 'flags';
      
      -- Migrate flags to comments
      UPDATE public.comments c
      SET moderation_metadata = COALESCE(c.moderation_metadata, '{}'::JSONB) || jsonb_build_object(
        'flags', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'flag_id', mf.id,
              'flagged_by', mf.flagged_by_user_id,
              'flag_reason', mf.flag_reason,
              'flag_details', mf.flag_details,
              'status', mf.flag_status,
              'reviewed_by', mf.reviewed_by_admin_id,
              'review_notes', mf.review_notes,
              'created_at', mf.created_at,
              'updated_at', mf.updated_at
            )
          )
          FROM public.moderation_flags mf
          WHERE mf.content_type = 'comment'
            AND mf.content_id = c.id
        )
      )
      WHERE EXISTS (
        SELECT 1 FROM public.moderation_flags mf
        WHERE mf.content_type = 'comment'
          AND mf.content_id = c.id
      );
      
      -- Re-enable trigger
      ALTER TABLE public.reviews ENABLE TRIGGER trigger_update_music_preferences_on_review;
      
      SELECT COUNT(*) INTO comments_flagged
      FROM public.comments
      WHERE moderation_metadata != '{}'::JSONB
        AND moderation_metadata ? 'flags';
      
      total_migrated_rows := total_migrated_rows + reviews_flagged + comments_flagged;
      RAISE NOTICE '   ✅ Migrated flags to % reviews and % comments', reviews_flagged, comments_flagged;
    END;
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== MIGRATION SUMMARY ===';
  RAISE NOTICE 'Total source rows: %', total_source_rows;
  RAISE NOTICE 'Total migrated entries: %', total_migrated_rows;
END $$;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 
  'Migration Complete' as status,
  (SELECT COUNT(*) FROM public.users WHERE permissions_metadata != '{}'::JSONB) as users_with_permissions,
  (SELECT COUNT(*) FROM public.users WHERE admin_actions_log != '[]'::JSONB) as users_with_admin_actions,
  (SELECT COUNT(*) FROM public.events WHERE claim_metadata != '{}'::JSONB) as events_with_claims,
  (SELECT COUNT(*) FROM public.events WHERE group_metadata != '{}'::JSONB) as events_with_groups,
  (SELECT COUNT(*) FROM public.events WHERE media_urls != ARRAY[]::TEXT[]) as events_with_photos,
  (SELECT COUNT(*) FROM public.events WHERE ticket_metadata != '{}'::JSONB) as events_with_tickets,
  (SELECT COUNT(*) FROM public.events WHERE promotion_metadata != '{}'::JSONB) as events_with_promotions,
  (SELECT COUNT(*) FROM public.events WHERE monetization_metadata != '{}'::JSONB) as events_with_monetization,
  (SELECT COUNT(*) FROM public.relationships WHERE relationship_type = 'event_group_member') as group_memberships_migrated,
  (SELECT COUNT(*) FROM public.user_preferences WHERE genre_preferences != '{}'::JSONB) as users_with_genre_prefs,
  (SELECT COUNT(*) FROM public.reviews WHERE moderation_metadata != '{}'::JSONB) as reviews_with_flags,
  (SELECT COUNT(*) FROM public.comments WHERE moderation_metadata != '{}'::JSONB) as comments_with_flags;

