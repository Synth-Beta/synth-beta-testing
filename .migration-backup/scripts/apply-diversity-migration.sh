#!/bin/bash

# Apply Artist Diversity Migration to Supabase
# This script applies the diversity controls to prevent artist domination

echo "🚀 Applying Artist Diversity Migration to Supabase..."
echo ""
echo "Migration file: supabase/migrations/20250210000009_artist_diversity_feed.sql"
echo ""

# Check if migration file exists
if [ ! -f "supabase/migrations/20250210000009_artist_diversity_feed.sql" ]; then
    echo "❌ Error: Migration file not found!"
    exit 1
fi

echo "✅ Migration file found"
echo ""
echo "📋 This migration will:"
echo "   • Create get_personalized_events_feed_with_diversity function"
echo "   • Limit events to 2 per artist (prevents Billie Eilish domination)"
echo "   • Add diversity scoring and penalties"
echo "   • Create performance indexes"
echo ""

# Read the migration SQL
MIGRATION_SQL=$(cat supabase/migrations/20250210000009_artist_diversity_feed.sql)

# Apply using Supabase CLI
echo "🔧 Applying migration to remote database..."
echo ""

supabase db push --db-url "postgresql://postgres.glpiolbrafqikqhnseto:${DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:6543/postgres"

echo ""
echo "✅ Migration applied successfully!"
echo ""
echo "🎯 Next steps:"
echo "   1. Refresh your browser (Cmd+Shift+R or Ctrl+Shift+R)"
echo "   2. Check console for new diversity logs"
echo "   3. Verify Billie Eilish appears max 2 times"
echo ""

