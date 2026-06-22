#!/bin/bash

# Apply the artist/venue relationships migration
echo "🚀 Applying artist/venue relationships migration..."

# Check if supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Please install it first:"
    echo "npm install -g supabase"
    exit 1
fi

# Check if we're in a supabase project
if [ ! -f "supabase/config.toml" ]; then
    echo "❌ Not in a Supabase project directory. Please run this from your project root."
    exit 1
fi

# Apply the migration
echo "📝 Applying migration: 20250125000002_fix_artist_venue_relationships.sql"
supabase db push

if [ $? -eq 0 ]; then
    echo "✅ Migration applied successfully!"
    echo ""
    echo "🔍 Next steps:"
    echo "1. Test the relationships with: node test_artist_venue_relationships.js"
    echo "2. Update your components to use EnhancedReviewService"
    echo "3. Test the artist/venue click functionality in your app"
else
    echo "❌ Migration failed. Check the error messages above."
    exit 1
fi
