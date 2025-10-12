# Spotify Integration Setup Guide

## Overview
This guide walks you through setting up Spotify API integration for your Synth application. The Spotify integration allows users to connect their Spotify accounts and view their listening statistics, top tracks, and top artists.

## Prerequisites
- A Spotify account (free or premium)
- Access to the Spotify Developer Dashboard

## Step 1: Create a Spotify Application

1. **Go to Spotify Developer Dashboard**
   - Visit: https://developer.spotify.com/dashboard
   - Log in with your Spotify account

2. **Create a New App**
   - Click "Create app" button
   - Fill in the required information:
     - **App name**: `Synth` (or your preferred name)
     - **App description**: `Music event discovery and concert tracking platform`
     - **Website**: Your production URL (e.g., `https://your-domain.vercel.app`)
     - **Redirect URIs**: Add the following URIs (you'll need all of them):
       ```
       http://localhost:8080/auth/spotify/callback
       https://your-domain.vercel.app/auth/spotify/callback
       ```
       ⚠️ **Important**: Add BOTH local and production URLs
   - Accept the Terms of Service
   - Click "Save"

3. **Get Your Credentials**
   - After creating the app, you'll see your app's dashboard
   - Click "Settings" button
   - You'll see:
     - **Client ID**: A long string (e.g., `abc123xyz...`)
     - **Client Secret**: Click "View client secret" (you won't need this for PKCE flow)
   - Copy the **Client ID** - this is what you need

## Step 2: Configure Local Environment

1. **Create `.env` file**
   ```bash
   cp .env.example .env
   ```

2. **Add Spotify credentials to `.env`**
   ```env
   # For local development
   VITE_SPOTIFY_CLIENT_ID=your_actual_client_id_here
   VITE_SPOTIFY_REDIRECT_URI=http://localhost:8080/auth/spotify/callback
   ```
   
   Replace `your_actual_client_id_here` with the Client ID from Step 1.

3. **Verify configuration**
   - Make sure there are no extra spaces
   - Make sure the redirect URI matches exactly what you added in Spotify Dashboard
   - The `.env` file should be in the root directory of your project

## Step 3: Configure Vercel Environment Variables

1. **Go to Vercel Dashboard**
   - Visit: https://vercel.com/dashboard
   - Select your project

2. **Add Environment Variables**
   - Go to: Settings → Environment Variables
   - Add the following variables:

   **Variable 1:**
   - **Key**: `VITE_SPOTIFY_CLIENT_ID`
   - **Value**: Your Spotify Client ID (same as in `.env`)
   - **Environment**: Check all (Production, Preview, Development)

   **Variable 2:**
   - **Key**: `VITE_SPOTIFY_REDIRECT_URI`
   - **Value**: `https://your-domain.vercel.app/auth/spotify/callback`
   - Replace `your-domain.vercel.app` with your actual Vercel domain
   - **Environment**: Check all (Production, Preview, Development)

3. **Redeploy**
   - After adding environment variables, redeploy your application
   - Vercel will automatically rebuild with the new environment variables

## Step 4: Test the Integration

### Local Testing

1. **Start your development server**
   ```bash
   npm run dev
   ```

2. **Navigate to your profile page**
   - You should see a "Connect to Spotify" button in the Spotify Stats section

3. **Click "Connect to Spotify"**
   - You'll be redirected to Spotify's authorization page
   - Grant the requested permissions:
     - View your Spotify account data
     - View your activity on Spotify
     - View your top artists and content
   - You'll be redirected back to your app

4. **Verify data is loading**
   - You should see your top tracks, artists, and listening stats
   - Try switching between time periods (Last Month, Last 6 Months, All Time)
   - Check that recently played tracks are showing

### Production Testing

1. **Deploy to Vercel**
   ```bash
   git push origin main
   ```

2. **Test on production URL**
   - Visit your production URL
   - Go through the same connection flow
   - Verify all data loads correctly

## Troubleshooting

### Error: "Spotify integration is not available"
**Cause**: Environment variables are not set correctly
**Solution**: 
- Check that `.env` file exists and has correct values
- Verify Vercel environment variables are set
- Restart dev server after adding `.env`
- Redeploy Vercel after adding environment variables

### Error: "Invalid redirect URI"
**Cause**: The redirect URI in your code doesn't match what's registered in Spotify Dashboard
**Solution**:
- Go to Spotify Developer Dashboard → Your App → Settings
- Verify the redirect URIs match exactly:
  - Local: `http://localhost:8080/auth/spotify/callback`
  - Production: `https://your-domain.vercel.app/auth/spotify/callback`
- Add any missing URIs and click "Save"

### Error: "Invalid client"
**Cause**: Client ID is incorrect or has spaces/typos
**Solution**:
- Copy the Client ID directly from Spotify Dashboard
- Check for extra spaces or line breaks in `.env`
- Make sure the environment variable name is exactly `VITE_SPOTIFY_CLIENT_ID`

### Error: "Authentication state mismatch"
**Cause**: Browser security or localStorage was cleared during auth flow
**Solution**:
- Try again - this is usually temporary
- Clear browser cache and localStorage
- Use incognito/private browsing to test

### No data showing after connection
**Cause**: You might not have enough listening history on Spotify
**Solution**:
- Listen to some music on Spotify first
- Wait a few minutes for Spotify to update your listening data
- Try refreshing the page
- Click the "Refresh" button in the Spotify Stats component

## Security Notes

1. **Never commit `.env` file**
   - It should be in `.gitignore` (already configured)
   - Only commit `.env.example` with placeholder values

2. **Client Secret not needed**
   - The app uses PKCE flow (more secure)
   - You don't need the Client Secret for this implementation
   - Never expose Client Secret in frontend code

3. **Token Storage**
   - Access tokens are stored in localStorage
   - They expire after 1 hour
   - Refresh tokens are used to get new access tokens automatically

## API Rate Limits

Spotify API has rate limits:
- Normal use: ~1 request per second
- The app handles rate limiting with automatic retry
- If you hit limits, wait a few seconds and try again

## Permissions Required

The app requests these Spotify scopes:
- `user-read-private` - Read user profile
- `user-read-email` - Read user email
- `user-top-read` - Read top tracks and artists
- `user-read-recently-played` - Read recently played tracks
- `user-read-playback-state` - Read current playback
- `user-read-currently-playing` - Read currently playing track

## Support

If you encounter issues:
1. Check the browser console for detailed error messages
2. Verify all environment variables are set correctly
3. Ensure redirect URIs match exactly in Spotify Dashboard
4. Try clearing browser cache and localStorage
5. Test in incognito mode to rule out browser extension issues

## Next Steps

Once Spotify is working:
1. Consider adding Apple Music integration (similar process)
2. Enable music taste-based event recommendations
3. Use listening data for personalized feed
4. Add music preference matching for connections

