-- ============================================
-- CONSOLIDATION V2: MIGRATE USERS TABLES
-- ============================================
-- Migrate account_permissions, waitlist, admin_actions → users table

DO $$
DECLARE
  account_perms_count BIGINT;
  waitlist_count BIGINT;
  admin_actions_count BIGINT;
  migrated_perms_count BIGINT;
  migrated_waitlist_count BIGINT;
  migrated_admin_count BIGINT;
BEGIN
  RAISE NOTICE '=== MIGRATING USERS-RELATED TABLES ===';
  RAISE NOTICE '';
  
  -- ============================================
  -- 1. MIGRATE account_permissions → users.permissions_metadata
  -- ============================================
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'account_permissions'
  ) THEN
    SELECT COUNT(*) INTO account_perms_count FROM public.account_permissions;
    
    RAISE NOTICE 'Migrating account_permissions (% rows)...', account_perms_count;
    
    -- Group permissions by account_type and store as JSONB array per user
    UPDATE public.users u
    SET permissions_metadata = COALESCE(permissions_metadata, '{}'::JSONB) || jsonb_build_object(
      'account_type', p.account_type,
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
    
    SELECT COUNT(*) INTO migrated_perms_count
    FROM public.users
    WHERE permissions_metadata != '{}'::JSONB;
    
    RAISE NOTICE '  ✅ Migrated permissions for % users', migrated_perms_count;
  ELSE
    RAISE NOTICE 'account_permissions table does not exist - skipping';
  END IF;
  
  RAISE NOTICE '';
  
  -- ============================================
  -- 2. MIGRATE waitlist → users.waitlist_metadata
  -- ============================================
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND (table_name = 'waitlist' OR table_name = 'Waitlist')
  ) THEN
    -- Handle case-insensitive table name
    EXECUTE format('
      SELECT COUNT(*) FROM information_schema.tables 
      WHERE table_schema = ''public'' 
      AND LOWER(table_name) = ''waitlist''
    ') INTO waitlist_count;
    
    RAISE NOTICE 'Migrating waitlist (% rows)...', waitlist_count;
    
    -- Migrate waitlist data (handle both 'waitlist' and 'Waitlist' table names)
    DO $$
    DECLARE
      waitlist_table_name TEXT;
    BEGIN
      SELECT table_name INTO waitlist_table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND LOWER(table_name) = 'waitlist'
      LIMIT 1;
      
      IF waitlist_table_name IS NOT NULL THEN
        EXECUTE format('
          UPDATE public.users u
          SET 
            waitlist_signup_at = w.created_at,
            waitlist_metadata = jsonb_build_object(
              ''source_table'', ''waitlist'',
              ''email'', w.email,
              ''name'', w.name,
              ''metadata'', COALESCE(w.metadata, ''{}''::JSONB),
              ''created_at'', w.created_at
            )
          FROM public.%I w
          WHERE u.email = w.email
            AND u.waitlist_signup_at IS NULL
        ', waitlist_table_name);
        
        EXECUTE format('SELECT COUNT(*) FROM public.%I', waitlist_table_name) INTO waitlist_count;
        RAISE NOTICE '  ✅ Migrated % waitlist entries', waitlist_count;
      END IF;
    END $$;
    
    SELECT COUNT(*) INTO migrated_waitlist_count
    FROM public.users
    WHERE waitlist_signup_at IS NOT NULL;
    
    RAISE NOTICE '  ✅ Total users with waitlist data: %', migrated_waitlist_count;
  ELSE
    RAISE NOTICE 'waitlist table does not exist - skipping';
  END IF;
  
  RAISE NOTICE '';
  
  -- ============================================
  -- 3. MIGRATE admin_actions → users.admin_actions_log
  -- ============================================
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'admin_actions'
  ) THEN
    SELECT COUNT(*) INTO admin_actions_count FROM public.admin_actions;
    
    RAISE NOTICE 'Migrating admin_actions (% rows)...', admin_actions_count;
    
    -- Group admin actions by admin_user_id and store as JSONB array
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
    
    SELECT COUNT(*) INTO migrated_admin_count
    FROM public.users
    WHERE admin_actions_log != '[]'::JSONB;
    
    RAISE NOTICE '  ✅ Migrated admin actions for % users', migrated_admin_count;
  ELSE
    RAISE NOTICE 'admin_actions table does not exist - skipping';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== MIGRATION SUMMARY ===';
  RAISE NOTICE 'account_permissions: % → % users', account_perms_count, migrated_perms_count;
  RAISE NOTICE 'waitlist: % → % users', waitlist_count, migrated_waitlist_count;
  RAISE NOTICE 'admin_actions: % → % users', admin_actions_count, migrated_admin_count;
END $$;

-- Verification
SELECT 
  'Users Migration Verification' as check_type,
  (SELECT COUNT(*) FROM public.users WHERE permissions_metadata != '{}'::JSONB) as users_with_permissions,
  (SELECT COUNT(*) FROM public.users WHERE waitlist_signup_at IS NOT NULL) as users_with_waitlist,
  (SELECT COUNT(*) FROM public.users WHERE admin_actions_log != '[]'::JSONB) as users_with_admin_actions;

