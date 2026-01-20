/**
 * Backfill script to generate usernames for all existing users with null usernames
 * 
 * Usage:
 *   node scripts/backfill-usernames.mjs [--dry-run] [--batch-size=100]
 * 
 * Options:
 *   --dry-run: Show what would be done without making changes
 *   --batch-size: Number of users to process in each batch (default: 100)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

// Load environment variables
dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗');
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 100;

if (isDryRun) {
  console.log('🔍 DRY RUN MODE - No changes will be made\n');
}

// Initialize Supabase client with service role key (bypasses RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Generate base username from name
 */
function generateBaseUsernameFromName(name) {
  if (!name) return '';
  
  let base = name.toLowerCase().trim();
  base = base.replace(/[^a-z0-9\s]/g, '');
  const parts = base.split(/\s+/).filter(Boolean);
  
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return parts.join('');
}

/**
 * Sanitize username
 */
function sanitizeUsername(username) {
  if (!username) return '';
  let sanitized = username.toLowerCase().trim();
  sanitized = sanitized.replace(/[^a-z0-9_.]/g, '');
  sanitized = sanitized.replace(/^[_.]+|[_.]+$/g, '');
  sanitized = sanitized.replace(/[_.]{2,}/g, (match) => match[0]);
  return sanitized;
}

/**
 * Generate unique username with conflict resolution
 */
async function generateAvailableUsername(baseUsername, existingUsernames) {
  const sanitized = sanitizeUsername(baseUsername);
  
  if (!sanitized) {
    // Fallback for invalid names
    const fallback = `user${Math.floor(Math.random() * 10000)}`;
    if (!existingUsernames.includes(fallback)) {
      return fallback;
    }
    // If fallback taken, try more
    let counter = 1;
    while (counter < 1000) {
      const variant = `user${counter}`;
      if (!existingUsernames.includes(variant)) {
        return variant;
      }
      counter++;
    }
    return null;
  }
  
  // Check if base is available
  if (!existingUsernames.includes(sanitized)) {
    return sanitized;
  }
  
  // Generate numbered variants
  let counter = 2;
  while (counter < 1000) {
    const variant = `${sanitized}${counter}`;
    if (!existingUsernames.includes(variant)) {
      return variant;
    }
    counter++;
  }
  
  return null;
}

/**
 * Main backfill function
 */
async function backfillUsernames() {
  console.log('🚀 Starting username backfill...\n');
  
  const log = {
    startTime: new Date().toISOString(),
    dryRun: isDryRun,
    batchSize,
    totalProcessed: 0,
    totalUpdated: 0,
    totalSkipped: 0,
    totalErrors: 0,
    errors: [],
    generatedUsernames: [],
  };
  
  try {
    // Step 1: Get all users with null usernames
    console.log('📊 Fetching users with null usernames...');
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('user_id, id, name, username')
      .is('username', null)
      .order('created_at', { ascending: true });
    
    if (fetchError) {
      throw new Error(`Failed to fetch users: ${fetchError.message}`);
    }
    
    if (!users || users.length === 0) {
      console.log('✅ No users with null usernames found. All users already have usernames!');
      return;
    }
    
    console.log(`📝 Found ${users.length} users without usernames\n`);
    
    // Step 2: Get all existing usernames for conflict checking
    console.log('🔍 Fetching existing usernames for conflict checking...');
    const { data: existingUsers, error: existingError } = await supabase
      .from('users')
      .select('username')
      .not('username', 'is', null);
    
    if (existingError) {
      console.warn('⚠️  Warning: Could not fetch existing usernames:', existingError.message);
      console.warn('   Proceeding without conflict checking (may result in conflicts)\n');
    }
    
    const existingUsernames = new Set(
      (existingUsers || [])
        .map(u => u.username?.toLowerCase())
        .filter(Boolean)
    );
    
    console.log(`   Found ${existingUsernames.size} existing usernames\n`);
    
    // Step 3: Process users in batches
    let processed = 0;
    const total = users.length;
    
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} users)...`);
      
      const batchUpdates = [];
      
      for (const user of batch) {
        log.totalProcessed++;
        processed++;
        
        try {
          // Generate username from name
          const baseUsername = generateBaseUsernameFromName(user.name || '');
          
          if (!baseUsername) {
            console.warn(`   ⚠️  User ${user.user_id}: Name "${user.name}" too short/invalid, using fallback`);
            log.totalSkipped++;
            continue;
          }
          
          // Generate available username using local function (not usernameService)
          // Note: This local function takes (baseUsername, existingUsernames array)
          // which differs from usernameService.generateAvailableUsername(baseName, excludeUserId)
          const newUsername = await generateAvailableUsername(
            baseUsername,
            Array.from(existingUsernames)
          );
          
          if (!newUsername) {
            console.error(`   ❌ User ${user.user_id}: Could not generate unique username`);
            log.totalErrors++;
            log.errors.push({
              user_id: user.user_id,
              name: user.name,
              error: 'Could not generate unique username',
            });
            continue;
          }
          
          // Add to existing set to prevent conflicts within batch
          existingUsernames.add(newUsername);
          
          batchUpdates.push({
            user_id: user.user_id,
            oldUsername: user.username,
            newUsername,
            name: user.name,
          });
          
          log.generatedUsernames.push({
            user_id: user.user_id,
            name: user.name,
            username: newUsername,
          });
          
          if (processed % 10 === 0) {
            process.stdout.write(`   Processed ${processed}/${total}...\r`);
          }
        } catch (error) {
          console.error(`   ❌ Error processing user ${user.user_id}:`, error.message);
          log.totalErrors++;
          log.errors.push({
            user_id: user.user_id,
            name: user.name,
            error: error.message,
          });
        }
      }
      
      // Update batch in database (unless dry run)
      if (batchUpdates.length > 0) {
        if (isDryRun) {
          console.log(`   🔍 Would update ${batchUpdates.length} users (dry run)`);
          log.totalUpdated += batchUpdates.length;
        } else {
          // Update in batch
          const updates = batchUpdates.map(update => ({
            user_id: update.user_id,
            username: update.newUsername,
            updated_at: new Date().toISOString(),
          }));
          
          // Use upsert or individual updates (Supabase doesn't support bulk updates easily)
          let batchSuccess = 0;
          for (const update of updates) {
            const { error: updateError } = await supabase
              .from('users')
              .update({ username: update.username, updated_at: update.updated_at })
              .eq('user_id', update.user_id);
            
            if (updateError) {
              console.error(`   ❌ Failed to update ${update.user_id}:`, updateError.message);
              log.totalErrors++;
            } else {
              batchSuccess++;
            }
          }
          
          log.totalUpdated += batchSuccess;
          console.log(`   ✅ Updated ${batchSuccess}/${batchUpdates.length} users`);
        }
      }
      
      console.log(''); // New line after batch
    }
    
    log.endTime = new Date().toISOString();
    log.duration = new Date(log.endTime) - new Date(log.startTime);
    
    // Step 4: Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 BACKFILL SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total processed: ${log.totalProcessed}`);
    console.log(`Total updated: ${log.totalUpdated}`);
    console.log(`Total skipped: ${log.totalSkipped}`);
    console.log(`Total errors: ${log.totalErrors}`);
    console.log(`Duration: ${Math.round(log.duration / 1000)}s`);
    console.log('='.repeat(60));
    
    if (log.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      log.errors.slice(0, 10).forEach(err => {
        console.log(`   - User ${err.user_id}: ${err.error}`);
      });
      if (log.errors.length > 10) {
        console.log(`   ... and ${log.errors.length - 10} more`);
      }
    }
    
    // Save log file
    const logPath = join(__dirname, '..', 'backfill-usernames-log.json');
    writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`\n📄 Log saved to: ${logPath}`);
    
    if (isDryRun) {
      console.log('\n🔍 This was a dry run. Run without --dry-run to apply changes.');
    } else {
      console.log('\n✅ Backfill completed successfully!');
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    log.endTime = new Date().toISOString();
    log.fatalError = error.message;
    
    const logPath = join(__dirname, '..', 'backfill-usernames-log.json');
    writeFileSync(logPath, JSON.stringify(log, null, 2));
    process.exit(1);
  }
}

// Run the backfill
backfillUsernames();

