#!/usr/bin/env node
/**
 * Password Reset Script
 * 
 * Triggers a password reset email for a user account.
 * 
 * Usage:
 *   node scripts/reset-password.mjs laurenpesceee@gmail.com
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://glpiolbrafqikqhnseto.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_ANON_KEY) {
  console.error('❌ Error: VITE_SUPABASE_ANON_KEY not found in .env.local');
  console.error('   Please add your Supabase anon key to .env.local');
  process.exit(1);
}

const email = process.argv[2];

if (!email) {
  console.error('❌ Error: Email address required');
  console.error('   Usage: node scripts/reset-password.mjs your-email@example.com');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('📧 Sending password reset email to:', email);
console.log('   Using Supabase URL:', SUPABASE_URL);

try {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://synth-beta-testing.vercel.app/reset-password',
  });

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log('✅ Password reset email sent successfully!');
  console.log('   Check your email inbox for the reset link.');
  console.log('   The link will redirect to: https://synth-beta-testing.vercel.app/reset-password');
} catch (error) {
  console.error('❌ Unexpected error:', error.message);
  process.exit(1);
}
