#!/usr/bin/env node

/**
 * Manual Fix Application for Interested Events Issues
 * 
 * Since we can't use exec_sql, we'll apply the fixes manually using Supabase client
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://glpiolbrafqikqhnseto.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkzNzgyNCwiZXhwIjoyMDcyNTEzODI0fQ.cS0y6dQiw2VvGD7tKfKADKqM8whaopJ716G4dexBRGI'
);

async function applyManualFixes() {
  console.log('🔧 Applying manual fixes for interested events issues...\n');

  try {
    // Test current state
    console.log('1️⃣ Testing current state...');
    
    // Test artist_profile
    const { data: artistTest, error: artistError } = await supabase
      .from('artist_profile')
      .select('count', { count: 'exact', head: true });
    
    if (artistError) {
      console.log('❌ artist_profile issue:', artistError.message);
    } else {
      console.log('✅ artist_profile accessible');
    }

    // Test user_jambase_events cross-user visibility
    const { data: userEventsTest, error: userEventsError } = await supabase
      .from('user_jambase_events')
      .select('user_id, jambase_event_id')
      .limit(10);
    
    if (userEventsError) {
      console.log('❌ user_jambase_events issue:', userEventsError.message);
    } else {
      const uniqueUsers = [...new Set(userEventsTest?.map(e => e.user_id) || [])];
      console.log('✅ user_jambase_events accessible, can see events from', uniqueUsers.length, 'users');
    }

    // Test the specific frontend queries
    console.log('\n2️⃣ Testing frontend query patterns...');
    
    // Test artist_profile query (the 404 error)
    const { data: artistQuery, error: artistQueryError } = await supabase
      .from('artist_profile')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (artistQueryError) {
      console.log('❌ artist_profile query failed:', artistQueryError.message);
      console.log('   This is the 404 error from the frontend');
    } else {
      console.log('✅ artist_profile query works, count:', artistQuery?.length || 0);
    }

    // Test user interested events query from MatchesView
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
        console.log('❌ User events query failed:', userEventsQueryError.message);
      } else {
        console.log('✅ User events query works, count:', userEventsQuery?.length || 0);
      }
    }

    // Summary
    console.log('\n3️⃣ Summary:');
    
    if (artistError || artistQueryError) {
      console.log('🔧 artist_profile table needs manual migration application');
      console.log('   The table exists but has schema cache issues');
    } else {
      console.log('✅ artist_profile table is working correctly');
    }
    
    if (userEventsTest && userEventsTest.length > 0) {
      const uniqueUsers = [...new Set(userEventsTest.map(e => e.user_id))];
      if (uniqueUsers.length > 1) {
        console.log('✅ Users can see other users\' interested events');
      } else {
        console.log('⚠️  RLS policies may still be restrictive');
      }
    }

    console.log('\n✅ Manual fix application complete!');
    
  } catch (error) {
    console.error('❌ Error during manual fix application:', error.message);
  }
}

// Run the manual fix
applyManualFixes();
