# Setlist.fm API Setup - Multi-Environment Support

This document explains how the setlist.fm API integration works across all environments: **localhost**, **Vercel**, **iOS**, and **Android**.

## Architecture Overview

The setlist search functionality uses a multi-tier approach:

1. **Vercel Serverless Function** (`/api/setlists/search`) - Primary for production web and mobile apps
2. **Backend Express Server** (`http://localhost:3001/api/setlists/search`) - For local development
3. **No fallbacks on localhost** - Only uses local backend, fails gracefully if backend isn't running

## API Key Configuration

**⚠️ SECURITY: API keys must be stored as environment variables, never hardcoded.**

The setlist.fm API key should be set in the `SETLIST_FM_API_KEY` environment variable.

### Environment Variables

Set these in your Vercel project settings:

- **`SETLIST_FM_API_KEY`** - The setlist.fm API key (required for serverless function)
- **`VITE_VERCEL_URL`** - Your Vercel deployment URL (optional, defaults to `https://synth-beta-testing.vercel.app`)
- **`VITE_BACKEND_URL`** - Backend Express server URL (optional, defaults to `http://localhost:3001`)

## How It Works by Environment

### 1. Localhost (Development)

- **Frontend**: `http://localhost:5174`
- **Backend**: `http://localhost:3001`
- **Flow**: Frontend → Backend Express Server → setlist.fm API
- **Important**: The backend server MUST be running! Start it with `npm run backend:dev`
- **No fallbacks**: On localhost, the code will NOT try remote URLs. If the backend isn't running, you'll get a clear error message.

### 2. Vercel (Production Web)

- **Frontend**: `https://synth-beta-testing.vercel.app`
- **Backend**: Relative URL `/api/setlists/search`
- **Flow**: Frontend → Vercel Serverless Function → setlist.fm API
- **CORS**: Properly configured to allow all origins

### 3. iOS (Capacitor App)

- **Frontend**: Native iOS app
- **Backend**: `https://synth-beta-testing.vercel.app/api/setlists/search`
- **Flow**: iOS App → Vercel Serverless Function → setlist.fm API
- **CORS**: Properly configured

### 4. Android (Capacitor App)

- **Frontend**: Native Android app
- **Backend**: `https://synth-beta-testing.vercel.app/api/setlists/search`
- **Flow**: Android App → Vercel Serverless Function → setlist.fm API
- **CORS**: Properly configured

## Files Modified

### 1. `api/setlists/search.ts` (NEW)
- Vercel serverless function
- Handles CORS for all origins (sets `Access-Control-Allow-Origin: *`)
- Handles OPTIONS preflight requests
- Uses `SETLIST_FM_API_KEY` environment variable
- Falls back to hardcoded key if env var not set

### 2. `backend/setlist-routes.js` (UPDATED)
- Updated to use environment variables
- Falls back to hardcoded key if env var not set
- Enhanced CORS for mobile apps

### 3. `src/services/setlistService.ts` (UPDATED)
- Smart URL detection based on environment
- Detects Capacitor (iOS/Android) vs web
- **On localhost**: Only uses local backend, no remote fallbacks
- Automatically chooses correct backend URL

### 4. `backend/server.js` (UPDATED)
- Enhanced CORS configuration
- Allows Capacitor origins (`capacitor://localhost`, `ionic://localhost`)
- More permissive in development mode

### 5. `vercel.json` (UPDATED)
- Added function configuration for setlist endpoint
- Set max duration to 10 seconds

### 6. `package.json` (UPDATED)
- Added `@vercel/node` as dev dependency

## Testing

### Test Localhost (REQUIRES BACKEND RUNNING)

```bash
# Terminal 1: Start backend (REQUIRED!)
npm run backend:dev

# Terminal 2: Start frontend
npm run dev

# Test: Open http://localhost:5174 and try searching for a setlist
```

**Important**: If you see errors about the backend not being available, make sure the backend server is running in a separate terminal!

### Test Vercel
1. Deploy to Vercel
2. Set `SETLIST_FM_API_KEY` environment variable in Vercel dashboard
3. Test: Visit `https://synth-beta-testing.vercel.app` and try searching for a setlist

### Test iOS/Android
1. Build the app: `npm run ios:build` or `npm run android:build`
2. Run on device/simulator
3. Test: Try searching for a setlist in the app

## Troubleshooting

### "Local backend not available" Error on Localhost
- **Symptom**: Error message says "Please start the backend server with: npm run backend:dev"
- **Fix**: Start the backend server in a separate terminal: `npm run backend:dev`
- **Why**: On localhost, the code ONLY uses the local backend. It won't try remote URLs.

### CORS Errors on Localhost
- **Symptom**: `Access-Control-Allow-Origin` errors when calling Vercel URL from localhost
- **Fix**: You shouldn't be seeing this! The code has been updated to NOT call remote URLs from localhost. If you see this, it means the backend detection isn't working correctly.
- **Check**: Make sure `getBackendUrl()` is returning `http://localhost:3001` when running locally

### 404 Errors on Vercel
- **Symptom**: `/api/setlists/search` returns 404 on Vercel
- **Fix**: Ensure the serverless function is deployed. The file must be at `api/setlists/search.ts`
- **Check**: Verify `api/setlists/search.ts` exists in your repo and has been deployed

### API Key Errors
- **Symptom**: setlist.fm API returns 401/403
- **Fix**: Set `SETLIST_FM_API_KEY` in Vercel environment variables
- **Check**: Verify the key is set correctly in your environment variables (never hardcode in source code)

### iOS/Android Not Working
- **Symptom**: Setlist search fails in mobile app
- **Fix**: Ensure `VITE_VERCEL_URL` is set or defaults to correct URL
- **Check**: Verify Capacitor detection in `setlistService.ts` and that it's using the full Vercel URL

## Rate Limiting

setlist.fm API allows ~2 requests per second. The code implements rate limiting with a 1-second delay between requests (in both the Express backend and serverless function).

## Next Steps

1. **Start Backend for Local Development**: Run `npm run backend:dev` in a separate terminal
2. **Deploy to Vercel**: Push changes and deploy
3. **Set Environment Variables**: Add `SETLIST_FM_API_KEY` in Vercel dashboard
4. **Test All Environments**: Verify localhost, Vercel, iOS, and Android all work
5. **Monitor**: Check Vercel function logs for any errors

