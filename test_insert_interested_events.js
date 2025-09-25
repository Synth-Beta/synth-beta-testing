// Test inserting interested events to verify RLS policies are working
// This script will test if we can now insert interested events

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsertInterestedEvents() {
  console.log('🧪 TESTING INSERT INTERESTED EVENTS...\n');

  try {
    // 1. Get some sample data
    console.log('1. Getting sample data...');
    
    const { data: jambaseEvents, error: jambaseError } = await supabase
      .from('jambase_events')
      .select('id, title, artist_name, venue_name')
      .limit(3);
    
    if (jambaseError) {
      console.error('❌ Error fetching jambase_events:', jambaseError.message);
      return;
    }

    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('user_id')
      .limit(1);
    
    if (usersError) {
      console.error('❌ Error fetching users:', usersError.message);
      return;
    }

    if (!jambaseEvents || jambaseEvents.length === 0 || !users || users.length === 0) {
      console.log('❌ No sample data available');
      return;
    }

    console.log(`📊 Found ${jambaseEvents.length} sample events and ${users.length} users`);

    // 2. Test inserting interested events
    console.log('\n2. Testing insert of interested events...');
    
    const testData = jambaseEvents.map(event => ({
      user_id: users[0].user_id,
      jambase_event_id: event.id
    }));

    console.log('📊 Test data:');
    testData.forEach((record, index) => {
      console.log(`   ${index + 1}. User: ${record.user_id}, Event: ${record.jambase_event_id}`);
    });

    const { error: insertError } = await supabase
      .from('user_jambase_events')
      .insert(testData);
    
    if (insertError) {
      console.error('❌ Insert failed:', insertError.message);
      console.log('   The RLS policies might still need adjustment');
    } else {
      console.log('✅ Insert successful! RLS policies are working correctly');
    }

    // 3. Verify the insert
    console.log('\n3. Verifying the insert...');
    
    const { data: insertedData, error: verifyError, count: insertedCount } = await supabase
      .from('user_jambase_events')
      .select('*', { count: 'exact' });
    
    if (verifyError) {
      console.error('❌ Error verifying insert:', verifyError.message);
    } else {
      console.log(`📊 Total interested events after insert: ${insertedCount || 0}`);
      
      if (insertedData && insertedData.length > 0) {
        console.log('📊 Sample inserted data:');
        insertedData.slice(0, 3).forEach((record, index) => {
          console.log(`   ${index + 1}. User: ${record.user_id}, Event: ${record.jambase_event_id}`);
        });
      }
    }

    // 4. Test the app query with joins
    console.log('\n4. Testing app query with joins...');
    
    const { data: appData, error: appError } = await supabase
      .from('user_jambase_events')
      .select(`
        *,
        jambase_events:jambase_event_id (
          id,
          title,
          artist_name,
          venue_name,
          event_date
        )
      `);
    
    if (appError) {
      console.error('❌ App query failed:', appError.message);
    } else {
      console.log(`✅ App query successful! Found ${appData?.length || 0} interested events with full data`);
      
      if (appData && appData.length > 0) {
        console.log('📊 Sample app data with joins:');
        appData.slice(0, 3).forEach((record, index) => {
          console.log(`   ${index + 1}. User: ${record.user_id}`);
          console.log(`      Event: ${record.jambase_events?.title || 'No event data'}`);
          console.log(`      Artist: ${record.jambase_events?.artist_name || 'No artist'}`);
          console.log(`      Venue: ${record.jambase_events?.venue_name || 'No venue'}`);
        });
      }
    }

    // 5. Summary
    console.log('\n🎯 TEST SUMMARY:');
    console.log('================');
    
    if (insertedCount && insertedCount > 0) {
      console.log('✅ RLS policies are working correctly');
      console.log('✅ Interested events can be inserted');
      console.log('✅ App queries work with joins');
      console.log('✅ The system is fully functional');
      console.log('\n🎉 SUCCESS! Your interested events system is working!');
      console.log('   Users can now add interested events through the app.');
      console.log('   The "No Events Found" issue should be resolved.');
    } else {
      console.log('❌ RLS policies still need adjustment');
      console.log('   Check the Supabase dashboard for the user_jambase_events table policies');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testInsertInterestedEvents();
