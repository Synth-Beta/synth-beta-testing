# Update Supabase Redirect URLs for Production

## Changes Made in Code ✅
- Updated email confirmation redirect: `https://synth-beta-testing.vercel.app/#onboarding`
- Updated password reset redirect: `https://synth-beta-testing.vercel.app/reset-password`

## Required Supabase Dashboard Updates

You must update these settings in your Supabase Dashboard for the redirects to work:

### 1. Site URL
1. Go to **Supabase Dashboard** → Your Project
2. Click **Authentication** → **URL Configuration**
3. Update **Site URL** to: `https://synth-beta-testing.vercel.app`

### 2. Redirect URLs (Allowed List)
In the same **URL Configuration** section, add these to **Redirect URLs**:
- `https://synth-beta-testing.vercel.app/**`
- `https://synth-beta-testing.vercel.app/#onboarding`
- `https://synth-beta-testing.vercel.app/reset-password`
- `https://synth-beta-testing.vercel.app/auth/spotify/callback`

### 3. Email Templates (Optional but Recommended)
1. Go to **Authentication** → **Email Templates**
2. Update the redirect URLs in your email templates if you've customized them
3. Make sure they point to `https://synth-beta-testing.vercel.app`

### 4. Verify Environment Variables
Make sure your Vercel deployment has:
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key
- `VITE_SPOTIFY_REDIRECT_URI` - `https://synth-beta-testing.vercel.app/auth/spotify/callback`

## Testing
After making these changes:
1. Try signing up a new user
2. Check your email for the confirmation link
3. Click the link - it should redirect to `https://synth-beta-testing.vercel.app/#onboarding`
4. Complete onboarding

## Notes
- The code changes have been committed and pushed to GitHub
- Vercel will automatically deploy the updated code
- The Supabase Dashboard changes take effect immediately

