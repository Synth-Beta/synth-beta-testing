import { createClient } from '@supabase/supabase-js';

// Environment variables should be set in the shell
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   VITE_SUPABASE_URL:', !!supabaseUrl);
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTestPromotion() {
  try {
    console.log('🎯 Creating test promotion...');
    
    // First, let's get a random event to promote
    const { data: events, error: eventsError } = await supabase
      .from('jambase_events')
      .select('id, title, artist_name')
      .gte('event_date', new Date().toISOString())
      .limit(1);
    
    if (eventsError || !events?.length) {
      console.error('❌ No events found:', eventsError);
      return;
    }
    
    const event = events[0];
    console.log('📅 Selected event:', event.title, 'by', event.artist_name);
    
    // Create a test promotion
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    
    const { data: promotion, error: promotionError } = await supabase
      .from('event_promotions')
      .insert({
        event_id: event.id,
        promoted_by_user_id: '349bda34-7878-4c10-9f86-ec5888e55571', // Test user ID
        promotion_tier: 'basic',
        promotion_status: 'active',
        price_paid: 49.99,
        currency: 'USD',
        payment_status: 'completed',
        starts_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        impressions: 0,
        clicks: 0,
        conversions: 0
      })
      .select()
      .single();
    
    if (promotionError) {
      console.error('❌ Failed to create promotion:', promotionError);
      return;
    }
    
    console.log('✅ Test promotion created:', {
      id: promotion.id,
      event: event.title,
      tier: promotion.promotion_tier,
      status: promotion.promotion_status,
      expires: promotion.expires_at
    });
    
    // Now test if it appears in the personalized feed
    console.log('\n🧪 Testing if promotion appears in feed...');
    
    const { data: feedData, error: feedError } = await supabase.rpc('get_personalized_events_feed_with_diversity', {
      p_user_id: '349bda34-7878-4c10-9f86-ec5888e55571',
      p_limit: 20,
      p_offset: 0,
      p_max_per_artist: 3,
      p_include_past: false
    });
    
    if (feedError) {
      console.error('❌ Feed error:', feedError);
      return;
    }
    
    const promotedEvents = feedData?.filter(e => e.is_promoted) || [];
    console.log('🎯 Promoted events in feed:', promotedEvents.length);
    
    if (promotedEvents.length > 0) {
      console.log('📈 Promoted events details:');
      promotedEvents.forEach(e => {
        console.log(`  - ${e.artist_name}: ${e.title} (${e.promotion_tier}, score: ${e.relevance_score})`);
      });
    } else {
      console.log('⚠️ No promoted events found in feed');
      console.log('🔍 All events in feed:');
      feedData?.slice(0, 5).forEach(e => {
        console.log(`  - ${e.artist_name}: ${e.title} (promoted: ${e.is_promoted}, score: ${e.relevance_score})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
createTestPromotion();
