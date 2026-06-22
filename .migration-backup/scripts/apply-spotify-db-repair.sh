#!/usr/bin/env bash
# Apply Spotify connect + DB repair migration to the linked Supabase project.
# Requires: npx supabase login (or SUPABASE_ACCESS_TOKEN) and project link.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "Applying migration: 20260614190000_spotify_and_db_repair.sql"
echo "  - interactions CHECK includes profile"
echo "  - notifications_with_details view"
echo "  - get_similar_users_to_friend RPC"
echo "  - get_or_refresh_feed_v5_cached + invalidate_personalized_feed_cache"
echo ""

npx supabase db push

echo ""
echo "Done. PostgREST schema reload is included in the migration (NOTIFY pgrst)."
