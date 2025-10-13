# Spotify Integration - Quick Start (5 Minutes)

## Current Status
❌ **Not Configured** - Environment variables missing

## What You Need To Do

### 1️⃣ Create Spotify App (3 minutes)

1. **Go to**: https://developer.spotify.com/dashboard
2. **Click**: "Create app"
3. **Fill in**:
   - App name: `Synth`
   - App description: `Concert discovery platform`
   - Redirect URIs: `http://localhost:8080/auth/spotify/callback`
   - Redirect URIs: `https://your-vercel-domain.vercel.app/auth/spotify/callback`
4. **Copy**: Your Client ID (it looks like: `abc123def456...`)

### 2️⃣ Update Local Environment (1 minute)

**Option A - Create new .env file:**
```bash
cp .env.local.template .env
```
Then edit `.env` and replace `your_spotify_client_id_here` with your actual Client ID.

**Option B - Update existing .env file:**
Add these lines to your `.env`:
```env
VITE_SPOTIFY_CLIENT_ID=paste_your_client_id_here
VITE_SPOTIFY_REDIRECT_URI=http://localhost:8080/auth/spotify/callback
```

### 3️⃣ Restart Dev Server (30 seconds)

```bash
# Stop current server (Ctrl+C), then:
npm run dev
```

### 4️⃣ Test It (1 minute)

1. Open http://localhost:8080
2. Go to your profile page
3. Look for "Connect to Spotify" button (instead of error message)
4. Click it and authorize
5. See your music stats! 🎉

## Vercel Deployment

After local testing works, add these to Vercel:

1. **Vercel Dashboard** → Your Project → Settings → Environment Variables
2. **Add**:
   - `VITE_SPOTIFY_CLIENT_ID` = (your Client ID)
   - `VITE_SPOTIFY_REDIRECT_URI` = `https://your-domain.vercel.app/auth/spotify/callback`
3. **Redeploy**: `git push origin main`

## Troubleshooting

**Still seeing "Spotify integration is not available"?**
- ✅ Check `.env` file exists in root directory
- ✅ Check no extra spaces in Client ID
- ✅ Restart dev server after creating `.env`
- ✅ Check redirect URI matches exactly in Spotify Dashboard

**"Invalid redirect URI" error?**
- ✅ Go to Spotify Dashboard → Your App → Settings
- ✅ Make sure `http://localhost:8080/auth/spotify/callback` is added
- ✅ Click "Save" at the bottom

## Success Looks Like

✅ "Connect to Spotify" button appears  
✅ Clicking redirects to Spotify authorization  
✅ After auth, redirects back to your app  
✅ Top tracks, artists, and stats display  

## Need More Help?

See `SPOTIFY_SETUP_GUIDE.md` for detailed instructions and troubleshooting.

