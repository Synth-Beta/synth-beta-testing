# Mobile Authentication - Supabase Dashboard Configuration

## Required Supabase Dashboard Updates

To enable mobile authentication (email/password sign in, sign up, forgot password, and Apple Sign In) on iOS, you must configure redirect URLs in your Supabase Dashboard.

### Steps

1. **Go to Supabase Dashboard**
   - Navigate to https://supabase.com/dashboard
   - Select your project

2. **Open Authentication Settings**
   - Click **Authentication** in the left sidebar
   - Click **URL Configuration**

3. **Add Mobile Redirect URLs**
   
   In the **Redirect URLs** section, add these URLs (one per line):
   ```
   synth://**
   synth://#onboarding
   synth://reset-password
   synth://
   ```

4. **Update Site URL (if needed)**
   - The **Site URL** should remain as your web URL: `https://synth-beta-testing.vercel.app`
   - This is used for web authentication

5. **Save Changes**
   - Click **Save** to apply the changes

### What These URLs Do

- `synth://**` - Allows all deep links with the `synth://` scheme (catch-all)
- `synth://#onboarding` - Email confirmation redirects to onboarding
- `synth://reset-password` - Password reset redirects to reset password page
- `synth://` - Base deep link scheme

### Testing

After configuring:
1. **Email/Password Sign In**: Should work immediately (no redirect needed)
2. **Email/Password Sign Up**: Click email confirmation link → opens app → navigates to onboarding
3. **Forgot Password**: Click reset link → opens app → navigates to reset password page
4. **Apple Sign In**: Should work immediately (uses native flow, no redirect)

### Notes

- These changes take effect immediately (no deployment needed)
- The mobile app uses the `synth://` custom URL scheme configured in `ios/App/App/Info.plist`
- Web authentication continues to use `https://synth-beta-testing.vercel.app` URLs
