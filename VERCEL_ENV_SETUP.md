# Vercel Environment Variables Setup

## Required Environment Variables for Ticketmaster API

Add these environment variables in your **Vercel Dashboard**:
- Go to: Your Project → Settings → Environment Variables

### 1. Ticketmaster API Key (REQUIRED)
**Variable Name:** `TICKETMASTER_API_KEY`  
**Value:** `rM94dPPl7ne1EAkGeZBEq5AH7zLvCAVA`  
**Environments:** Production, Preview, Development

### 2. Supabase Configuration (REQUIRED)
These should already be set, but verify they exist:

**Variable Name:** `SUPABASE_URL`  
**Value:** `https://glpiolbrafqikqhnseto.supabase.co`  
**Environments:** Production, Preview, Development

**Variable Name:** `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY`  
**Value:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkzNzgyNCwiZXhwIjoyMDcyNTEzODI0fQ.cS0y6dQiw2VvGD7tKfKADKqM8whaopJ716G4dexBRGI`  
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

