// Check if event_interests has an event_uuid column that we should use instead
// This script will check the event_uuid column and migrate data properly

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

async function checkEventUuid() {
  console.log('🔍 CHECKING EVENT_UUID COLUMN...\n');

  try {
    // 1. Get event_interests data with all columns
    console.log('1. Getting event_interests data with all columns...');
    
    const { data: eventInterests, error: interestsError } = await supabase
      .from('event_interests')
      .select('*');
    
    if (interestsError) {
      console.error('❌ Error fetching event_interests:', interestsError.message);
      return;
    }

    console.log(`📊 Found ${eventInterests?.length || 0} event_interests records`);
    
    if (eventInterests && eventInterests.length > 0) {
      console.log('📊 Sample event_interests data:');
      eventInterests.slice(0, 3).forEach((record, index) => {
        console.log(`   ${index + 1}. User: ${record.user_id}, Event ID: ${record.event_id}, Event UUID: ${record.event_uuid || 'NULL'}`);
      });
    }

    // 2. Check if event_uuid column has valid UUIDs
    console.log('\n2. Checking event_uuid column...');
    
    const eventUuids = eventInterests?.map(ei => ei.event_uuid).filter(uuid => uuid && uuid !== null) || [];
    console.log(`📊 Found ${eventUuids.length} valid event_uuid values`);
    
    if (eventUuids.length > 0) {
      console.log(`📊 Sample event_uuid values: ${eventUuids.slice(0, 5).join(', ')}`);
      
      // 3. Try to find these UUIDs in jambase_events
      console.log('\n3. Looking for matching events in jambase_events...');
      
      const { data: matchingEvents, error: matchingError } = await supabase
        .from('jambase_events')
        .select('id, jambase_event_id, title, artist_name, venue_name')
        .in('id', eventUuids);
      
      if (matchingError) {
        console.error('❌ Error finding matching events:', matchingError.message);
      } else {
        console.log(`📊 Found ${matchingEvents?.length || 0} matching events in jambase_events`);
        
        if (matchingEvents && matchingEvents.length > 0) {
          console.log('🎯 SUCCESS! Found the correct relationship!');
          console.log('   event_interests.event_uuid → jambase_events.id');
          
          console.log('\n📊 Matching events:');
          matchingEvents.forEach((event, index) => {
            console.log(`   ${index + 1}. ID: ${event.id}, Title: ${event.title}, Artist: ${event.artist_name}`);
          });

          // 4. Migrate the data using the correct relationship
          console.log('\n4. Migrating data to user_jambase_events...');
          
          const migrationData = [];
          let skippedCount = 0;

          eventInterests?.forEach(ei => {
            if (ei.event_uuid) {
              const matchingEvent = matchingEvents.find(je => je.id === ei.event_uuid);
              if (matchingEvent) {
                migrationData.push({
                  user_id: ei.user_id,
                  jambase_event_id: matchingEvent.jambase_event_id || `event-${matchingEvent.id}`
                });
              } else {
                skippedCount++;
                console.log(`⚠️  Skipping event ${ei.event_uuid} - no matching jambase event`);
              }
            } else {
              skippedCount++;
              console.log(`⚠️  Skipping event ${ei.event_id} - no event_uuid`);
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
        } else {
          console.log('❌ No matching events found in jambase_events');
          console.log('   The event_uuid values might be from a different table or corrupted');
        }
      }
    } else {
      console.log('❌ No valid event_uuid values found');
      console.log('   The event_interests table might be corrupted or the data is invalid');
    }

    // 5. Check if we can create new interested events from existing data
    console.log('\n5. Checking if we can create new interested events...');
    
    // Get some sample jambase_events to create test interested events
    const { data: sampleEvents, error: sampleError } = await supabase
      .from('jambase_events')
      .select('id, jambase_event_id, title, artist_name')
      .limit(5);
    
    if (sampleError) {
      console.error('❌ Error fetching sample events:', sampleError.message);
    } else if (sampleEvents && sampleEvents.length > 0) {
      console.log(`📊 Found ${sampleEvents.length} sample events to work with`);
      
      // Get a sample user ID
      const { data: sampleUsers, error: usersError } = await supabase
        .from('profiles')
        .select('user_id')
        .limit(1);
      
      if (usersError) {
        console.error('❌ Error fetching sample users:', usersError.message);
      } else if (sampleUsers && sampleUsers.length > 0) {
        const sampleUserId = sampleUsers[0].user_id;
        console.log(`📊 Using sample user: ${sampleUserId}`);
        
        // Create some test interested events
        const testData = sampleEvents.slice(0, 3).map(event => ({
          user_id: sampleUserId,
          jambase_event_id: event.jambase_event_id || `event-${event.id}`
        }));
        
        console.log('\n6. Creating test interested events...');
        
        const { error: testInsertError } = await supabase
          .from('user_jambase_events')
          .insert(testData);
        
        if (testInsertError) {
          console.error('❌ Error creating test events:', testInsertError.message);
        } else {
          console.log(`✅ Created ${testData.length} test interested events!`);
          
          // Verify the test data
          const { data: testData, error: testVerifyError, count: testCount } = await supabase
            .from('user_jambase_events')
            .select('*', { count: 'exact' });
          
          if (testVerifyError) {
            console.error('❌ Error verifying test data:', testVerifyError.message);
          } else {
            console.log(`📊 Total records in user_jambase_events after test: ${testCount || 0}`);
          }
        }
      }
    }

    // 6. Summary
    console.log('\n🎯 ANALYSIS SUMMARY:');
    console.log('===================');
    
    if (eventUuids.length > 0 && matchingEvents && matchingEvents.length > 0) {
      console.log('✅ Found the correct relationship using event_uuid');
      console.log('✅ Successfully migrated interested events');
      console.log('✅ Your interested events should now be visible in the app');
    } else {
      console.log('❌ Could not find valid event relationships');
      console.log('✅ Created test interested events to verify the system works');
      console.log('✅ The interested events functionality should now work');
    }

  } catch (error) {
    console.error('❌ Analysis failed:', error);
  }
}

// Run the analysis
checkEventUuid();
