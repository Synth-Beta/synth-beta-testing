// Test script for simple artist/venue service
// This tests the functionality without requiring database changes

import { createClient } from '@supabase/supabase-js';

// You'll need to replace these with your actual Supabase credentials
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'your-supabase-url';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'your-supabase-key';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSimpleService() {
  console.log('🔍 Testing Simple Artist/Venue Service...\n');

  try {
    // 1. Test getting an artist by name
    console.log('1. Testing artist lookup by name:');
    const { data: events, error: eventsError } = await supabase
      .from('jambase_events')
      .select('artist_name, venue_name')
      .not('artist_name', 'is', null)
      .limit(5);
    
    if (eventsError) {
      console.error('❌ Error getting events:', eventsError);
    } else if (events && events.length > 0) {
      const testArtist = events[0].artist_name;
      console.log(`✅ Testing with artist: "${testArtist}"`);
      
      // Test the simple service logic
      const { data: artistData, error: artistError } = await supabase
        .from('artists')
        .select('*')
        .eq('name', testArtist)
        .single();
      
      if (artistData && !artistError) {
        console.log('✅ Found artist in artists table:', artistData.name);
      } else {
        console.log('⚠️  Artist not found in artists table, will use fallback');
      }
      
      // Test getting events for this artist
      const { data: artistEvents, error: artistEventsError } = await supabase
        .from('jambase_events')
        .select('id, title, venue_name, event_date, venue_city, venue_state')
        .eq('artist_name', testArtist)
        .order('event_date', { ascending: false })
        .limit(5);
      
      if (artistEventsError) {
        console.error('❌ Error getting artist events:', artistEventsError);
      } else {
        console.log(`✅ Found ${artistEvents.length} events for "${testArtist}"`);
        if (artistEvents.length > 0) {
          console.log('Sample event:', artistEvents[0]);
        }
      }
    } else {
      console.log('⚠️  No events found to test with');
    }

    // 2. Test getting a venue by name
    console.log('\n2. Testing venue lookup by name:');
    if (events && events.length > 0) {
      const testVenue = events[0].venue_name;
      console.log(`✅ Testing with venue: "${testVenue}"`);
      
      // Test the simple service logic
      const { data: venueData, error: venueError } = await supabase
        .from('venues')
        .select('*')
        .eq('name', testVenue)
        .single();
      
      if (venueData && !venueError) {
        console.log('✅ Found venue in venues table:', venueData.name);
      } else {
        console.log('⚠️  Venue not found in venues table, will use fallback');
      }
      
      // Test getting events for this venue
      const { data: venueEvents, error: venueEventsError } = await supabase
        .from('jambase_events')
        .select('id, title, artist_name, event_date, venue_city, venue_state')
        .eq('venue_name', testVenue)
        .order('event_date', { ascending: false })
        .limit(5);
      
      if (venueEventsError) {
        console.error('❌ Error getting venue events:', venueEventsError);
      } else {
        console.log(`✅ Found ${venueEvents.length} events for "${testVenue}"`);
        if (venueEvents.length > 0) {
          console.log('Sample event:', venueEvents[0]);
        }
      }
    }

    // 3. Check what tables exist
    console.log('\n3. Checking existing tables:');
    const tables = ['artists', 'venues', 'jambase_events', 'user_reviews'];
    
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
      
      if (error) {
        console.log(`❌ Table ${table}: ${error.message}`);
      } else {
        console.log(`✅ Table ${table}: ${data ? data.length : 0} records (sample checked)`);
      }
    }

    console.log('\n🎉 Simple service test completed!');
    console.log('\n📝 Next steps:');
    console.log('1. Run the SQL script in Supabase to add the missing columns');
    console.log('2. Test the artist/venue click functionality in your app');
    console.log('3. The simple service will work even without the database changes');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testSimpleService();
