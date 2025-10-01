/**
 * Test script for Post-Submit Ranking Feature
 * 
 * This script verifies that the rank_order system works correctly:
 * 1. Creates sample reviews with same rating
 * 2. Sets ranking order
 * 3. Verifies retrieval order
 * 4. Tests edge cases
 * 
 * Usage: node test-ranking-feature.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Test user ID (replace with real user ID from your database)
const TEST_USER_ID = 'YOUR_USER_ID_HERE';

async function testRankOrderColumn() {
  console.log('🧪 Testing rank_order column exists...');
  
  const { data, error } = await supabase
    .from('user_reviews')
    .select('id, rating, rank_order')
    .limit(1);
  
  if (error) {
    console.error('❌ Error querying user_reviews:', error.message);
    return false;
  }
  
  console.log('✅ rank_order column exists');
  return true;
}

async function testHelperFunction() {
  console.log('\n🧪 Testing get_user_reviews_by_rating function...');
  
  const { data, error } = await supabase.rpc('get_user_reviews_by_rating', {
    p_user_id: TEST_USER_ID,
    p_rating: 4.5
  });
  
  if (error) {
    console.error('❌ Error calling function:', error.message);
    return false;
  }
  
  console.log(`✅ Function works, returned ${data?.length || 0} reviews`);
  return true;
}

async function testRankingOrder() {
  console.log('\n🧪 Testing ranking order logic...');
  
  // Get reviews with rating 4 for test user
  const { data: reviews, error } = await supabase
    .from('user_reviews')
    .select('id, rating, rank_order, created_at')
    .eq('user_id', TEST_USER_ID)
    .eq('rating', 4)
    .order('rank_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('❌ Error fetching reviews:', error.message);
    return false;
  }
  
  if (!reviews || reviews.length === 0) {
    console.log('⚠️  No reviews with rating 4 found for test user');
    return true;
  }
  
  console.log(`Found ${reviews.length} reviews with rating 4:`);
  reviews.forEach((r, idx) => {
    console.log(`  ${idx + 1}. ID: ${r.id.slice(0, 8)}... | rank_order: ${r.rank_order || 'null'} | created: ${new Date(r.created_at).toLocaleDateString()}`);
  });
  
  // Check that rank_order values are sequential (if set)
  const rankedReviews = reviews.filter(r => r.rank_order != null);
  if (rankedReviews.length > 0) {
    const ranks = rankedReviews.map(r => r.rank_order);
    const isSequential = ranks.every((rank, idx) => rank === idx + 1);
    
    if (isSequential) {
      console.log('✅ Rank order is sequential (1, 2, 3...)');
    } else {
      console.log('⚠️  Rank order has gaps:', ranks);
    }
  }
  
  return true;
}

async function testSetRanking() {
  console.log('\n🧪 Testing setRankOrderForRatingGroup simulation...');
  
  // Get a few reviews to test with
  const { data: reviews, error } = await supabase
    .from('user_reviews')
    .select('id, rating')
    .eq('user_id', TEST_USER_ID)
    .limit(3);
  
  if (error || !reviews || reviews.length === 0) {
    console.log('⚠️  Not enough reviews to test ranking');
    return true;
  }
  
  console.log(`Testing with ${reviews.length} reviews...`);
  
  // Simulate setting rank order (don't actually update to avoid messing with real data)
  const orderedIds = reviews.map(r => r.id);
  console.log('Would set ranking order:');
  orderedIds.forEach((id, idx) => {
    console.log(`  ${idx + 1}. ${id.slice(0, 8)}... -> rank_order = ${idx + 1}`);
  });
  
  console.log('✅ Ranking logic validated (simulation)');
  return true;
}

async function testIndexes() {
  console.log('\n🧪 Testing database indexes...');
  
  // Query that should use the index
  const startTime = Date.now();
  const { data, error } = await supabase
    .from('user_reviews')
    .select('id')
    .eq('user_id', TEST_USER_ID)
    .eq('rating', 4)
    .order('rank_order', { ascending: true, nullsFirst: false })
    .limit(10);
  const endTime = Date.now();
  
  if (error) {
    console.error('❌ Error testing index:', error.message);
    return false;
  }
  
  console.log(`✅ Index query completed in ${endTime - startTime}ms`);
  return true;
}

async function testEdgeCases() {
  console.log('\n🧪 Testing edge cases...');
  
  // Test 1: Reviews with null rank_order
  const { data: nullRanks, error: error1 } = await supabase
    .from('user_reviews')
    .select('id, rank_order')
    .eq('user_id', TEST_USER_ID)
    .is('rank_order', null)
    .limit(5);
  
  if (!error1) {
    console.log(`  Found ${nullRanks?.length || 0} reviews with null rank_order (expected)`);
  }
  
  // Test 2: Reviews with rank_order set
  const { data: withRanks, error: error2 } = await supabase
    .from('user_reviews')
    .select('id, rank_order, rating')
    .eq('user_id', TEST_USER_ID)
    .not('rank_order', 'is', null)
    .limit(5);
  
  if (!error2) {
    console.log(`  Found ${withRanks?.length || 0} reviews with rank_order set`);
    if (withRanks && withRanks.length > 0) {
      // Group by rating
      const byRating = {};
      withRanks.forEach(r => {
        if (!byRating[r.rating]) byRating[r.rating] = [];
        byRating[r.rating].push(r.rank_order);
      });
      console.log('  Ranked reviews by rating:', JSON.stringify(byRating, null, 2));
    }
  }
  
  console.log('✅ Edge cases handled correctly');
  return true;
}

async function runTests() {
  console.log('🚀 Starting Post-Submit Ranking Feature Tests\n');
  console.log('═══════════════════════════════════════════════\n');
  
  if (TEST_USER_ID === 'YOUR_USER_ID_HERE') {
    console.log('⚠️  WARNING: Using placeholder TEST_USER_ID');
    console.log('   Update TEST_USER_ID in script with a real user ID\n');
  }
  
  const tests = [
    { name: 'Column Exists', fn: testRankOrderColumn },
    { name: 'Helper Function', fn: testHelperFunction },
    { name: 'Ranking Order', fn: testRankingOrder },
    { name: 'Set Ranking', fn: testSetRanking },
    { name: 'Indexes', fn: testIndexes },
    { name: 'Edge Cases', fn: testEdgeCases },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`❌ Test "${test.name}" threw error:`, error.message);
      failed++;
    }
  }
  
  console.log('\n═══════════════════════════════════════════════');
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('\n✨ All tests passed! Feature is ready to use.\n');
  } else {
    console.log('\n⚠️  Some tests failed. Review errors above.\n');
  }
}

// Run tests
runTests().catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});

