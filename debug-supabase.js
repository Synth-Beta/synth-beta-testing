#!/usr/bin/env node

// Comprehensive Supabase debugging script
import { createClient } from '@supabase/supabase-js';

// You'll need to set these environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://glpiolbrafqikqhnseto.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "your-anon-key";

async function debugSupabase() {
  console.log('🔍 Supabase Debug Report');
  console.log('========================');
  
  if (SUPABASE_ANON_KEY === "your-anon-key") {
    console.log('❌ SUPABASE_ANON_KEY not set');
    console.log('Please set your environment variables:');
    console.log('export VITE_SUPABASE_URL="your-url"');
    console.log('export VITE_SUPABASE_ANON_KEY="your-key"');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    // Test 1: Check connection
    console.log('1. Testing Supabase connection...');
    console.log('   URL:', SUPABASE_URL);
    console.log('   Key:', SUPABASE_ANON_KEY.substring(0, 20) + '...');

    // Test 2: Check authentication
    console.log('\n2. Testing authentication...');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.log('   ❌ Auth error:', authError.message);
    } else if (user) {
      console.log('   ✅ Authenticated as:', user.email);
      console.log('   User ID:', user.id);
    } else {
      console.log('   ⚠️  Not authenticated');
    }

    // Test 3: Check profiles table access
    console.log('\n3. Testing profiles table access...');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .limit(5);

    if (profilesError) {
      console.log('   ❌ Profiles error:', profilesError.message);
      console.log('   Error code:', profilesError.code);
      console.log('   Error details:', profilesError.details);
      console.log('   Error hint:', profilesError.hint);
    } else {
      console.log('   ✅ Profiles accessible');
      console.log('   Found', profiles?.length || 0, 'profiles');
      if (profiles && profiles.length > 0) {
        console.log('   Sample profile:', {
          id: profiles[0].id,
          name: profiles[0].name,
          hasBio: !!profiles[0].bio,
          hasInstagram: !!profiles[0].instagram_handle,
          hasMusicProfile: 'music_streaming_profile' in profiles[0]
        });
      }
    }

    // Test 4: Check table structure
    console.log('\n4. Checking profiles table structure...');
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', 'profiles')
      .eq('table_schema', 'public');

    if (columnsError) {
      console.log('   ❌ Columns error:', columnsError.message);
    } else {
      console.log('   ✅ Table structure:');
      columns?.forEach(col => {
        console.log(`     - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'required'})`);
      });
    }

    // Test 5: Check RLS policies
    console.log('\n5. Checking RLS policies...');
    const { data: policies, error: policiesError } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'profiles');

    if (policiesError) {
      console.log('   ❌ Policies error:', policiesError.message);
    } else {
      console.log('   ✅ RLS policies:');
      policies?.forEach(policy => {
        console.log(`     - ${policy.policyname}: ${policy.cmd} (${policy.permissive ? 'permissive' : 'restrictive'})`);
      });
    }

    // Test 6: Try to create a test profile (if authenticated)
    if (user) {
      console.log('\n6. Testing profile creation...');
      const testProfile = {
        user_id: user.id,
        name: 'Test User ' + Date.now(),
        bio: 'This is a test profile',
        instagram_handle: 'testuser',
        music_streaming_profile: 'https://open.spotify.com/user/test'
      };

      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert(testProfile)
        .select()
        .single();

      if (createError) {
        console.log('   ❌ Profile creation error:', createError.message);
        console.log('   Error code:', createError.code);
        console.log('   Error details:', createError.details);
      } else {
        console.log('   ✅ Profile created successfully:', newProfile.id);
        
        // Clean up test profile
        await supabase.from('profiles').delete().eq('id', newProfile.id);
        console.log('   🧹 Test profile cleaned up');
      }
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }

  console.log('\n📋 Troubleshooting Tips:');
  console.log('1. Check your Supabase project URL and API key');
  console.log('2. Verify RLS policies allow profile operations');
  console.log('3. Ensure profiles table exists and has correct schema');
  console.log('4. Check if you need to apply database migrations');
  console.log('\n🔧 To apply migrations, run this SQL in Supabase SQL Editor:');
  console.log('ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS music_streaming_profile TEXT;');
  console.log('ALTER TABLE public.profiles DROP COLUMN IF EXISTS snapchat_handle;');
}

debugSupabase();
