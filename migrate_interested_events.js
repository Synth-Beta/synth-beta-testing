// Migrate Interested Events from event_interests to user_jambase_events
// This script will restore your interested events

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

async function migrateInterestedEvents() {
  console.log('🔄 MIGRATING INTERESTED EVENTS...\n');

  try {
    // 1. Get all interested events from event_interests table
    console.log('1. Fetching interested events from event_interests table...');
    const { data: eventInterests, error: interestsError } = await supabase
      .from('event_interests')
      .select('user_id, event_id');
    
    if (interestsError) {
      console.error('❌ Error fetching event_interests:', interestsError.message);
      return;
    }

    console.log(`📊 Found ${eventInterests?.length || 0} interested events in event_interests table`);

    if (!eventInterests || eventInterests.length === 0) {
      console.log('⚠️  No interested events found to migrate');
      return;
    }

    // 2. Get the corresponding jambase_event_ids
    console.log('\n2. Mapping event_ids to jambase_event_ids...');
    
    const eventIds = eventInterests.map(ei => ei.event_id);
    const { data: jambaseEvents, error: jambaseError } = await supabase
      .from('jambase_events')
      .select('id, jambase_event_id')
      .in('id', eventIds);
    
    if (jambaseError) {
      console.error('❌ Error fetching jambase_events:', jambaseError.message);
      return;
    }

    console.log(`📊 Found ${jambaseEvents?.length || 0} corresponding jambase events`);

    // 3. Create mapping from event_id to jambase_event_id
    const eventIdToJambaseId = {};
    jambaseEvents?.forEach(je => {
      eventIdToJambaseId[je.id] = je.jambase_event_id;
    });

    // 4. Prepare data for migration
    console.log('\n3. Preparing migration data...');
    
    const migrationData = [];
    let skippedCount = 0;

    eventInterests.forEach(ei => {
      const jambaseEventId = eventIdToJambaseId[ei.event_id];
      if (jambaseEventId) {
        migrationData.push({
          user_id: ei.user_id,
          jambase_event_id: jambaseEventId
        });
      } else {
        skippedCount++;
        console.log(`⚠️  Skipping event ${ei.event_id} - no corresponding jambase_event_id`);
      }
    });

    console.log(`📊 Prepared ${migrationData.length} records for migration`);
    console.log(`⚠️  Skipped ${skippedCount} records (no jambase_event_id)`);

    if (migrationData.length === 0) {
      console.log('❌ No valid data to migrate');
      return;
    }

    // 5. Check if user_jambase_events table is accessible
    console.log('\n4. Checking user_jambase_events table access...');
    
    try {
      const { error: testError } = await supabase
        .from('user_jambase_events')
        .select('user_id, jambase_event_id')
        .limit(1);
      
      if (testError) {
        console.error('❌ Cannot access user_jambase_events table:', testError.message);
        console.log('   This might be due to RLS policies or table structure issues');
        return;
      }
      
      console.log('✅ user_jambase_events table is accessible');
    } catch (error) {
      console.error('❌ Table access error:', error.message);
      return;
    }

    // 6. Migrate the data
    console.log('\n5. Migrating data to user_jambase_events...');
    
    // Insert in batches to avoid overwhelming the database
    const batchSize = 10;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < migrationData.length; i += batchSize) {
      const batch = migrationData.slice(i, i + batchSize);
      
      try {
        const { error: insertError } = await supabase
          .from('user_jambase_events')
          .insert(batch);
        
        if (insertError) {
          console.error(`❌ Error inserting batch ${Math.floor(i/batchSize) + 1}:`, insertError.message);
          errorCount += batch.length;
        } else {
          console.log(`✅ Inserted batch ${Math.floor(i/batchSize) + 1} (${batch.length} records)`);
          successCount += batch.length;
        }
      } catch (error) {
        console.error(`❌ Batch ${Math.floor(i/batchSize) + 1} failed:`, error.message);
        errorCount += batch.length;
      }
    }

    // 7. Verify the migration
    console.log('\n6. Verifying migration...');
    
    const { data: migratedData, error: verifyError, count: migratedCount } = await supabase
      .from('user_jambase_events')
      .select('*', { count: 'exact' });
    
    if (verifyError) {
      console.error('❌ Error verifying migration:', verifyError.message);
    } else {
      console.log(`📊 Total records in user_jambase_events after migration: ${migratedCount || 0}`);
    }

    // 8. Summary
    console.log('\n🎯 MIGRATION SUMMARY:');
    console.log('====================');
    console.log(`✅ Successfully migrated: ${successCount} records`);
    console.log(`❌ Failed to migrate: ${errorCount} records`);
    console.log(`📊 Total in event_interests: ${eventInterests.length}`);
    console.log(`📊 Total in user_jambase_events: ${migratedCount || 0}`);

    if (successCount > 0) {
      console.log('\n🎉 Migration completed successfully!');
      console.log('   Your interested events should now be visible in the app.');
    } else {
      console.log('\n❌ Migration failed. Please check the errors above.');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

// Run the migration
migrateInterestedEvents();
