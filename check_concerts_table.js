// Check concerts table for the missing event data
// This script will find where the numeric event IDs come from

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

async function checkConcertsTable() {
  console.log('🔍 CHECKING CONCERTS TABLE...\n');

  try {
    // 1. Check concerts table
    console.log('1. Checking concerts table...');
    
    const { data: concerts, error: concertsError, count: concertsCount } = await supabase
      .from('concerts')
      .select('*', { count: 'exact' });
    
    if (concertsError) {
      console.error('❌ Error accessing concerts:', concertsError.message);
      return;
    }

    console.log(`📊 Found ${concertsCount || 0} concerts`);
    
    if (concerts && concerts.length > 0) {
      console.log('📊 Sample concerts data:');
      concerts.slice(0, 5).forEach((concert, index) => {
        console.log(`   ${index + 1}. ID: ${concert.id} (type: ${typeof concert.id}), Title: ${concert.title}`);
      });
    }

    // 2. Get event_interests data
    console.log('\n2. Getting event_interests data...');
    
    const { data: eventInterests, error: interestsError } = await supabase
      .from('event_interests')
      .select('user_id, event_id');
    
    if (interestsError) {
      console.error('❌ Error fetching event_interests:', interestsError.message);
      return;
    }

    const eventIds = [...new Set(eventInterests?.map(ei => ei.event_id) || [])];
    console.log(`📊 Unique event IDs in event_interests: ${eventIds.join(', ')}`);

    // 3. Try to find matches
    console.log('\n3. Looking for matches between event_interests and concerts...');
    
    if (eventIds.length > 0 && concerts && concerts.length > 0) {
      const matchingConcerts = concerts.filter(concert => eventIds.includes(concert.id));
      console.log(`📊 Found ${matchingConcerts.length} matching concerts`);
      
      if (matchingConcerts.length > 0) {
        console.log('🎯 SUCCESS! Found the relationship!');
        console.log('   event_interests.event_id → concerts.id');
        
        console.log('\n📊 Matching concerts:');
        matchingConcerts.forEach((concert, index) => {
          console.log(`   ${index + 1}. ID: ${concert.id}, Title: ${concert.title}, Artist: ${concert.artist_name}`);
        });

        // 4. Migrate the data
        console.log('\n4. Migrating data to user_jambase_events...');
        
        const migrationData = [];
        let skippedCount = 0;

        eventInterests?.forEach(ei => {
          const matchingConcert = matchingConcerts.find(c => c.id === ei.event_id);
          if (matchingConcert) {
            // Create a unique identifier for the concert
            migrationData.push({
              user_id: ei.user_id,
              jambase_event_id: `concert-${matchingConcert.id}-${matchingConcert.title?.replace(/\s+/g, '-') || 'event'}`
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
      } else {
        console.log('❌ No matching concerts found');
        console.log('   This suggests the event_interests table might be referencing a different table');
      }
    }

    // 5. Check if there are other event-related tables
    console.log('\n5. Checking other potential event tables...');
    
    const otherTables = ['events', 'user_events', 'interested_events'];
    
    for (const tableName of otherTables) {
      try {
        const { data, error, count } = await supabase
          .from(tableName)
          .select('*', { count: 'exact' })
          .limit(3);
        
        if (error) {
          console.log(`❌ ${tableName}: ${error.message}`);
        } else {
          console.log(`✅ ${tableName}: ${count || 0} records`);
          if (data && data.length > 0) {
            console.log(`   Sample data keys: ${Object.keys(data[0]).join(', ')}`);
            if (data[0].id && typeof data[0].id === 'number') {
              console.log(`   🎯 ${tableName} has numeric IDs: ${data[0].id}`);
            }
          }
        }
      } catch (error) {
        console.log(`❌ ${tableName}: ${error.message}`);
      }
    }

    // 6. Summary
    console.log('\n🎯 ANALYSIS SUMMARY:');
    console.log('===================');
    
    if (matchingConcerts && matchingConcerts.length > 0) {
      console.log('✅ Found the relationship between event_interests and concerts');
      console.log('✅ Successfully migrated interested events');
      console.log('✅ Your interested events should now be visible in the app');
    } else {
      console.log('❌ Could not find the relationship between event_interests and any event table');
      console.log('   The event_interests table might be referencing a table that no longer exists');
      console.log('   or the data might be corrupted');
    }

  } catch (error) {
    console.error('❌ Analysis failed:', error);
  }
}

// Run the analysis
checkConcertsTable();
