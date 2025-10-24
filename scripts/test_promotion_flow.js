import { createClient } from '@supabase/supabase-js';

// This script tests the promotion flow end-to-end
// It will help us understand if promotions are working correctly

console.log('🧪 Testing Promotion Flow');
console.log('========================');

// We'll need to manually test this in the browser since we need authentication
console.log('📝 Manual Testing Steps:');
console.log('1. Open the app in browser');
console.log('2. Navigate to an event you own');
console.log('3. Click "Promote" button');
console.log('4. Create a promotion (Basic tier)');
console.log('5. Check if the event appears as promoted in the feed');
console.log('6. Look for the PromotedEventBadge on the event card');

console.log('\n🔍 What to look for:');
console.log('- Event should have is_promoted: true');
console.log('- Event should have promotion_tier: "basic"');
console.log('- Event should have higher relevance_score');
console.log('- Event should show PromotedEventBadge in UI');

console.log('\n📊 Database checks:');
console.log('- Check event_promotions table for active promotions');
console.log('- Check if promotion_status = "active"');
console.log('- Check if starts_at <= now() AND expires_at >= now()');

console.log('\n🎯 Feed algorithm checks:');
console.log('- Promoted events should get +10 points (Basic tier)');
console.log('- Promoted events should appear higher in feed');
console.log('- Feed should use get_personalized_events_feed_with_diversity function');

console.log('\n✅ If all checks pass, the promotion system is working correctly!');
