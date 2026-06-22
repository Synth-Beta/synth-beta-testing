# Backend Setup

## Environment Variables Required

Create a `.env.local` file in the **root directory** (not in the backend folder) with the following variables:

```env
# Supabase Configuration (REQUIRED)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key

# Setlist.fm API (REQUIRED for setlist functionality)
SETLIST_FM_API_KEY=your-setlist-fm-api-key

# JamBase API (OPTIONAL - for event search features)
JAMBASE_API_KEY=your-jambase-api-key
```

## Getting API Keys

### Supabase
1. Go to your Supabase project: https://app.supabase.com
2. Navigate to Settings → API
3. Copy the "Project URL" (SUPABASE_URL)
4. Copy the "anon/public" key (SUPABASE_ANON_KEY)

### Setlist.fm
1. Go to https://www.setlist.fm/api
2. Create an account and request an API key
3. Copy the API key to SETLIST_FM_API_KEY

### JamBase (Optional)
1. Go to https://www.jambase.com/api
2. Sign up for an API key
3. Copy the API key to JAMBASE_API_KEY

## Running the Backend

```bash
# Install dependencies (if not already done)
npm run backend:install

# Start development server
npm run backend:dev

# Or start both frontend and backend
npm run dev:full
```

## Port

The backend runs on port **3001** by default.

If port 3001 is already in use, you can:
1. Kill the process using that port: `lsof -ti:3001 | xargs kill`
2. Or set a different port: `PORT=3002 npm run backend:dev`

## Security Note

**Never commit API keys to version control!** The `.env.local` file should be in your `.gitignore`.

