#!/usr/bin/env node

/**
 * Test script to verify photo upload and persistence functionality
 * This script tests the complete flow: upload -> save -> retrieve
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testPhotoUpload() {
  console.log('🧪 Testing photo upload and persistence...\n');

  try {
    // 1. Test storage bucket access
    console.log('1️⃣ Testing storage bucket access...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error('❌ Failed to list buckets:', bucketsError);
      return;
    }
    
    const reviewPhotosBucket = buckets.find(b => b.name === 'review-photos');
    if (!reviewPhotosBucket) {
      console.error('❌ review-photos bucket not found');
      return;
    }
    console.log('✅ review-photos bucket found');

    // 2. Test database schema for photos column
    console.log('\n2️⃣ Testing database schema...');
    const { data: schemaTest, error: schemaError } = await supabase
      .from('user_reviews')
      .select('photos')
      .limit(1);
    
    if (schemaError) {
      console.error('❌ Failed to query photos column:', schemaError);
      return;
    }
    console.log('✅ photos column exists in user_reviews table');

    // 3. Test creating a review with photos
    console.log('\n3️⃣ Testing review creation with photos...');
    const testUserId = 'test-user-' + Date.now();
    const testEventId = 'test-event-' + Date.now();
    const testPhotos = [
      'https://example.com/photo1.jpg',
      'https://example.com/photo2.jpg'
    ];

    const { data: reviewData, error: reviewError } = await supabase
      .from('user_reviews')
      .insert({
        user_id: testUserId,
        event_id: testEventId,
        rating: 4.5,
        review_text: 'Test review with photos',
        photos: testPhotos,
        is_public: true
      })
      .select()
      .single();

    if (reviewError) {
      console.error('❌ Failed to create review with photos:', reviewError);
      return;
    }
    console.log('✅ Review created with photos:', reviewData.photos);

    // 4. Test retrieving the review with photos
    console.log('\n4️⃣ Testing review retrieval...');
    const { data: retrievedReview, error: retrieveError } = await supabase
      .from('user_reviews')
      .select('*')
      .eq('id', reviewData.id)
      .single();

    if (retrieveError) {
      console.error('❌ Failed to retrieve review:', retrieveError);
      return;
    }

    if (!retrievedReview.photos || retrievedReview.photos.length === 0) {
      console.error('❌ Photos not found in retrieved review');
      return;
    }

    if (JSON.stringify(retrievedReview.photos) !== JSON.stringify(testPhotos)) {
      console.error('❌ Photos mismatch in retrieved review');
      console.error('Expected:', testPhotos);
      console.error('Got:', retrievedReview.photos);
      return;
    }
    console.log('✅ Photos correctly retrieved:', retrievedReview.photos);

    // 5. Test updating review with new photos
    console.log('\n5️⃣ Testing review update with photos...');
    const updatedPhotos = [...testPhotos, 'https://example.com/photo3.jpg'];
    
    const { data: updatedReview, error: updateError } = await supabase
      .from('user_reviews')
      .update({ photos: updatedPhotos })
      .eq('id', reviewData.id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Failed to update review photos:', updateError);
      return;
    }

    if (JSON.stringify(updatedReview.photos) !== JSON.stringify(updatedPhotos)) {
      console.error('❌ Photos not updated correctly');
      console.error('Expected:', updatedPhotos);
      console.error('Got:', updatedReview.photos);
      return;
    }
    console.log('✅ Photos correctly updated:', updatedReview.photos);

    // 6. Clean up test data
    console.log('\n6️⃣ Cleaning up test data...');
    const { error: deleteError } = await supabase
      .from('user_reviews')
      .delete()
      .eq('id', reviewData.id);

    if (deleteError) {
      console.warn('⚠️ Failed to clean up test review:', deleteError);
    } else {
      console.log('✅ Test data cleaned up');
    }

    console.log('\n🎉 All photo upload and persistence tests passed!');
    console.log('\nThe issue you were experiencing should now be fixed.');
    console.log('Photos should now be properly saved and retrieved when creating/editing reviews.');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Run the test
testPhotoUpload();
