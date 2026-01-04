#!/usr/bin/env node
/**
 * Check when the last Jambase sync ran by querying the most recent last_synced_at timestamp
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Load env
let envVars = {};
try {
  const envFile = readFileSync(join(projectRoot, '.env.local'), 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  });
} catch (err) {}

const supabaseUrl = process.env.SUPABASE_URL || envVars.VITE_SUPABASE_URL || 'https://glpiolbrafqikqhnseto.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || envVars.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkzNzgyNCwiZXhwIjoyMDcyNTEzODI0fQ.cS0y6dQiw2VvGD7tKfKADKqM8whaopJ716G4dexBRGI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkLastSync() {
  try {
    console.log('🔍 Checking last sync time...\n');

    // Get most recent last_synced_at from artists table
    // Use a simple query with limit to avoid timeout
    const { data: sampleData, error: sampleError } = await supabase
      .from('artists')
      .select('last_synced_at')
      .not('last_synced_at', 'is', null)
      .order('last_synced_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sampleError && sampleError.code !== 'PGRST116') {
      console.error('❌ Error querying artists:', sampleError.message);
    } else if (sampleData?.last_synced_at) {
      const artistsLastSync = sampleData.last_synced_at;
      const lastSync = new Date(artistsLastSync);
      const now = new Date();
      const diffMs = now - lastSync;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      console.log('📅 Artists Table:');
      console.log(`   Last sync: ${lastSync.toLocaleString()}`);
      if (diffDays > 0) {
        console.log(`   ${diffDays} day${diffDays > 1 ? 's' : ''} and ${diffHours % 24} hour${diffHours % 24 !== 1 ? 's' : ''} ago`);
      } else if (diffHours > 0) {
        console.log(`   ${diffHours} hour${diffHours > 1 ? 's' : ''} and ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`);
      } else {
        console.log(`   ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`);
      }
    } else {
      console.log('📅 Artists Table: No sync timestamps found');
    }

    // Also check venues table
    const { data: venuesData, error: venuesError } = await supabase
      .from('venues')
      .select('last_synced_at')
      .not('last_synced_at', 'is', null)
      .order('last_synced_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (venuesError) {
      console.error('❌ Error querying venues:', venuesError.message);
    } else if (venuesData?.last_synced_at) {
      const lastSync = new Date(venuesData.last_synced_at);
      const now = new Date();
      const diffMs = now - lastSync;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      console.log('\n📅 Venues Table:');
      console.log(`   Last sync: ${lastSync.toLocaleString()}`);
      if (diffDays > 0) {
        console.log(`   ${diffDays} day${diffDays > 1 ? 's' : ''} and ${diffHours % 24} hour${diffHours % 24 !== 1 ? 's' : ''} ago`);
      } else if (diffHours > 0) {
        console.log(`   ${diffHours} hour${diffHours > 1 ? 's' : ''} and ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`);
      } else {
        console.log(`   ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`);
      }
    } else {
      console.log('\n📅 Venues Table: No sync timestamps found');
    }

    // Get count of synced records
    const { count: artistsCount } = await supabase
      .from('artists')
      .select('*', { count: 'exact', head: true })
      .not('last_synced_at', 'is', null);

    const { count: totalArtistsCount } = await supabase
      .from('artists')
      .select('*', { count: 'exact', head: true });

    console.log(`\n📊 Statistics:`);
    console.log(`   Artists with sync timestamps: ${artistsCount || 0} / ${totalArtistsCount || 0}`);

    // Check log files if they exist
    console.log(`\n📄 Sync Schedule:`);
    console.log(`   Scheduled daily at 1:00 AM (via launchd)`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

checkLastSync();

