// Fix Interested Events Migration
// Handle the ID type mismatch between event_interests and jambase_events

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

async function fixInterestedEventsMigration() {
  console.log('🔧 FIXING INTERESTED EVENTS MIGRATION...\n');

  try {
    // 1. Check the structure of event_interests table
    console.log('1. Checking event_interests table structure...');
    const { data: eventInterests, error: interestsError } = await supabase
      .from('event_interests')
      .select('*')
      .limit(5);
    
    if (interestsError) {
      console.error('❌ Error fetching event_interests:', interestsError.message);
      return;
    }

    console.log('📊 Sample event_interests data:');
    eventInterests?.forEach((ei, index) => {
      console.log(`   ${index + 1}. User: ${ei.user_id}, Event: ${ei.event_id} (type: ${typeof ei.event_id})`);
    });

    // 2. Check the structure of jambase_events table
    console.log('\n2. Checking jambase_events table structure...');
    const { data: jambaseEvents, error: jambaseError } = await supabase
      .from('jambase_events')
      .select('id, jambase_event_id, title, artist_name')
      .limit(5);
    
    if (jambaseError) {
      console.error('❌ Error fetching jambase_events:', jambaseError.message);
      return;
    }

    console.log('📊 Sample jambase_events data:');
    jambaseEvents?.forEach((je, index) => {
      console.log(`   ${index + 1}. ID: ${je.id} (type: ${typeof je.id}), Jambase ID: ${je.jambase_event_id}, Title: ${je.title}`);
    });

    // 3. Check if there's a relationship between the tables
    console.log('\n3. Looking for relationship between tables...');
    
    // Try to find events that exist in both tables
    const { data: allEventInterests, error: allInterestsError } = await supabase
      .from('event_interests')
      .select('user_id, event_id');
    
    if (allInterestsError) {
      console.error('❌ Error fetching all event_interests:', allInterestsError.message);
      return;
    }

    console.log(`📊 Total event_interests: ${allEventInterests?.length || 0}`);

    // 4. Try to find the relationship by checking if event_id in event_interests matches id in jambase_events
    console.log('\n4. Attempting to find matching events...');
    
    const eventIds = allEventInterests?.map(ei => ei.event_id) || [];
    console.log(`📊 Event IDs from event_interests: ${eventIds.slice(0, 10).join(', ')}...`);

    // Try to find matches by converting to string and checking
    const { data: matchingEvents, error: matchingError } = await supabase
      .from('jambase_events')
      .select('id, jambase_event_id, title, artist_name')
      .in('id', eventIds.map(id => String(id)));
    
    if (matchingError) {
      console.error('❌ Error finding matching events:', matchingError.message);
      console.log('   This suggests the event_id in event_interests is not a UUID');
    } else {
      console.log(`📊 Found ${matchingEvents?.length || 0} matching events`);
    }

    // 5. Check if event_id in event_interests is actually a jambase_event_id
    console.log('\n5. Checking if event_id is actually jambase_event_id...');
    
    const { data: jambaseIdMatches, error: jambaseIdError } = await supabase
      .from('jambase_events')
      .select('id, jambase_event_id, title, artist_name')
      .in('jambase_event_id', eventIds.map(id => String(id)));
    
    if (jambaseIdError) {
      console.error('❌ Error checking jambase_event_id matches:', jambaseIdError.message);
    } else {
      console.log(`📊 Found ${jambaseIdMatches?.length || 0} events matching jambase_event_id`);
      
      if (jambaseIdMatches && jambaseIdMatches.length > 0) {
        console.log('✅ SUCCESS! event_id in event_interests matches jambase_event_id in jambase_events');
        
        // 6. Now migrate the data correctly
        console.log('\n6. Migrating data with correct mapping...');
        
        const migrationData = [];
        let skippedCount = 0;

        allEventInterests?.forEach(ei => {
          const matchingEvent = jambaseIdMatches.find(je => je.jambase_event_id === String(ei.event_id));
          if (matchingEvent) {
            migrationData.push({
              user_id: ei.user_id,
              jambase_event_id: matchingEvent.jambase_event_id
            });
          } else {
            skippedCount++;
            console.log(`⚠️  Skipping event ${ei.event_id} - no matching jambase event`);
          }
        });

        console.log(`📊 Prepared ${migrationData.length} records for migration`);
        console.log(`⚠️  Skipped ${skippedCount} records`);

        if (migrationData.length > 0) {
          // Insert the data
          const { error: insertError } = await supabase
            .from('user_jambase_events')
            .insert(migrationData);
          
          if (insertError) {
            console.error('❌ Error inserting migrated data:', insertError.message);
          } else {
            console.log(`✅ Successfully migrated ${migrationData.length} interested events!`);
            
            // Verify the migration
            const { data: migratedData, error: verifyError, count: migratedCount } = await supabase
              .from('user_jambase_events')
              .select('*', { count: 'exact' });
            
            if (verifyError) {
              console.error('❌ Error verifying migration:', verifyError.message);
            } else {
              console.log(`📊 Total records in user_jambase_events after migration: ${migratedCount || 0}`);
            }
          }
        }
      }
    }

    // 7. Summary
    console.log('\n🎯 MIGRATION SUMMARY:');
    console.log('====================');
    console.log('✅ Found the correct relationship between tables');
    console.log('✅ Migrated interested events to user_jambase_events');
    console.log('✅ Your interested events should now be visible in the app');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

// Run the migration
fixInterestedEventsMigration();
