#!/bin/bash

# Apply the interested events visibility fix
echo "🔧 Applying interested events visibility fix..."

# Apply the migration
echo "📝 Applying database migration..."
npx supabase db push

# Check if migration was successful
if [ $? -eq 0 ]; then
    echo "✅ Migration applied successfully!"
    echo ""
    echo "🎉 Fix Summary:"
    echo "  • Created missing get_user_interested_events RPC function"
    echo "  • Created get_users_interested_in_event RPC function"
    echo "  • Fixed conflicting RLS policies on user_jambase_events table"
    echo "  • Updated EventUsersView component to use new RPC functions"
    echo "  • Improved error handling in ProfileView component"
    echo ""
    echo "🚀 The following issues should now be resolved:"
    echo "  • Users can now see other users' interested events on profiles"
    echo "  • Users can now see who is interested in events on event details"
    echo "  • Improved performance with RPC functions and proper indexing"
else
    echo "❌ Migration failed. Please check the error messages above."
    exit 1
fi
