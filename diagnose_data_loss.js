// Data Loss Diagnostic Script
// This script checks what happened to your reviews and interested events

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

async function diagnoseDataLoss() {
  console.log('🔍 DIAGNOSING DATA LOSS...\n');

  try {
    // 1. Check user_reviews table
    console.log('1. Checking user_reviews table...');
    const { data: allReviews, error: reviewsError, count: reviewsCount } = await supabase
      .from('user_reviews')
      .select('*', { count: 'exact' });
    
    if (reviewsError) {
      console.error('❌ Error accessing user_reviews:', reviewsError.message);
    } else {
      console.log(`📊 Total reviews in database: ${reviewsCount || 0}`);
      if (allReviews && allReviews.length > 0) {
        console.log('📅 Recent reviews:');
        allReviews.slice(0, 5).forEach((review, index) => {
          console.log(`   ${index + 1}. ID: ${review.id}, Rating: ${review.rating}, Created: ${review.created_at}`);
        });
      } else {
        console.log('⚠️  NO REVIEWS FOUND!');
      }
    }

    // 2. Check user_jambase_events table (interested events)
    console.log('\n2. Checking user_jambase_events table (interested events)...');
    const { data: interestedEvents, error: interestedError, count: interestedCount } = await supabase
      .from('user_jambase_events')
      .select('*', { count: 'exact' });
    
    if (interestedError) {
      console.error('❌ Error accessing user_jambase_events:', interestedError.message);
    } else {
      console.log(`📊 Total interested events in database: ${interestedCount || 0}`);
      if (interestedEvents && interestedEvents.length > 0) {
        console.log('📅 Recent interested events:');
        interestedEvents.slice(0, 5).forEach((event, index) => {
          console.log(`   ${index + 1}. User: ${event.user_id}, Event: ${event.jambase_event_id}, Created: ${event.created_at}`);
        });
      } else {
        console.log('⚠️  NO INTERESTED EVENTS FOUND!');
      }
    }

    // 3. Check jambase_events table
    console.log('\n3. Checking jambase_events table...');
    const { data: jambaseEvents, error: jambaseError, count: jambaseCount } = await supabase
      .from('jambase_events')
      .select('*', { count: 'exact' });
    
    if (jambaseError) {
      console.error('❌ Error accessing jambase_events:', jambaseError.message);
    } else {
      console.log(`📊 Total jambase events in database: ${jambaseCount || 0}`);
    }

    // 4. Check profiles table
    console.log('\n4. Checking profiles table...');
    const { data: profiles, error: profilesError, count: profilesCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact' });
    
    if (profilesError) {
      console.error('❌ Error accessing profiles:', profilesError.message);
    } else {
      console.log(`📊 Total profiles in database: ${profilesCount || 0}`);
    }

    // 5. Check if there are any RLS (Row Level Security) issues
    console.log('\n5. Checking for RLS issues...');
    
    // Try to get reviews with different user contexts
    const { data: publicReviews, error: publicError } = await supabase
      .from('user_reviews')
      .select('*')
      .eq('is_public', true);
    
    if (publicError) {
      console.error('❌ Error accessing public reviews:', publicError.message);
    } else {
      console.log(`📊 Public reviews accessible: ${publicReviews?.length || 0}`);
    }

    // 6. Check recent migration history
    console.log('\n6. Checking for recent changes...');
    
    // Check if the new columns were added recently
    const { data: recentReviews, error: recentError } = await supabase
      .from('user_reviews')
      .select('id, created_at, updated_at, artist_id, venue_id')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (recentError) {
      console.error('❌ Error accessing recent reviews:', recentError.message);
    } else if (recentReviews && recentReviews.length > 0) {
      console.log('📅 Most recent reviews:');
      recentReviews.forEach((review, index) => {
        console.log(`   ${index + 1}. ID: ${review.id}, Created: ${review.created_at}, Updated: ${review.updated_at}`);
        console.log(`      Artist ID: ${review.artist_id || 'NULL'}, Venue ID: ${review.venue_id || 'NULL'}`);
      });
    }

    // 7. Check for data in different schemas or tables
    console.log('\n7. Checking for data in other tables...');
    
    // Check if there's data in a different table structure
    const { data: alternativeReviews, error: altError } = await supabase
      .from('reviews')
      .select('*', { count: 'exact' })
      .catch(() => ({ data: null, error: { message: 'Table does not exist' } }));
    
    if (alternativeReviews) {
      console.log(`📊 Found ${alternativeReviews.length} reviews in 'reviews' table`);
    }

    // 8. Check database size and health
    console.log('\n8. Checking database health...');
    
    const { data: dbStats, error: dbError } = await supabase
      .rpc('get_database_stats')
      .catch(() => ({ data: null, error: { message: 'Function not available' } }));
    
    if (dbStats) {
      console.log('📊 Database stats:', dbStats);
    } else {
      console.log('⚠️  Database stats function not available');
    }

    // 9. Summary and recommendations
    console.log('\n🎯 DIAGNOSIS SUMMARY:');
    console.log('====================');
    
    if ((reviewsCount || 0) === 0) {
      console.log('❌ CRITICAL: No reviews found in user_reviews table');
      console.log('   Possible causes:');
      console.log('   - Data was accidentally deleted');
      console.log('   - RLS policies are blocking access');
      console.log('   - Wrong database connection');
      console.log('   - Data was moved to different table');
    } else {
      console.log(`✅ Found ${reviewsCount} reviews in database`);
    }
    
    if ((interestedCount || 0) === 0) {
      console.log('❌ CRITICAL: No interested events found in user_jambase_events table');
    } else {
      console.log(`✅ Found ${interestedCount} interested events in database`);
    }

    console.log('\n🔧 IMMEDIATE ACTIONS:');
    console.log('1. Check your Supabase dashboard for recent activity');
    console.log('2. Check if you\'re connected to the right database');
    console.log('3. Check RLS policies in Supabase');
    console.log('4. Look for any recent migrations that might have affected data');
    console.log('5. Check if data exists in a different schema or table');

  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
  }
}

// Run the diagnostic
diagnoseDataLoss();
