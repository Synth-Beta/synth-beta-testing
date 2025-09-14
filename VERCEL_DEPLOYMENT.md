# Vercel Deployment Configuration

## Required Environment Variables

To deploy this application to Vercel, you need to configure the following environment variables in your Vercel dashboard:

### 1. Supabase Configuration
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_ANON_KEY`: Your Supabase anonymous key

### 2. JamBase API Configuration
- `JAMBASE_API_KEY`: Your JamBase API key

### 3. Backend Configuration
- `BACKEND_URL`: Your backend API URL (if using a separate backend)

## How to Set Environment Variables in Vercel

1. Go to your Vercel dashboard
2. Select your project
3. Go to Settings → Environment Variables
4. Add each variable with the following mapping:
   - `VITE_SUPABASE_URL` ← `SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` ← `SUPABASE_ANON_KEY`
   - `VITE_JAMBASE_API_KEY` ← `JAMBASE_API_KEY`
   - `VITE_BACKEND_URL` ← `BACKEND_URL`

## Current Values (for reference)

```env
SUPABASE_URL=https://glpiolbrafqikqhnseto.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5Mzc4MjQsImV4cCI6MjA3MjUxMzgyNH0.O5G3fW-YFtpACNqNfo_lsLK44F-3L3p69Ka-G2lSTLE
JAMBASE_API_KEY=e7ed3a9b-e73a-446e-b7c6-a96d1c53a030
BACKEND_URL=http://localhost:3001
```

## Troubleshooting

If the JamBase API is not working on Vercel:

1. Check that `JAMBASE_API_KEY` is set in Vercel environment variables
2. Verify the API key is correct and active
3. Check the Vercel function logs for any errors
4. Ensure the environment variable is available at build time

## Build Configuration

The `vercel.json` file is configured to:
- Use Vite as the build framework
- Map environment variables from Vercel to Vite
- Handle client-side routing with rewrites
