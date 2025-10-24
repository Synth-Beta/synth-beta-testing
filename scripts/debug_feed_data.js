// Debug script to help analyze the feed data
// Copy and paste the console output from your browser to analyze it

console.log('🔍 Feed Data Debug Helper');
console.log('========================');

console.log('\n📊 To debug your feed data:');
console.log('1. Open browser console');
console.log('2. Look for the "✅ Personalized feed loaded:" log');
console.log('3. Expand the "scores" array to see individual events');
console.log('4. Look for events with is_promoted: true');

console.log('\n🔍 What to look for in the scores array:');
console.log('- Each event should have: artist, score, diversity_penalty, artist_rank');
console.log('- Look for any events with is_promoted: true');
console.log('- Look for any events with promotion_tier: "basic", "premium", or "featured"');
console.log('- Promoted events should have higher scores');

console.log('\n📈 Expected score ranges:');
console.log('- Non-promoted events: 0-100 points');
console.log('- Basic promoted: +10 points (up to 110)');
console.log('- Premium promoted: +18 points (up to 118)');
console.log('- Featured promoted: +25 points (up to 125)');

console.log('\n🎯 If you see promoted events:');
console.log('- They should appear higher in the feed');
console.log('- They should show PromotedEventBadge in the UI');
console.log('- Their scores should be higher than non-promoted events');

console.log('\n⚠️ If you don\'t see promoted events:');
console.log('1. Check if any promotions exist in the database');
console.log('2. Verify the database function includes the promotion JOIN');
console.log('3. Check if the migration was applied correctly');

console.log('\n📝 To create a test promotion:');
console.log('1. Go to an event you own in the app');
console.log('2. Click the "Promote" button');
console.log('3. Create a Basic promotion ($49.99)');
console.log('4. Check if the event appears as promoted in the feed');

console.log('\n✅ Success indicators:');
console.log('- Feed shows events with is_promoted: true');
console.log('- Promoted events have higher relevance scores');
console.log('- Event cards show PromotedEventBadge');
console.log('- No "Anonymous" text on event cards');
