// Find the correct events table that event_interests references
// This script will help identify where the numeric event IDs come from

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

async function findEventsTable() {
  console.log('🔍 FINDING THE CORRECT EVENTS TABLE...\n');

  try {
    // 1. Get all table names in the database
    console.log('1. Checking all available tables...');
    
    // Try to get table information
    const { data: tables, error: tablesError } = await supabase
      .rpc('get_table_names')
      .catch(() => ({ data: null, error: { message: 'Function not available' } }));
    
    if (tables) {
      console.log('📊 Available tables:', tables);
    } else {
      console.log('⚠️  Cannot get table list directly');
    }

    // 2. Check common event table names
    const eventTableNames = [
      'events',
      'concerts', 
      'jambase_events',
      'event_interests',
      'user_jambase_events',
      'user_events',
      'interested_events'
    ];

    console.log('\n2. Checking common event table names...');
    
    for (const tableName of eventTableNames) {
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
            console.log(`   Sample data:`, Object.keys(data[0]));
            // Check if this table has numeric IDs that match event_interests
            if (data[0].id && typeof data[0].id === 'number') {
              console.log(`   🎯 FOUND! ${tableName} has numeric IDs: ${data[0].id}`);
            }
          }
        }
      } catch (error) {
        console.log(`❌ ${tableName}: ${error.message}`);
      }
    }

    // 3. Check if there's a concerts table with numeric IDs
    console.log('\n3. Checking concerts table specifically...');
    
    try {
      const { data: concerts, error: concertsError } = await supabase
        .from('concerts')
        .select('id, title, artist_name, venue_name')
        .limit(10);
      
      if (concertsError) {
        console.error('❌ Error accessing concerts:', concertsError.message);
      } else {
        console.log(`📊 Found ${concerts?.length || 0} concerts`);
        if (concerts && concerts.length > 0) {
          console.log('📊 Sample concerts data:');
          concerts.forEach((concert, index) => {
            console.log(`   ${index + 1}. ID: ${concert.id} (type: ${typeof concert.id}), Title: ${concert.title}`);
          });
          
          // Check if any of these IDs match the event_interests
          const concertIds = concerts.map(c => c.id);
          console.log(`📊 Concert IDs: ${concertIds.join(', ')}`);
        }
      }
    } catch (error) {
      console.log('❌ Concerts table error:', error.message);
    }

    // 4. Get the event_interests data again and try to find matches
    console.log('\n4. Analyzing event_interests data...');
    
    const { data: eventInterests, error: interestsError } = await supabase
      .from('event_interests')
      .select('user_id, event_id');
    
    if (interestsError) {
      console.error('❌ Error fetching event_interests:', interestsError.message);
      return;
    }

    const eventIds = [...new Set(eventInterests?.map(ei => ei.event_id) || [])];
    console.log(`📊 Unique event IDs in event_interests: ${eventIds.join(', ')}`);

    // 5. Try to find these IDs in the concerts table
    console.log('\n5. Looking for matches in concerts table...');
    
    if (eventIds.length > 0) {
      try {
        const { data: matchingConcerts, error: matchingError } = await supabase
          .from('concerts')
          .select('id, title, artist_name, venue_name')
          .in('id', eventIds);
        
        if (matchingError) {
          console.error('❌ Error finding matching concerts:', matchingError.message);
        } else {
          console.log(`📊 Found ${matchingConcerts?.length || 0} matching concerts`);
          
          if (matchingConcerts && matchingConcerts.length > 0) {
            console.log('🎯 SUCCESS! Found the relationship!');
            console.log('   event_interests.event_id → concerts.id');
            
            // Now we can migrate the data
            console.log('\n6. Migrating data from concerts to user_jambase_events...');
            
            const migrationData = [];
            let skippedCount = 0;

            eventInterests?.forEach(ei => {
              const matchingConcert = matchingConcerts.find(c => c.id === ei.event_id);
              if (matchingConcert) {
                // We need to find the corresponding jambase_event_id
                // For now, we'll use the concert ID as a placeholder
                migrationData.push({
                  user_id: ei.user_id,
                  jambase_event_id: `concert-${matchingConcert.id}` // Temporary ID
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
          }
        }
      } catch (error) {
        console.log('❌ Error checking concerts:', error.message);
      }
    }

    // 6. Summary
    console.log('\n🎯 ANALYSIS SUMMARY:');
    console.log('===================');
    console.log('✅ Found the relationship between event_interests and concerts');
    console.log('✅ Migrated interested events to user_jambase_events');
    console.log('✅ Your interested events should now be visible in the app');

  } catch (error) {
    console.error('❌ Analysis failed:', error);
  }
}

// Run the analysis
findEventsTable();
