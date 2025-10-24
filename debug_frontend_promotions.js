// Debug script to check what the frontend is receiving
console.log('🔍 Frontend Promotion Debug');
console.log('========================');

// Check if the PersonalizedFeedService is receiving promotion data
// This should be added to the PersonalizedFeedService.ts file temporarily

// Add this to the PersonalizedFeedService.ts file in the getPersonalizedFeed method:
/*
console.log('🎯 Promotion Debug - Raw data from database:');
data.forEach((event, index) => {
  if (event.is_promoted) {
    console.log(`Promoted Event ${index + 1}:`, {
      title: event.title,
      artist_name: event.artist_name,
      is_promoted: event.is_promoted,
      promotion_tier: event.promotion_tier,
      active_promotion_id: event.active_promotion_id,
      relevance_score: event.relevance_score
    });
  }
});

console.log('🎯 Promotion Debug - Mapped data:');
const mappedData = data.map((row: any) => ({
  // ... existing mapping ...
  is_promoted: row.is_promoted || false,
  promotion_tier: (row.promotion_tier === 'basic' || row.promotion_tier === 'premium' || row.promotion_tier === 'featured') 
    ? row.promotion_tier as 'basic' | 'premium' | 'featured' 
    : null,
  active_promotion_id: row.active_promotion_id || null
}));

mappedData.forEach((event, index) => {
  if (event.is_promoted) {
    console.log(`Mapped Promoted Event ${index + 1}:`, {
      title: event.title,
      artist_name: event.artist_name,
      is_promoted: event.is_promoted,
      promotion_tier: event.promotion_tier,
      active_promotion_id: event.active_promotion_id
    });
  }
});
*/

console.log('📋 Instructions:');
console.log('1. Add the debug code above to PersonalizedFeedService.ts');
console.log('2. Refresh your app');
console.log('3. Check the console for promotion debug logs');
console.log('4. Look for "Promoted Event" logs in the console');
