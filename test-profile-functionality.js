#!/usr/bin/env node

// Test script to verify profile functionality
import { createClient } from '@supabase/supabase-js';

// You'll need to set these environment variables or replace with your actual values
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://glpiolbrafqikqhnseto.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "your-anon-key";

async function testProfileFunctionality() {
  console.log('🧪 Testing Profile Functionality');
  console.log('================================');
  
  if (SUPABASE_ANON_KEY === "your-anon-key") {
    console.log('❌ Please set VITE_SUPABASE_ANON_KEY environment variable');
    console.log('You can find this in your Supabase dashboard under Settings > API');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    // Test 1: Check if we can connect to Supabase
    console.log('1. Testing Supabase connection...');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.log('   ⚠️  Not authenticated:', authError.message);
      console.log('   This is expected if you\'re not logged in');
    } else if (user) {
      console.log('   ✅ Connected and authenticated as:', user.email);
      
      // Test 2: Check profiles table structure
      console.log('2. Testing profiles table access...');
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (profileError) {
        console.log('   ❌ Profile query error:', profileError.message);
        
        // Test if it's a column that doesn't exist
        if (profileError.message.includes('music_streaming_profile')) {
          console.log('   💡 The music_streaming_profile column doesn\'t exist yet');
          console.log('   Run this SQL in your Supabase SQL editor:');
          console.log('   ALTER TABLE public.profiles ADD COLUMN music_streaming_profile TEXT;');
        }
      } else {
        console.log('   ✅ Profile found:', {
          name: profile.name,
          hasInstagram: !!profile.instagram_handle,
          hasMusicProfile: 'music_streaming_profile' in profile,
          hasSnapchat: 'snapchat_handle' in profile
        });
      }
      
      // Test 3: Try to update profile (if we have one)
      if (profile) {
        console.log('3. Testing profile update...');
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
        
        if (updateError) {
          console.log('   ❌ Profile update error:', updateError.message);
        } else {
          console.log('   ✅ Profile update successful');
        }
      }
      
    } else {
      console.log('   ⚠️  Not authenticated - please log in to test profile functionality');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
  
  console.log('');
  console.log('📋 Manual Steps to Fix Database:');
  console.log('1. Go to your Supabase dashboard');
  console.log('2. Navigate to SQL Editor');
  console.log('3. Run these commands:');
  console.log('');
  console.log('   -- Add music streaming profile field');
  console.log('   ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS music_streaming_profile TEXT;');
  console.log('');
  console.log('   -- Remove snapchat handle field');
  console.log('   ALTER TABLE public.profiles DROP COLUMN IF EXISTS snapchat_handle;');
  console.log('');
  console.log('   -- Add comments');
  console.log("   COMMENT ON COLUMN public.profiles.music_streaming_profile IS 'URL or handle for music streaming platform (Spotify, Apple Music, etc.)';");
}

testProfileFunctionality();
