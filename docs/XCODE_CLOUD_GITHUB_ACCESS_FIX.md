# Fix: Xcode Cloud Cannot Access GitHub for Capacitor Dependencies

## The Error

```
Could not resolve package dependencies: 
failed downloading 'https://github.com/ionic-team/capacitor-swift-pm/releases/download/8.0.0/Capacitor.xcframework.zip'
downloadError("A server with the specified hostname could not be found.")
```

## The Problem

Xcode Cloud cannot reach GitHub to download Capacitor Swift Package Manager binary frameworks. This is a network/access configuration issue in Xcode Cloud.

## The Fix (App Store Connect Configuration)

### Step 1: Grant GitHub Access in App Store Connect

1. **Go to App Store Connect**
   - Navigate to https://appstoreconnect.apple.com
   - Sign in with your Apple Developer account

2. **Open Xcode Cloud Settings**
   - Click **Users and Access** (or **My Apps** → Your App)
   - Click **Xcode Cloud** in the left sidebar
   - Click **Settings** (gear icon)

3. **Configure Repository Access**
   - Click **Repositories** tab
   - Click **Add Repository** or **Grant Access**
   - Add: `https://github.com/ionic-team/capacitor-swift-pm.git`
   - Select **Public Repository** (or configure access if private)

4. **Save Changes**

### Step 2: Verify Network Access

Xcode Cloud should automatically have access to public GitHub repositories, but if it doesn't:

1. **Check Xcode Cloud Workflow Settings**
   - Go to your workflow in Xcode Cloud
   - Check **Environment Variables**
   - Ensure no network restrictions are set

2. **Check Build Logs**
   - Look for network/DNS errors
   - Verify GitHub is reachable from Xcode Cloud

### Step 3: Alternative - Use Local Build Instead

If Xcode Cloud continues to have network issues, build locally:

```bash
# 1. Build web assets
npm run build

# 2. Sync Capacitor
npx cap sync ios

# 3. Open in Xcode
npx cap open ios

# 4. Archive and upload manually
# Product → Archive → Distribute App
```

## Why This Happens

Xcode Cloud runs in Apple's cloud infrastructure. Sometimes:
- Network restrictions block external repositories
- DNS resolution fails for GitHub
- Repository access needs explicit permission
- Temporary network issues in Xcode Cloud

## Verification

After granting access, trigger a new build. The build logs should show:
- ✅ Package resolution succeeds
- ✅ Capacitor.xcframework downloads successfully
- ✅ Build proceeds normally

## If It Still Fails

1. **Check Xcode Cloud Status**: https://developer.apple.com/system-status/
2. **Try Again**: Network issues are often temporary
3. **Contact Apple Support**: If GitHub access is consistently blocked
4. **Use Local Build**: As a workaround until Xcode Cloud access is fixed
