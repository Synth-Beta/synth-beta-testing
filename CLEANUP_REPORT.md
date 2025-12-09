# 🧹 Codebase Cleanup Report

## Summary
Found **464 SQL files** and **160 markdown files** across the codebase. Many are outdated, duplicate, or already archived.

---

## 🗑️ **SAFE TO DELETE** (Root Directory SQL Files)

These are one-off fix files that should have been moved to `sql/fixes/` or deleted after being applied:

### High Priority Deletions:
- `activate_promotions.sql`
- `add_onboarding_columns_to_users.sql`
- `add_promotion_columns.sql`
- `add_synth_logo_avatars.sql`
- `apply_genre_first_fix_corrected.sql`
- `apply_genre_first_fix_final.sql`
- `apply_genre_first_fix.sql`
- `apply_simple_working_feed.sql`
- `CLEAN_CITY_CENTERS 2.sql`
- `CLEAN_CITY_CENTERS.sql`
- `clear_relationships_table.sql`
- `COMPLETE_FRIENDS_REVIEWS_SETUP.sql`
- `COMPLETE_FUNCTION_FIX.sql`
- `COMPLETE_ON_CONFLICT_FIX.sql`
- `COMPLETE_PRICE_RANGE_FIX 2.sql`
- `COMPLETE_PRICE_RANGE_FIX.sql`
- `COMPREHENSIVE_DATABASE_FIX.sql`
- `COMPREHENSIVE_TYPE_FIX.sql`
- `CONCURRENT_INDEXES.sql`
- `CREATE_AVATAR_STORAGE_BUCKET.sql`
- `create_city_centers_table.sql`
- `CREATE_CONNECTION_DEGREE_REVIEWS_SYSTEM.sql`
- `CREATE_FRIENDS_REVIEWS_VIEWS_SIMPLE.sql`
- `CREATE_FRIENDS_REVIEWS_VIEWS.sql`
- `create_test_accounts.sql`
- `create_testbiz_account_fix.sql`
- `CREATE_USER_STREAMING_STATS_TABLE.sql`
- `DEBUG_CITY_FILTERING 2.sql`
- `DEBUG_CITY_FILTERING.sql`
- `DEBUG_FUNCTION_STEP_BY_STEP 2.sql`
- `DEBUG_FUNCTION_STEP_BY_STEP.sql`
- `debug_goose_events.sql`
- `DEBUG_METRO_COVERAGE 2.sql`
- `DEBUG_METRO_COVERAGE.sql`
- `debug_output.sql`
- `debug_promotion_count.sql`
- `debug_recommendations.sql`
- `DIAGNOSE_RPC_FUNCTION.sql`
- `ENHANCE_STREAMING_STATS_TABLE.sql`
- `FINAL_CLEAN_DATABASE_FIX.sql`
- `FINAL_PRICE_RANGE_FIX 2.sql`
- `FINAL_PRICE_RANGE_FIX.sql`
- `FIX_ACCOUNT_TYPE_TYPE_MISMATCH.sql`
- `FIX_ARRAY_LENGTH_FUNCTION_ERROR.sql`
- `FIX_ARTIST_FOLLOWS_SYSTEM.sql`
- `FIX_ARTIST_PROFILE_FUNCTION.sql`
- `FIX_CHAT_PARTICIPANTS_TABLE.sql`
- `FIX_CITY_CENTERS_NULL_STATE.sql`
- `fix_connection_degree_reviews_account_type.sql`
- `fix_constraint_issue.sql`
- `fix_constraint_violation.sql`
- `fix_event_duplication.sql`
- `fix_event_management_promotion_fields.sql`
- `fix_feed_join_logic.sql`
- `fix_genre_column.sql`
- `FIX_PRICE_RANGE_NULL 2.sql`
- `FIX_PRICE_RANGE_NULL.sql`
- `fix_profile_avatars_for_recommendations.sql`
- `fix_promotion_detection.sql`
- `fix_promotion_trigger.sql`
- `fix_rls_for_recommendations.sql`
- `FIX_TIME_RANGE_FILTERING.sql`
- `FIX_TRIGGER_NOW.sql`
- `FIX_UPDATE_FUNCTION 2.sql`
- `FIX_UPDATE_FUNCTION.sql`
- `FIX_USER_REVIEWS_MISSING_COLUMNS.sql`
- `FIX_VIEW_AUTH_CONTEXT.sql`
- `FIX_VIEW_COLUMN_MISMATCH.sql`
- `IMMEDIATE_REVIEW_FIX.sql`
- `MANUAL_FIX_CITY_CENTERS.sql`
- `merge_reviews_views_final.sql`
- `merge_reviews_views_safe.sql`
- `merge_reviews_views.sql`
- `MINIMAL_FIX.sql`
- `PARAMETER_NAME_FIX.sql`
- `PERFORMANCE_OPTIMIZATION.sql`
- `QUICK_FIX_3NF_ISSUES.sql`
- `QUICK_RPC_DIAGNOSTIC.sql`
- `QUICK_TRIGGER_FIX.sql`
- `refresh_and_test_recommendations.sql`
- `SIMPLE_FUNCTION_TEST.sql`
- `TEST_RPC_FUNCTION.sql`
- `TEST_RPC_FUNCTIONS.sql`
- `UPDATE_TIME_RANGE_CONSTRAINT.sql`
- `verify_3nf_compliance.sql`
- `VERIFY_AND_FIX_RPC_FUNCTION.sql`

**Total: ~80 SQL files in root that should be deleted**

---

## 📄 **SAFE TO DELETE** (Root Directory Markdown Files)

These are outdated planning/fix documentation files:

### High Priority Deletions:
- `3NF_ANALYSIS.md` (if already migrated)
- `3NF_MIGRATION_GUIDE.md` (if migration complete)
- `ANALYTICS_TROUBLESHOOTING.md`
- `BELLI_STYLE_REVIEW_IMPLEMENTATION.md`
- `COLUMN_MAPPING_VERIFICATION.md`
- `CONNECTION_DEGREE_IMPLEMENTATION_PLAN.md`
- `COORDINATE_BASED_CITY_FILTERING.md`
- `DATABASE_NORMALIZATION_GUIDE.md`
- `DRAFT_BUG_NUCLEAR_FIX.md`
- `EVENT_GROUPS_3NF_STATUS.md`
- `EXPLAIN_NOTIFICATIONS.md`
- `FINAL_COLUMN_MAPPING.md`
- `FRIENDS_REVIEWS_IMPLEMENTATION_SUMMARY.md`
- `HOW_TO_APPLY_FIX.md`
- `IMMEDIATE_FIX_SOLUTION.md`
- `INSTAGRAM_FEED_INTEGRATION_GUIDE.md`
- `INTEREST_EVENTS_FIX_SUMMARY.md`
- `LOCATION_FILTERING_ANALYSIS.md`
- `MIGRATION_STEPS.md`
- `ON_CONFLICT_FIX_SUMMARY.md`
- `PHOTOS_TYPE_HANDLING_EXPLANATION.md`
- `PROFILE_PICTURE_UPLOAD_SETUP.md`
- `REVIEW_SYSTEM_FIXES_SUMMARY.md`
- `REVIEWS_TABLE_SCHEMA.md`
- `RUN_MIGRATION_INSTRUCTIONS.md`
- `RUN_THESE_FILES_IN_ORDER.md`
- `SCHEMA_TYPE_VERIFICATION.md`
- `SUPABASE_CORS_FIX.md`
- `TROUBLESHOOT_400_ERROR.md`

**Total: ~30 markdown files in root that could be archived/deleted**

---

## 📁 **ARCHIVE CANDIDATES** (Keep but Move)

### `supabase/migrations/consolidation/` and `consolidation_v2/`
These appear to be old consolidation attempts. If consolidation is complete, these can be archived:
- **~50+ SQL files** in consolidation folders
- **~10+ markdown files** documenting consolidation

**Recommendation:** Move entire folders to `docs/archive/consolidation/` if consolidation is complete.

---

## ✅ **KEEP** (Important Files)

### Root Directory (Keep):
- `README.md` - Main documentation
- `DEPLOYMENT.md` - Deployment instructions
- `DEV_SETUP.md` - Development setup
- `VERCEL_ENV_SETUP.md` - Environment setup
- `FEATURES.md` - Feature documentation
- `INTEGRATIONS.md` - Integration guide
- `package.json`, `tsconfig.json`, `vite.config.ts`, etc. - Config files

### SQL Directory Structure (Keep):
- `sql/analysis/` - Useful debug queries
- `sql/fixes/` - Organized fix scripts
- `sql/scripts/` - Utility scripts
- `sql/seeds/` - Seed data

### Supabase Migrations (Keep):
- `supabase/migrations/` - Official migrations (keep all timestamped ones)
- **Exception:** Consolidation folders if consolidation is complete

---

## 🎯 **Recommended Action Plan**

### Phase 1: Quick Wins (Safe Deletions)
1. Delete all root-level SQL fix files (~80 files)
2. Archive outdated root-level markdown files (~30 files) to `docs/archive/`

### Phase 2: Consolidation Cleanup
1. Verify consolidation is complete
2. If yes, move `supabase/migrations/consolidation/` and `consolidation_v2/` to `docs/archive/consolidation/`

### Phase 3: Documentation Cleanup
1. Review `docs/archive/` - 91 files already archived (good!)
2. Consider if any can be permanently deleted

---

## 📊 **Impact Summary**

- **Files to Delete:** ~110 files (80 SQL + 30 MD)
- **Files to Archive:** ~60 files (consolidation folders)
- **Space Saved:** Significant reduction in root directory clutter
- **Risk Level:** Low (these are fix/planning files, not production code)

---

## ⚠️ **Before Deleting**

1. **Verify migrations are applied:** Check that SQL fixes in root have been converted to proper migrations
2. **Check git history:** Ensure important fixes are documented in commit messages
3. **Backup:** Consider creating a backup branch before mass deletion
4. **Test:** After cleanup, verify the app still builds and runs

---

## 🚀 **Quick Cleanup Script**

Would you like me to create a script to:
1. Move root SQL files to `sql/archive/` (safer than deleting)
2. Move root markdown files to `docs/archive/root-docs/`
3. Keep a log of what was moved

This way you can review before permanent deletion!

