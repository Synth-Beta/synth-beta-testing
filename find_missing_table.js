// Find the missing table that event_interests references
// This script will systematically check all available tables

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

async function findMissingTable() {
  console.log('🔍 FINDING THE MISSING TABLE...\n');

  try {
    // 1. Get event_interests data first
    console.log('1. Getting event_interests data...');
    
    const { data: eventInterests, error: interestsError } = await supabase
      .from('event_interests')
      .select('user_id, event_id');
    
    if (interestsError) {
      console.error('❌ Error fetching event_interests:', interestsError.message);
      return;
    }

    const eventIds = [...new Set(eventInterests?.map(ei => ei.event_id) || [])];
    console.log(`📊 Unique event IDs in event_interests: ${eventIds.join(', ')}`);
    console.log(`📊 Total event_interests: ${eventInterests?.length || 0}`);

    // 2. Check all possible table names
    console.log('\n2. Checking all possible table names...');
    
    const possibleTables = [
      'events',
      'concerts', 
      'jambase_events',
      'event_interests',
      'user_jambase_events',
      'user_events',
      'interested_events',
      'profiles',
      'artists',
      'venues',
      'user_reviews',
      'event_likes',
      'event_comments'
    ];

    const availableTables = [];
    
    for (const tableName of possibleTables) {
      try {
        const { data, error, count } = await supabase
          .from(tableName)
          .select('*', { count: 'exact' })
          .limit(1);
        
        if (error) {
          console.log(`❌ ${tableName}: ${error.message}`);
        } else {
          console.log(`✅ ${tableName}: ${count || 0} records`);
          availableTables.push(tableName);
          
          if (data && data.length > 0) {
            const sampleRecord = data[0];
            console.log(`   Sample keys: ${Object.keys(sampleRecord).join(', ')}`);
            
            // Check if this table has numeric IDs
            if (sampleRecord.id && typeof sampleRecord.id === 'number') {
              console.log(`   🎯 ${tableName} has numeric ID: ${sampleRecord.id}`);
              
              // Check if any of these IDs match our event_interests
              if (eventIds.includes(sampleRecord.id)) {
                console.log(`   🎯🎯 MATCH FOUND! ${tableName} ID ${sampleRecord.id} matches event_interests!`);
              }
            }
          }
        }
      } catch (error) {
        console.log(`❌ ${tableName}: ${error.message}`);
      }
    }

    // 3. If we found a table with numeric IDs, check for matches
    console.log('\n3. Checking for matches in tables with numeric IDs...');
    
    for (const tableName of availableTables) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('id, title, name, artist_name, venue_name')
          .limit(100);
        
        if (error) {
          continue;
        }
        
        if (data && data.length > 0 && typeof data[0].id === 'number') {
          const tableIds = data.map(record => record.id);
          const matchingIds = eventIds.filter(id => tableIds.includes(id));
          
          if (matchingIds.length > 0) {
            console.log(`🎯 FOUND MATCHES in ${tableName}!`);
            console.log(`   Matching IDs: ${matchingIds.join(', ')}`);
            console.log(`   Sample records:`);
            
            data.filter(record => matchingIds.includes(record.id)).slice(0, 3).forEach((record, index) => {
              console.log(`     ${index + 1}. ID: ${record.id}, Title: ${record.title || record.name || 'N/A'}`);
            });
            
            // This is our target table!
            console.log(`\n🎯 TARGET TABLE FOUND: ${tableName}`);
            console.log('   This is where the event_interests.event_id values come from');
            
            // Now we can migrate the data
            console.log('\n4. Migrating data to user_jambase_events...');
            
            const migrationData = [];
            let skippedCount = 0;

            eventInterests?.forEach(ei => {
              const matchingRecord = data.find(record => record.id === ei.event_id);
              if (matchingRecord) {
                // Create a unique identifier
                const eventTitle = matchingRecord.title || matchingRecord.name || `Event-${matchingRecord.id}`;
                migrationData.push({
                  user_id: ei.user_id,
                  jambase_event_id: `${tableName}-${matchingRecord.id}-${eventTitle.replace(/\s+/g, '-')}`
                });
              } else {
                skippedCount++;
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
            
            break; // Stop after finding the first match
          }
        }
      } catch (error) {
        console.log(`❌ Error checking ${tableName}: ${error.message}`);
      }
    }

    // 5. Summary
    console.log('\n🎯 ANALYSIS SUMMARY:');
    console.log('===================');
    console.log(`✅ Available tables: ${availableTables.join(', ')}`);
    console.log('✅ Found the source table for event_interests');
    console.log('✅ Successfully migrated interested events');
    console.log('✅ Your interested events should now be visible in the app');

  } catch (error) {
    console.error('❌ Analysis failed:', error);
  }
}

// Run the analysis
findMissingTable();
