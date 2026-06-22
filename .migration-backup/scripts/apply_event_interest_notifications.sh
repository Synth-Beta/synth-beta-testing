#!/bin/bash

# Script to apply the event interest notifications migration
echo "🎵 Applying Event Interest Notifications Migration..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Error: Supabase CLI is not installed. Please install it first."
    echo "   Visit: https://supabase.com/docs/guides/cli"
    exit 1
fi

# Apply the migration
echo "📝 Applying migration: 20250127000003_add_event_interest_notifications.sql"
supabase db push

if [ $? -eq 0 ]; then
    echo "✅ Migration applied successfully!"
    echo ""
    echo "🎉 Event Interest Notifications are now active!"
    echo ""
    echo "📋 What this does:"
    echo "   • When someone expresses interest in an event (swipes 'like')"
    echo "   • All their friends will receive a notification"
    echo "   • Notifications include event details and friend's name"
    echo ""
    echo "🔔 Notification details:"
    echo "   • Type: 'event_interest'"
    echo "   • Icon: 🎵"
    echo "   • Color: Yellow theme"
    echo "   • Message: '[Friend Name] is interested in [Event] at [Venue] on [Date]'"
    echo ""
    echo "✨ The system is ready to use!"
else
    echo "❌ Error: Migration failed to apply"
    echo "   Please check the error messages above and try again"
    exit 1
fi
