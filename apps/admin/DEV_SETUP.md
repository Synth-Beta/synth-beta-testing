# Local Development Setup

## Quick Start

1. **Install all dependencies:**
   ```bash
   npm run setup
   ```

2. **Run both frontend and backend:**
   ```bash
   npm run dev:full
   ```
   
   ⚠️ **Important**: The backend server is required for:
   - Setlist lookup from Setlist.fm (avoids CORS issues)
   - Artist/venue search proxying
   - Location-based event search
   
   Without the backend, you'll see `ERR_CONNECTION_REFUSED` errors when using these features.

3. **Or run separately:**
   ```bash
   # Frontend only (Vite dev server on port 5173)
   npm run dev
   
   # Backend only (Express server on port 3001)
   npm run backend:dev
   ```

## Environment Variables

Create a `.env.local` file in the root directory with:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://glpiolbrafqikqhnseto.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# JamBase API
VITE_JAMBASE_API_KEY=your_jambase_api_key

# Backend URL
VITE_BACKEND_URL=http://localhost:3001

# Development flags
VITE_NODE_ENV=development
```

## Fixed Chrome Issues

✅ **404 Error on `/events` endpoint**: Fixed table name from `events` to `jambase_events`
✅ **Invalid time value errors**: Added error handling for date formatting
✅ **Multiple GoTrueClient instances**: Consolidated to single Supabase client
✅ **Field name mismatches**: Updated queries to use correct database field names

## Local URLs

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3001
- **Backend Health Check**: http://localhost:3001/health

## API Endpoints

- `GET /api/concerts/search` - Search concerts
- `GET /api/concerts/:id` - Get concert by ID
- `GET /api/concerts/recent` - Get recent concerts
- `GET /api/concerts/stats` - Get concert statistics
- `GET /health` - Backend health check

## Development Workflow

1. Make changes to your code
2. Both frontend and backend will auto-reload
3. Test in Chrome at http://localhost:5173
4. Check backend API at http://localhost:3001
5. No need to commit every change - work locally!

## Troubleshooting

- If ports are in use, kill processes: `lsof -ti:5173,3001 | xargs kill`
- If dependencies are missing: `npm run setup`
- Check backend logs in terminal for API issues
- Use Chrome DevTools Network tab to debug API calls
