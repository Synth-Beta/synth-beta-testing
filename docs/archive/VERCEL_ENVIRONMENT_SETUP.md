# Vercel Environment Variables Setup

## Quick Reference - All Environment Variables

Add these in **Vercel Dashboard → Your Project → Settings → Environment Variables**

Make sure to select **All** environments (Production, Preview, Development) for each variable.

## Copy-Paste Ready Format

### 1. Supabase Variables

**Variable**: `VITE_SUPABASE_PROJECT_ID`  
**Value**: `glpiolbrafqikqhnseto`

**Variable**: `VITE_SUPABASE_URL`  
**Value**: `https://glpiolbrafqikqhnseto.supabase.co`

**Variable**: `VITE_SUPABASE_ANON_KEY`  
**Value**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5Mzc4MjQsImV4cCI6MjA3MjUxMzgyNH0.O5G3fW-YFtpACNqNfo_lsLK44F-3L3p69Ka-G2lSTLE`

**Variable**: `VITE_SUPABASE_PUBLISHABLE_KEY`  
**Value**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5Mzc4MjQsImV4cCI6MjA3MjUxMzgyNH0.O5G3fW-YFtpACNqNfo_lsLK44F-3L3p69Ka-G2lSTLE`

### 2. API Keys

**Variable**: `VITE_JAMBASE_API_KEY`  
**Value**: `e7ed3a9b-e73a-446e-b7c6-a96d1c53a030`

**Variable**: `VITE_SETLIST_FM_API_KEY`  
**Value**: `QxGjjwxk0MUyxyCJa2FADnFRwEqFUy__7wpt`

### 3. Spotify Configuration (REQUIRED for Music Stats)

**Variable**: `VITE_SPOTIFY_CLIENT_ID`  
**Value**: `[YOUR_SPOTIFY_CLIENT_ID_HERE]`  
ℹ️ Get this from https://developer.spotify.com/dashboard

**Variable**: `VITE_SPOTIFY_REDIRECT_URI`  
**Value**: `https://[YOUR_VERCEL_DOMAIN].vercel.app/auth/spotify/callback`  
⚠️ Replace `[YOUR_VERCEL_DOMAIN]` with your actual domain

### 4. Apple Music (Optional)

**Variable**: `VITE_APPLE_MUSIC_DEVELOPER_TOKEN`  
**Value**: `your_apple_music_token` (if you have one)

## Step-by-Step Instructions

### Access Vercel Dashboard
1. Go to https://vercel.com/dashboard
2. Click on your project (synth-beta-testing-main)
3. Go to **Settings** tab
4. Click **Environment Variables** in the left sidebar

### Add Each Variable
For each variable above:
1. Click "Add New" button
2. Enter the **Key** (variable name)
3. Enter the **Value**
4. Select environments:
   - ✅ Production
   - ✅ Preview
   - ✅ Development
5. Click "Save"

### Important Notes

**Spotify Client ID**: 
- You MUST get this from Spotify Developer Dashboard first
- See `SPOTIFY_SETUP_GUIDE.md` for how to get it
- Without this, Spotify integration will show "not available" message

**Redirect URI**:
- Must match what you set in Spotify Developer Dashboard
- Must be your actual Vercel domain
- Example: `https://synth-beta-testing-main.vercel.app/auth/spotify/callback`
- Don't forget the `/auth/spotify/callback` path!

### After Adding Variables

**You MUST redeploy** for changes to take effect:

```bash
# Option 1: Push to trigger auto-deploy
git add .
git commit -m "Add environment variables"
git push origin main

# Option 2: Manual redeploy from Vercel Dashboard
# Go to Deployments tab → Click "..." → Redeploy
```

## Verification Checklist

After redeployment, verify:

- [ ] All 8-9 environment variables are added
- [ ] All variables are set for "Production, Preview, Development"
- [ ] Spotify Client ID is your actual ID (not placeholder)
- [ ] Spotify Redirect URI has your actual Vercel domain
- [ ] Deployment succeeded without errors
- [ ] Can access your production site
- [ ] Spotify "Connect" button appears (not error message)
- [ ] Can connect to Spotify and see music stats

## Finding Your Vercel Domain

Not sure what your Vercel domain is?

1. Go to Vercel Dashboard → Your Project
2. Look at the top - you'll see your domains listed
3. Common formats:
   - `projectname.vercel.app`
   - `projectname-username.vercel.app`
   - Custom domain if you added one

**Example Redirect URI**:
If your domain is `synth-beta-testing-main.vercel.app`, then:
```
VITE_SPOTIFY_REDIRECT_URI=https://synth-beta-testing-main.vercel.app/auth/spotify/callback
```

## Spotify Dashboard Configuration

⚠️ **Critical**: You must also add this redirect URI in Spotify Developer Dashboard:

1. Go to https://developer.spotify.com/dashboard
2. Click on your app
3. Click "Settings"
4. Scroll to "Redirect URIs"
5. Add: `https://[your-vercel-domain].vercel.app/auth/spotify/callback`
6. Click "Save"

Both places (Vercel and Spotify) must have the SAME redirect URI!

## Troubleshooting

### Variables not taking effect?
- Make sure you redeployed after adding them
- Check that you selected all three environments
- Try a fresh deployment from Vercel Dashboard

### "Invalid redirect URI" error?
- Check that Vercel env var matches Spotify Dashboard exactly
- Make sure you clicked "Save" in Spotify Dashboard
- Make sure no typos in the URL

### Still seeing "not available" message?
- Check that `VITE_SPOTIFY_CLIENT_ID` is set in Vercel
- Check that it's not the placeholder text
- Try redeploying
- Check browser console for detailed error messages

## Security Note

These environment variables are safe to commit to documentation because:
- ✅ Supabase anon key is public (RLS protects data)
- ✅ JamBase and Setlist.fm keys are client-side only
- ✅ Spotify Client ID is public (Client Secret is NOT used)
- ❌ **Never** commit Client Secrets or private keys

## Need Help?

- **Spotify Setup**: See `SPOTIFY_SETUP_GUIDE.md`
- **Quick Start**: See `SPOTIFY_QUICKSTART.md`
- **Full Audit**: See `SPOTIFY_INTEGRATION_AUDIT.md`

