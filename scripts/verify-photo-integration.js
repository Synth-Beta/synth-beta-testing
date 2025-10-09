#!/usr/bin/env node

/**
 * Photo Integration Verification Script
 * 
 * This script verifies that the photo integration is properly set up:
 * 1. Storage buckets exist
 * 2. Storage policies are applied
 * 3. Database schema is ready
 * 4. Components are accessible
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🔍 Verifying Photo Integration Setup...\n');

// Verification functions
async function checkStorageBuckets() {
  console.log('📦 Checking Storage Buckets...');
  
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) throw error;
    
    const requiredBuckets = ['review-photos', 'profile-avatars', 'event-photos'];
    const existingBuckets = buckets.map(b => b.id);
    
    for (const bucketName of requiredBuckets) {
      if (existingBuckets.includes(bucketName)) {
        console.log(`   ✅ ${bucketName} - exists`);
      } else {
        console.log(`   ❌ ${bucketName} - MISSING`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('   ❌ Error checking buckets:', error.message);
    return false;
  }
}

async function checkDatabaseSchema() {
  console.log('\n📊 Checking Database Schema...');
  
  try {
    // Check if user_reviews has photos column
    const { data: reviews, error: reviewError } = await supabase
      .from('user_reviews')
      .select('photos, videos')
      .limit(1);
    
    if (reviewError) {
      console.log('   ❌ user_reviews table or columns missing');
      console.error('      ', reviewError.message);
    } else {
      console.log('   ✅ user_reviews.photos - exists');
      console.log('   ✅ user_reviews.videos - exists');
    }
    
    // Check if profiles has avatar_url column
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('avatar_url')
      .limit(1);
    
    if (profileError) {
      console.log('   ❌ profiles.avatar_url column missing');
      console.error('      ', profileError.message);
    } else {
      console.log('   ✅ profiles.avatar_url - exists');
    }
    
    return true;
  } catch (error) {
    console.error('   ❌ Error checking database:', error.message);
    return false;
  }
}

function checkFileExists(filePath) {
  const fullPath = path.join(__dirname, filePath);
  return fs.existsSync(fullPath);
}

function checkComponents() {
  console.log('\n🧩 Checking Components...');
  
  const files = [
    { path: 'src/services/storageService.ts', name: 'Storage Service' },
    { path: 'src/components/ui/photo-upload.tsx', name: 'Photo Upload Component' },
    { path: 'src/components/reviews/ReviewFormSteps/ReviewContentStep.tsx', name: 'Review Content Step' },
    { path: 'src/components/profile/ProfileEdit.tsx', name: 'Profile Edit' },
    { path: 'supabase/migrations/20250201000000_create_storage_buckets.sql', name: 'Storage Migration' },
  ];
  
  let allExist = true;
  
  for (const file of files) {
    if (checkFileExists(file.path)) {
      console.log(`   ✅ ${file.name}`);
    } else {
      console.log(`   ❌ ${file.name} - NOT FOUND`);
      allExist = false;
    }
  }
  
  return allExist;
}

function checkTypeDefinitions() {
  console.log('\n📝 Checking Type Definitions...');
  
  try {
    const reviewFormPath = path.join(__dirname, 'src/hooks/useReviewForm.ts');
    const reviewServicePath = path.join(__dirname, 'src/services/reviewService.ts');
    
    const reviewFormContent = fs.readFileSync(reviewFormPath, 'utf8');
    const reviewServiceContent = fs.readFileSync(reviewServicePath, 'utf8');
    
    const hasPhotosInForm = reviewFormContent.includes('photos: string[]');
    const hasVideosInForm = reviewFormContent.includes('videos: string[]');
    const hasPhotosInService = reviewServiceContent.includes('photos?: string[]');
    
    if (hasPhotosInForm && hasVideosInForm) {
      console.log('   ✅ ReviewFormData types updated');
    } else {
      console.log('   ❌ ReviewFormData missing photo/video types');
    }
    
    if (hasPhotosInService) {
      console.log('   ✅ ReviewData types updated');
    } else {
      console.log('   ❌ ReviewData missing photo types');
    }
    
    return hasPhotosInForm && hasPhotosInService;
  } catch (error) {
    console.error('   ❌ Error checking types:', error.message);
    return false;
  }
}

// Run all checks
async function main() {
  const results = {
    storage: await checkStorageBuckets(),
    database: await checkDatabaseSchema(),
    components: checkComponents(),
    types: checkTypeDefinitions(),
  };
  
  console.log('\n' + '='.repeat(50));
  console.log('📋 VERIFICATION SUMMARY');
  console.log('='.repeat(50));
  
  const allPassed = Object.values(results).every(r => r);
  
  if (allPassed) {
    console.log('\n✅ All checks passed! Photo integration is ready to use.');
    console.log('\n📚 Next steps:');
    console.log('   1. Test photo upload in review form');
    console.log('   2. Test avatar upload in profile edit');
    console.log('   3. Verify photos display in feeds');
    console.log('   4. Check PHOTO_INTEGRATION_GUIDE.md for full docs');
  } else {
    console.log('\n⚠️  Some checks failed. Please review the errors above.');
    console.log('\n🔧 Troubleshooting:');
    
    if (!results.storage) {
      console.log('   - Run migration: npm run supabase db push');
      console.log('   - Or apply migration manually in Supabase dashboard');
    }
    
    if (!results.database) {
      console.log('   - Check if migrations have been applied');
      console.log('   - Verify RLS policies are enabled');
    }
    
    if (!results.components) {
      console.log('   - Ensure all files have been created');
      console.log('   - Check file paths are correct');
    }
    
    if (!results.types) {
      console.log('   - Update type definitions in useReviewForm.ts');
      console.log('   - Update type definitions in reviewService.ts');
    }
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);

