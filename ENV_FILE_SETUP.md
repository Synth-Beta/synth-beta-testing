# Create Your .env File

## Quick Setup

Copy the code block below and save it as `.env` in the root directory of your project.

### Step 1: Create the file

```bash
cd /Users/sloiterstein/Desktop/Synth/synth-beta-testing-main
touch .env
```

### Step 2: Copy this content into `.env`

```env
# Supabase Configuration
VITE_SUPABASE_PROJECT_ID=glpiolbrafqikqhnseto
VITE_SUPABASE_URL=https://glpiolbrafqikqhnseto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5Mzc4MjQsImV4cCI6MjA3MjUxMzgyNH0.O5G3fW-YFtpACNqNfo_lsLK44F-3L3p69Ka-G2lSTLE
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5Mzc4MjQsImV4cCI6MjA3MjUxMzgyNH0.O5G3fW-YFtpACNqNfo_lsLK44F-3L3p69Ka-G2lSTLE

# JamBase API
VITE_JAMBASE_API_KEY=e7ed3a9b-e73a-446e-b7c6-a96d1c53a030

# Setlist.fm API
VITE_SETLIST_FM_API_KEY=QxGjjwxk0MUyxyCJa2FADnFRwEqFUy__7wpt

# Spotify API - ADD YOUR CLIENT ID HERE
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id_here
VITE_SPOTIFY_REDIRECT_URI=http://localhost:8080/auth/spotify/callback

# Apple Music API (Optional)
VITE_APPLE_MUSIC_DEVELOPER_TOKEN=your_apple_music_token
```

### Step 3: Get Your Spotify Client ID

1. Go to: https://developer.spotify.com/dashboard
2. Log in with your Spotify account
3. Click "Create app"
4. Fill in:
   - **App name**: Synth
   - **App description**: Concert discovery platform
   - **Redirect URI**: `http://localhost:8080/auth/spotify/callback`
   - **Redirect URI**: `https://synth-beta-testing-main.vercel.app/auth/spotify/callback` (or your actual Vercel URL)
5. Click "Save"
6. Copy your **Client ID** (long string of letters and numbers)

### Step 4: Update .env

Replace `your_spotify_client_id_here` with your actual Client ID from Step 3.

### Step 5: Restart Server

```bash
# Stop current server (Ctrl+C), then:
npm run dev
```

### Step 6: Test

1. Open http://localhost:8080
2. Go to your profile or streaming stats section
3. You should see "Connect to Spotify" button
4. Click it and authorize
5. Your music stats should load!

## Vercel Environment Variables

After local testing works, add to Vercel Dashboard → Settings → Environment Variables:

| Variable | Value | Environment |
|----------|-------|-------------|
| `VITE_SUPABASE_PROJECT_ID` | `glpiolbrafqikqhnseto` | All |
| `VITE_SUPABASE_URL` | `https://glpiolbrafqikqhnseto.supabase.co` | All |
| `VITE_SUPABASE_ANON_KEY` | (your anon key from above) | All |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | (same as anon key) | All |
| `VITE_JAMBASE_API_KEY` | `e7ed3a9b-e73a-446e-b7c6-a96d1c53a030` | All |
| `VITE_SETLIST_FM_API_KEY` | `QxGjjwxk0MUyxyCJa2FADnFRwEqFUy__7wpt` | All |
| `VITE_SPOTIFY_CLIENT_ID` | (your Spotify Client ID) | All |
| `VITE_SPOTIFY_REDIRECT_URI` | `https://your-domain.vercel.app/auth/spotify/callback` | All |

**Important**: Replace `your-domain.vercel.app` with your actual Vercel domain!

## Verification

Check that your .env file is working:

```bash
# This should show your Spotify Client ID if set correctly
cat .env | grep SPOTIFY_CLIENT_ID
```

## Troubleshooting

**"Spotify integration is not available" message still showing?**
- Make sure `.env` file is in the root directory (same level as `package.json`)
- Make sure you replaced `your_spotify_client_id_here` with your actual ID
- Make sure there are no extra spaces or quotes around the Client ID
- Restart your dev server

**"Invalid redirect URI" error?**
- Go to Spotify Dashboard → Your App → Settings
- Make sure `http://localhost:8080/auth/spotify/callback` is in the Redirect URIs list
- Click "Save" at the bottom of the settings page

Need more help? See `SPOTIFY_SETUP_GUIDE.md` for detailed instructions.

