# Vercel Environment Variables Setup

## Required Environment Variables for Ticketmaster API

Add these environment variables in your **Vercel Dashboard**:
- Go to: Your Project → Settings → Environment Variables

### 1. Ticketmaster API Key (REQUIRED)
**Variable Name:** `TICKETMASTER_API_KEY`  
**Value:** `[YOUR_TICKETMASTER_API_KEY]` - Get from https://developer.ticketmaster.com  
**Environments:** Production, Preview, Development

### 2. Supabase Configuration (REQUIRED)
These should already be set, but verify they exist:

**Variable Name:** `SUPABASE_URL`  
**Value:** `[YOUR_SUPABASE_URL]` - Get from your Supabase project settings  
**Environments:** Production, Preview, Development

**Variable Name:** `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY`  
**Value:** `[YOUR_SUPABASE_KEY]` - Get from your Supabase project settings  
**Environments:** Production, Preview, Development

**Note:** The serverless function will check for `SUPABASE_ANON_KEY` first, then fall back to `SUPABASE_SERVICE_ROLE_KEY`.

## Summary

The serverless function at `/api/ticketmaster/events` needs:
- ✅ `TICKETMASTER_API_KEY` - to authenticate with Ticketmaster API
- ✅ `SUPABASE_URL` - to connect to your database
- ✅ `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` - to access Supabase

## After Adding Variables

1. **Redeploy** your Vercel project (or wait for the next deployment)
2. The changes in this commit will automatically use the serverless function when deployed
3. Test the Ticketmaster API endpoint: `https://synth-beta-testing.vercel.app/api/ticketmaster/events`

## How It Works

- **Development (localhost):** Uses `http://localhost:3001` backend
- **Production (Vercel):** Uses `/api/ticketmaster/events` serverless function (relative URL)
- **CORS:** Automatically handled by the serverless function for all Vercel domains

