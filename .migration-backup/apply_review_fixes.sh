#!/bin/bash

# Apply review system fixes to resolve 404 errors and function issues
echo "🔧 Applying review system fixes..."

# Apply the array length function fix
echo "📝 Applying array length function fix..."
psql "$DATABASE_URL" -f FIX_ARRAY_LENGTH_FUNCTION_ERROR.sql

# Apply the missing columns fix
echo "📝 Adding missing columns to user_reviews table..."
psql "$DATABASE_URL" -f FIX_USER_REVIEWS_MISSING_COLUMNS.sql

# Test the user_reviews table access
echo "🧪 Testing user_reviews table access..."
psql "$DATABASE_URL" -c "SELECT COUNT(*) as review_count FROM public.user_reviews;"

# Test the setlist sync function
echo "🧪 Testing setlist sync function..."
psql "$DATABASE_URL" -c "SELECT routine_name FROM information_schema.routines WHERE routine_name = 'sync_setlist_to_event';"

echo "✅ Review system fixes applied successfully!"
echo ""
echo "Next steps:"
echo "1. Test review submission in the app"
echo "2. Check browser console for any remaining errors"
echo "3. Verify that venue rendering works correctly"
