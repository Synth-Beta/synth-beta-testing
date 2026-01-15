# How to Check Xcode Cloud Build Logs

## Finding the Build Logs

1. Go to **App Store Connect** → **Xcode Cloud**
2. Click on your failed build
3. Click on **"Logs"** in the left sidebar (under the build action)
4. Look for the post-clone script output

## What to Look For

### If `ci_post_clone.sh` Ran Successfully

You should see:
```
🚀 Starting post-clone setup (BEFORE SPM dependency resolution)...
📁 Repository root: /Volumes/workspace/repository
📦 Installing npm dependencies...
✅ Found: @capacitor/app
✅ Found: @capacitor/push-notifications
...
✅ Pre-build setup complete!
```

### If `ci_post_clone.sh` Didn't Run

You won't see any of the above output, which means:
- The script wasn't detected by Xcode Cloud
- The script failed silently
- The script location is wrong

### If `ci_post_clone.sh` Failed

You'll see error messages like:
```
❌ Error: npm install failed
❌ Error: Node.js not found
❌ Error: package.json not found
```

## Next Steps Based on Logs

### If Script Didn't Run
- Check script is in `ci_scripts/` at repo root
- Verify script is executable (`chmod +x`)
- Check script name is exactly `ci_post_clone.sh`

### If Script Failed
- Check the specific error message
- Verify Node.js is available in Xcode Cloud
- Check if `package.json` exists at the expected path

### If Script Ran But Still Fails
- Check if `node_modules` was actually created
- Verify paths in `Package.swift` resolve correctly
- Check if there's a timing issue
