// Quick check to see if promotions are working in your feed
console.log('🔍 Promotion Status Check');
console.log('=======================');

console.log('\n📊 In your browser console, look for:');
console.log('1. The "scores" array in the personalized feed log');
console.log('2. Each event should have these fields:');
console.log('   - artist: "Artist Name"');
console.log('   - score: number (0-125)');
console.log('   - diversity_penalty: number');
console.log('   - artist_rank: number');
console.log('   - is_promoted: true/false');
console.log('   - promotion_tier: "basic"/"premium"/"featured"/null');

console.log('\n🎯 Look for promoted events:');
console.log('- Events with is_promoted: true');
console.log('- Events with promotion_tier: "basic", "premium", or "featured"');
console.log('- Events with scores above 100 (indicating promotion boost)');

console.log('\n📈 Score interpretation:');
console.log('- 0-100: Non-promoted events');
console.log('- 101-110: Basic promoted (+10 boost)');
console.log('- 111-118: Premium promoted (+18 boost)');
console.log('- 119-125: Featured promoted (+25 boost)');

console.log('\n🧪 To test promotions:');
console.log('1. Go to an event you own');
console.log('2. Click "Promote" button');
console.log('3. Create a Basic promotion');
console.log('4. Refresh the feed');
console.log('5. Look for the promoted event with higher score');

console.log('\n✅ Success indicators:');
console.log('- Feed shows events with is_promoted: true');
console.log('- Promoted events have scores > 100');
console.log('- Event cards show PromotedEventBadge');
console.log('- No "Anonymous" text on event cards');

console.log('\n⚠️ If no promoted events found:');
console.log('- No active promotions in database');
console.log('- Need to create test promotions');
console.log('- Database migration might not be applied');
