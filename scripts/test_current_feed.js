import { createClient } from '@supabase/supabase-js';

// Load environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   VITE_SUPABASE_URL:', !!supabaseUrl);
  console.error('   VITE_SUPABASE_ANON_KEY:', !!supabaseAnonKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testCurrentFeed() {
  try {
    console.log('🧪 Testing current personalized feed...');
    
    // Test user ID (you can change this to any user ID)
    const testUserId = '349bda34-7878-4c10-9f86-ec5888e55571';
    
    // Test the current function
    console.log('📊 Testing get_personalized_events_feed function...');
    const { data: feedData, error: feedError } = await supabase.rpc('get_personalized_events_feed', {
      p_user_id: testUserId,
      p_limit: 10,
      p_offset: 0,
      p_include_past: false
    });
    
    if (feedError) {
      console.error('❌ Feed error:', feedError);
      return;
    }
    
    console.log('✅ Feed data received:', {
      count: feedData?.length || 0,
      hasPromotionFields: feedData?.[0] ? {
        is_promoted: feedData[0].is_promoted,
        promotion_tier: feedData[0].promotion_tier,
        active_promotion_id: feedData[0].active_promotion_id
      } : 'No data',
      topEvents: feedData?.slice(0, 3).map(e => ({
        artist: e.artist_name,
        score: e.relevance_score,
        promoted: e.is_promoted
      })) || []
    });
    
    // Test if we have any promoted events
    const promotedEvents = feedData?.filter(e => e.is_promoted) || [];
    console.log('🎯 Promoted events found:', promotedEvents.length);
    
    if (promotedEvents.length > 0) {
      console.log('📈 Promoted events details:', promotedEvents.map(e => ({
        artist: e.artist_name,
        tier: e.promotion_tier,
        score: e.relevance_score
      })));
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testCurrentFeed();
