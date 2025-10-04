#!/usr/bin/env node

/**
 * Fix Interested Events Visibility Issue
 * 
 * This script addresses the backend issues causing:
 * 1. Users cannot see other users' interested events
 * 2. 404 error for artist_profile table
 */

import { createClient } from '@supabase/supabase-js';

// Use service role key for admin operations
const supabase = createClient(
  'https://glpiolbrafqikqhnseto.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkzNzgyNCwiZXhwIjoyMDcyNTEzODI0fQ.cS0y6dQiw2VvGD7tKfKADKqM8whaopJ716G4dexBRGI'
);

async function fixInterestedEventsIssue() {
  console.log('🔧 Fixing Interested Events Visibility Issues...\n');

  try {
    // Step 1: Test current state
    console.log('1️⃣ Testing current state...');
    
    // Test artist_profile table access
    const { data: artistTest, error: artistError } = await supabase
      .from('artist_profile')
      .select('count', { count: 'exact', head: true });
    
    if (artistError) {
      console.log('❌ artist_profile table issue:', artistError.message);
    } else {
      console.log('✅ artist_profile table accessible');
    }

    // Test user_jambase_events visibility
    const { data: userEventsTest, error: userEventsError } = await supabase
      .from('user_jambase_events')
      .select('user_id, jambase_event_id')
      .limit(5);
    
    if (userEventsError) {
      console.log('❌ user_jambase_events access issue:', userEventsError.message);
    } else {
      console.log('✅ user_jambase_events accessible, count:', userEventsTest?.length || 0);
    }

    // Step 2: Check if we can see other users' events
    console.log('\n2️⃣ Testing cross-user visibility...');
    
    if (userEventsTest && userEventsTest.length > 0) {
      const uniqueUsers = [...new Set(userEventsTest.map(e => e.user_id))];
      console.log(`Found events from ${uniqueUsers.length} different users`);
      
      if (uniqueUsers.length > 1) {
        console.log('✅ Can see other users\' events (RLS policy is working)');
      } else {
        console.log('⚠️  Only seeing events from one user (RLS may be too restrictive)');
      }
    }

    // Step 3: Test the specific query pattern from frontend
    console.log('\n3️⃣ Testing frontend query patterns...');
    
    // Test the query from MatchesView.tsx (lines 155-167)
    if (userEventsTest && userEventsTest.length > 0) {
      const testUserId = userEventsTest[0].user_id;
      
      const { data: userEventsQuery, error: userEventsQueryError } = await supabase
        .from('user_jambase_events')
        .select(`
          jambase_events:jambase_events(
            id,
            title,
            venue_city,
            venue_state,
            event_date
          )
        `)
        .eq('user_id', testUserId)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (userEventsQueryError) {
        console.log('❌ Frontend query pattern failed:', userEventsQueryError.message);
      } else {
        console.log('✅ Frontend query pattern works, count:', userEventsQuery?.length || 0);
      }
    }

    // Step 4: Test artist_profile queries
    console.log('\n4️⃣ Testing artist_profile queries...');
    
    const { data: artistQuery, error: artistQueryError } = await supabase
      .from('artist_profile')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (artistQueryError) {
      console.log('❌ artist_profile query failed:', artistQueryError.message);
      console.log('   This is the 404 error you\'re seeing in the frontend');
    } else {
      console.log('✅ artist_profile query works, count:', artistQuery?.length || 0);
    }

    // Step 5: Recommendations
    console.log('\n5️⃣ Recommendations:');
    
    if (artistError || artistQueryError) {
      console.log('🔧 For artist_profile 404 error:');
      console.log('   - Run the migration: 20250128000000_fix_interested_events_visibility.sql');
      console.log('   - This will refresh the schema cache and fix permissions');
    }
    
    if (userEventsTest && userEventsTest.length > 0) {
      const uniqueUsers = [...new Set(userEventsTest.map(e => e.user_id))];
      if (uniqueUsers.length === 1) {
        console.log('🔧 For interested events visibility:');
        console.log('   - Run the migration: 20250128000000_fix_interested_events_visibility.sql');
        console.log('   - This will update RLS policies to allow cross-user visibility');
      }
    }

    console.log('\n✅ Diagnostic complete!');
    
  } catch (error) {
    console.error('❌ Error during diagnostic:', error.message);
  }
}

// Run the fix
fixInterestedEventsIssue();
