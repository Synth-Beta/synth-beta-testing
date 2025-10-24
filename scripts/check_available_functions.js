import { createClient } from '@supabase/supabase-js';

// Environment variables should be set in the shell

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   VITE_SUPABASE_URL:', !!supabaseUrl);
  console.error('   VITE_SUPABASE_ANON_KEY:', !!supabaseAnonKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkAvailableFunctions() {
  try {
    console.log('🔍 Checking available personalized feed functions...');
    
    // Test user ID
    const testUserId = '349bda34-7878-4c10-9f86-ec5888e55571';
    
    // Test 1: get_personalized_events_feed (genre-first)
    console.log('\n📊 Testing get_personalized_events_feed (genre-first algorithm)...');
    try {
      const { data: genreData, error: genreError } = await supabase.rpc('get_personalized_events_feed', {
        p_user_id: testUserId,
        p_limit: 5,
        p_offset: 0,
        p_include_past: false
      });
      
      if (genreError) {
        console.error('❌ Genre-first function error:', genreError);
      } else {
        console.log('✅ Genre-first function works:', {
          count: genreData?.length || 0,
          hasPromotionFields: genreData?.[0] ? {
            is_promoted: genreData[0].is_promoted,
            promotion_tier: genreData[0].promotion_tier,
            active_promotion_id: genreData[0].active_promotion_id
          } : 'No data',
          topEvents: genreData?.slice(0, 3).map(e => ({
            artist: e.artist_name,
            score: e.relevance_score,
            promoted: e.is_promoted
          })) || []
        });
      }
    } catch (error) {
      console.error('❌ Genre-first function failed:', error);
    }
    
    // Test 2: get_personalized_events_feed_with_diversity
    console.log('\n📊 Testing get_personalized_events_feed_with_diversity...');
    try {
      const { data: diversityData, error: diversityError } = await supabase.rpc('get_personalized_events_feed_with_diversity', {
        p_user_id: testUserId,
        p_limit: 5,
        p_offset: 0,
        p_max_per_artist: 3,
        p_include_past: false
      });
      
      if (diversityError) {
        console.error('❌ Diversity function error:', diversityError);
      } else {
        console.log('✅ Diversity function works:', {
          count: diversityData?.length || 0,
          hasPromotionFields: diversityData?.[0] ? {
            is_promoted: diversityData[0].is_promoted,
            promotion_tier: diversityData[0].promotion_tier,
            active_promotion_id: diversityData[0].active_promotion_id
          } : 'No data',
          topEvents: diversityData?.slice(0, 3).map(e => ({
            artist: e.artist_name,
            score: e.relevance_score,
            promoted: e.is_promoted
          })) || []
        });
      }
    } catch (error) {
      console.error('❌ Diversity function failed:', error);
    }
    
    console.log('\n🎯 Recommendation:');
    console.log('- If genre-first function works with promotions, use that');
    console.log('- If only diversity function works, stick with that');
    console.log('- Both should include promotion fields via JOIN with event_promotions table');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
checkAvailableFunctions();
