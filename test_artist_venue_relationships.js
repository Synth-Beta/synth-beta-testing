// Test script for artist/venue relationships
// Run this after applying the migration to verify everything works

const { createClient } = require('@supabase/supabase-js');

// You'll need to replace these with your actual Supabase credentials
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'your-supabase-url';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'your-supabase-key';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRelationships() {
  console.log('🔍 Testing Artist/Venue Relationships...\n');

  try {
    // 1. Check the relationship summary
    console.log('1. Checking relationship summary:');
    const { data: summary, error: summaryError } = await supabase
      .from('relationship_summary')
      .select('*');
    
    if (summaryError) {
      console.error('❌ Error getting summary:', summaryError);
    } else {
      console.log('✅ Summary:', summary);
    }

    // 2. Test the enhanced reviews view
    console.log('\n2. Testing enhanced reviews view:');
    const { data: reviews, error: reviewsError } = await supabase
      .from('enhanced_reviews_with_profiles')
      .select('*')
      .limit(5);
    
    if (reviewsError) {
      console.error('❌ Error getting reviews:', reviewsError);
    } else {
      console.log(`✅ Found ${reviews.length} reviews with enhanced data`);
      if (reviews.length > 0) {
        const review = reviews[0];
        console.log('Sample review data:');
        console.log('- Artist UUID:', review.artist_uuid);
        console.log('- Venue UUID:', review.venue_uuid);
        console.log('- Artist Name:', review.artist_normalized_name);
        console.log('- Venue Name:', review.venue_normalized_name);
      }
    }

    // 3. Test artist events function
    console.log('\n3. Testing artist events function:');
    if (reviews && reviews.length > 0 && reviews[0].artist_uuid) {
      const { data: artistEvents, error: artistEventsError } = await supabase
        .rpc('get_artist_events', {
          artist_uuid: reviews[0].artist_uuid,
          limit_count: 5
        });
      
      if (artistEventsError) {
        console.error('❌ Error getting artist events:', artistEventsError);
      } else {
        console.log(`✅ Found ${artistEvents.length} events for artist`);
        if (artistEvents.length > 0) {
          console.log('Sample event:', artistEvents[0]);
        }
      }
    } else {
      console.log('⚠️  No artist UUID found in reviews to test');
    }

    // 4. Test venue events function
    console.log('\n4. Testing venue events function:');
    if (reviews && reviews.length > 0 && reviews[0].venue_uuid) {
      const { data: venueEvents, error: venueEventsError } = await supabase
        .rpc('get_venue_events', {
          venue_uuid: reviews[0].venue_uuid,
          limit_count: 5
        });
      
      if (venueEventsError) {
        console.error('❌ Error getting venue events:', venueEventsError);
      } else {
        console.log(`✅ Found ${venueEvents.length} events for venue`);
        if (venueEvents.length > 0) {
          console.log('Sample event:', venueEvents[0]);
        }
      }
    } else {
      console.log('⚠️  No venue UUID found in reviews to test');
    }

    // 5. Check if we have any artists in the database
    console.log('\n5. Checking artists table:');
    const { data: artists, error: artistsError } = await supabase
      .from('artists')
      .select('id, name, jambase_artist_id')
      .limit(5);
    
    if (artistsError) {
      console.error('❌ Error getting artists:', artistsError);
    } else {
      console.log(`✅ Found ${artists.length} artists in database`);
      if (artists.length > 0) {
        console.log('Sample artist:', artists[0]);
      }
    }

    // 6. Check if we have any venues in the database
    console.log('\n6. Checking venues table:');
    const { data: venues, error: venuesError } = await supabase
      .from('venues')
      .select('id, name, jambase_venue_id')
      .limit(5);
    
    if (venuesError) {
      console.error('❌ Error getting venues:', venuesError);
    } else {
      console.log(`✅ Found ${venues.length} venues in database`);
      if (venues.length > 0) {
        console.log('Sample venue:', venues[0]);
      }
    }

    console.log('\n🎉 Test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testRelationships();
