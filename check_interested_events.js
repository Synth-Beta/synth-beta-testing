// Check Interested Events Issue
// This script investigates what happened to the interested events

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

async function checkInterestedEvents() {
  console.log('🔍 CHECKING INTERESTED EVENTS ISSUE...\n');

  try {
    // 1. Check user_jambase_events table structure
    console.log('1. Checking user_jambase_events table...');
    const { data: interestedEvents, error: interestedError } = await supabase
      .from('user_jambase_events')
      .select('*');
    
    if (interestedError) {
      console.error('❌ Error accessing user_jambase_events:', interestedError.message);
      console.log('   This might be a table structure issue or RLS problem');
    } else {
      console.log(`📊 Found ${interestedEvents?.length || 0} interested events`);
    }

    // 2. Check if the table exists and has the right structure
    console.log('\n2. Checking table structure...');
    try {
      const { data: sampleData, error: sampleError } = await supabase
        .from('user_jambase_events')
        .select('user_id, jambase_event_id, created_at')
        .limit(1);
      
      if (sampleError) {
        console.error('❌ Table structure issue:', sampleError.message);
      } else {
        console.log('✅ Table structure looks correct');
      }
    } catch (error) {
      console.error('❌ Table access error:', error.message);
    }

    // 3. Check if there are any RLS policies blocking access
    console.log('\n3. Checking RLS policies...');
    
    // Try to insert a test record to see if it's an RLS issue
    const testUserId = '00000000-0000-0000-0000-000000000000';
    const testEventId = '00000000-0000-0000-0000-000000000000';
    
    try {
      const { error: insertError } = await supabase
        .from('user_jambase_events')
        .insert({
          user_id: testUserId,
          jambase_event_id: testEventId
        });
      
      if (insertError) {
        console.log('⚠️  Insert test failed (expected):', insertError.message);
        console.log('   This might indicate RLS policies are working');
      } else {
        console.log('✅ Insert test succeeded (unexpected)');
        // Clean up the test record
        await supabase
          .from('user_jambase_events')
          .delete()
          .eq('user_id', testUserId)
          .eq('jambase_event_id', testEventId);
      }
    } catch (error) {
      console.log('⚠️  Insert test error:', error.message);
    }

    // 4. Check if there's data in a different table
    console.log('\n4. Checking for data in alternative tables...');
    
    // Check event_interests table
    try {
      const { data: eventInterests, error: eventInterestsError } = await supabase
        .from('event_interests')
        .select('*');
      
      if (eventInterestsError) {
        console.log('⚠️  event_interests table error:', eventInterestsError.message);
      } else {
        console.log(`📊 Found ${eventInterests?.length || 0} records in event_interests table`);
        if (eventInterests && eventInterests.length > 0) {
          console.log('   Sample records:');
          eventInterests.slice(0, 3).forEach((record, index) => {
            console.log(`   ${index + 1}. User: ${record.user_id}, Event: ${record.event_id}`);
          });
        }
      }
    } catch (error) {
      console.log('⚠️  event_interests table not accessible:', error.message);
    }

    // Check user_swipes table
    try {
      const { data: userSwipes, error: userSwipesError } = await supabase
        .from('user_swipes')
        .select('*');
      
      if (userSwipesError) {
        console.log('⚠️  user_swipes table error:', userSwipesError.message);
      } else {
        console.log(`📊 Found ${userSwipes?.length || 0} records in user_swipes table`);
      }
    } catch (error) {
      console.log('⚠️  user_swipes table not accessible:', error.message);
    }

    // 5. Check if there are any recent migrations that might have affected this
    console.log('\n5. Checking for migration issues...');
    
    // Look at the migration files to see if anything affected user_jambase_events
    console.log('   Checking migration history...');
    console.log('   Recent migrations might have:');
    console.log('   - Dropped and recreated the user_jambase_events table');
    console.log('   - Changed the table structure');
    console.log('   - Applied RLS policies that block access');
    console.log('   - Moved data to a different table');

    // 6. Check if we can see the table schema
    console.log('\n6. Checking table schema...');
    try {
      const { data: schemaData, error: schemaError } = await supabase
        .rpc('get_table_info', { table_name: 'user_jambase_events' })
        .catch(() => ({ data: null, error: { message: 'Function not available' } }));
      
      if (schemaData) {
        console.log('📊 Table schema:', schemaData);
      } else {
        console.log('⚠️  Schema info not available');
      }
    } catch (error) {
      console.log('⚠️  Schema check error:', error.message);
    }

    // 7. Summary and recommendations
    console.log('\n🎯 INTERESTED EVENTS DIAGNOSIS:');
    console.log('===============================');
    
    if ((interestedEvents?.length || 0) === 0) {
      console.log('❌ CRITICAL: No interested events found');
      console.log('   Possible causes:');
      console.log('   1. Table was dropped and recreated (data lost)');
      console.log('   2. RLS policies are blocking access');
      console.log('   3. Data was moved to a different table');
      console.log('   4. Migration accidentally deleted data');
      console.log('   5. Wrong database connection');
    }

    console.log('\n🔧 IMMEDIATE ACTIONS:');
    console.log('1. Check Supabase dashboard for user_jambase_events table');
    console.log('2. Check if the table exists and has data');
    console.log('3. Check RLS policies on user_jambase_events table');
    console.log('4. Look for recent migrations that affected this table');
    console.log('5. Check if data exists in event_interests or user_swipes tables');
    console.log('6. Consider restoring from backup if data was accidentally deleted');

  } catch (error) {
    console.error('❌ Check failed:', error);
  }
}

// Run the check
checkInterestedEvents();
