#!/usr/bin/env node

// Simple script to fix the database schema for profiles table
// This can be run manually to apply the necessary changes

import { createClient } from '@supabase/supabase-js';

// You'll need to replace these with your actual Supabase credentials
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://glpiolbrafqikqhnseto.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // You'll need this

async function fixDatabaseSchema() {
  if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
    console.log('You can find this in your Supabase dashboard under Settings > API');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    console.log('🔧 Fixing database schema...');

    // Add music_streaming_profile field
    console.log('Adding music_streaming_profile field...');
    const { error: addMusicError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS music_streaming_profile TEXT;'
    });

    if (addMusicError) {
      console.log('Note: music_streaming_profile might already exist:', addMusicError.message);
    } else {
      console.log('✅ Added music_streaming_profile field');
    }

    // Remove snapchat_handle field
    console.log('Removing snapchat_handle field...');
    const { error: removeSnapchatError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE public.profiles DROP COLUMN IF EXISTS snapchat_handle;'
    });

    if (removeSnapchatError) {
      console.log('Note: snapchat_handle removal:', removeSnapchatError.message);
    } else {
      console.log('✅ Removed snapchat_handle field');
    }

    console.log('🎉 Database schema updated successfully!');
    
  } catch (error) {
    console.error('❌ Error updating database schema:', error);
  }
}

// Alternative approach using direct SQL execution
async function fixDatabaseSchemaDirect() {
  console.log('📝 Manual SQL commands to run in your Supabase SQL editor:');
  console.log('');
  console.log('-- Add music streaming profile field');
  console.log('ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS music_streaming_profile TEXT;');
  console.log('');
  console.log('-- Remove snapchat handle field');
  console.log('ALTER TABLE public.profiles DROP COLUMN IF EXISTS snapchat_handle;');
  console.log('');
  console.log('-- Add comments');
  console.log("COMMENT ON COLUMN public.profiles.music_streaming_profile IS 'URL or handle for music streaming platform (Spotify, Apple Music, etc.)';");
  console.log('');
}

// Run the direct approach since we don't have service key
fixDatabaseSchemaDirect();
