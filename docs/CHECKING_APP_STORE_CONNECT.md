# How to Check if Your App is in App Store Connect

This guide explains how to verify your app and builds in App Store Connect.

## Accessing App Store Connect

1. **Go to App Store Connect:**
   - Visit: https://appstoreconnect.apple.com
   - Sign in with your Apple ID (the one associated with your developer account)

2. **Required Role:**
   - You need one of these roles: Account Holder, Admin, App Manager, or Developer
   - If you can't access, contact your team's Account Holder or Admin

## Finding Your App

### Method 1: My Apps Dashboard

1. **Navigate to Apps:**
   - Click **"My Apps"** in the top navigation
   - You'll see a list of all apps in your account

2. **Search for Your App:**
   - Look for "Synth" in the app list
   - Or search by Bundle ID: `com.tejpatel.synth`
   - Or search by SKU: `synth-ios-001`

3. **Click on Your App:**
   - This opens the app's detail page

### Method 2: Direct Search

1. Use the search bar at the top
2. Type "Synth" or your Bundle ID
3. Select your app from results

## Checking App Information

Once you're on your app's page, you'll see:

### General Information Section

- **Bundle ID:** Should show `com.tejpatel.synth`
- **SKU:** Should show `synth-ios-001`
- **Apple ID:** A numeric ID (e.g., `6757408095`)
- **Primary Language:** English (U.S.)
- **Category:** Your selected categories

### App Status

Look for status indicators:
- **Prepare for Submission** - App is being set up
- **Waiting for Review** - Submitted for review
- **In Review** - Apple is reviewing
- **Ready for Sale** - Approved and available
- **Rejected** - Needs fixes

## Checking for Builds

### Viewing Uploaded Builds

1. **Go to TestFlight Tab:**
   - Click **"TestFlight"** in the left sidebar
   - This shows all builds uploaded for testing

2. **Go to App Store Tab:**
   - Click **"App Store"** in the left sidebar
   - Click on a version number (e.g., "1.0")
   - Scroll to **"Build"** section
   - You'll see available builds here

### Build Status Indicators

Builds can have different statuses:

- **Processing** ⏳
  - Build was uploaded but Apple is still processing
  - Usually takes 10-30 minutes
  - You'll receive an email when complete

- **Ready to Submit** ✅
  - Build is processed and ready to use
  - Can be selected for App Store submission
  - Can be distributed via TestFlight

- **Invalid** ❌
  - Build has issues (signing, missing info, etc.)
  - Check email for details
  - Need to fix and re-upload

- **Expired** ⏰
  - Build is too old (90 days for TestFlight)
  - Need to upload a new build

### Build Information

Each build shows:
- **Build Number:** The CFBundleVersion (e.g., "1", "2", "3")
- **Version:** The CFBundleShortVersionString (e.g., "1.0")
- **Upload Date:** When you uploaded it
- **Processing Date:** When Apple finished processing
- **Size:** Build file size

## Email Notifications

Apple sends emails for important events:

### Build Processing Complete
- **Subject:** "Your app build has finished processing"
- **When:** 10-30 minutes after upload
- **Contains:** Build number and status

### Build Issues
- **Subject:** "Your app build could not be processed"
- **When:** If there are problems with the build
- **Contains:** Details about what went wrong

### Check Your Email
- Look for emails from: `noreply@email.apple.com`
- Check spam folder if you don't see them
- Ensure your email in App Store Connect is correct

## Verifying Your App is Set Up Correctly

### Checklist

- [ ] App appears in "My Apps" list
- [ ] Bundle ID matches: `com.tejpatel.synth`
- [ ] SKU is set: `synth-ios-001`
- [ ] Apple ID is assigned (numeric ID)
- [ ] At least one build has been uploaded
- [ ] Build status is "Ready to Submit" (not "Processing" or "Invalid")

## Troubleshooting

### "I don't see my app"

**Possible reasons:**
1. **Wrong Apple ID:** Make sure you're signed in with the correct account
2. **No access:** Your role might not have permission
3. **App not created:** The app might not have been added to your account yet

**Solution:**
- Contact your Account Holder or Admin
- Verify you're using the correct Apple ID
- Check if the app was created in a different team/account

### "I see the app but no builds"

**Possible reasons:**
1. **Build not uploaded yet:** You only synced, didn't archive/upload
2. **Build still processing:** Check email for status
3. **Build failed:** Check email for error details
4. **Wrong Bundle ID:** Build Bundle ID doesn't match App Store Connect

**Solution:**
- Upload a build using the upload script or Xcode
- Wait 10-30 minutes for processing
- Check your email for notifications
- Verify Bundle ID matches exactly

### "Build shows as Invalid"

**Common causes:**
- Bundle ID mismatch
- Missing required capabilities
- Code signing issues
- Missing app icons or launch screens

**Solution:**
- Check the email from Apple for specific errors
- Fix issues in Xcode
- Re-upload the build

## Quick Verification Steps

1. **Login:** https://appstoreconnect.apple.com
2. **Click:** "My Apps"
3. **Find:** "Synth" or search `com.tejpatel.synth`
4. **Check:** App details match your expectations
5. **Navigate:** To "TestFlight" or "App Store" tab
6. **Verify:** Builds are listed and have "Ready to Submit" status

## Next Steps After Verification

Once you confirm your app and builds are in App Store Connect:

1. **For TestFlight Testing:**
   - Go to TestFlight tab
   - Add internal/external testers
   - Distribute builds for testing

2. **For App Store Submission:**
   - Go to App Store tab
   - Complete app information
   - Select a build
   - Submit for review

3. **For Updates:**
   - Upload new builds as needed
   - Increment build number each time
   - Wait for processing before submitting

## Related Documentation

- [iOS Build and Upload Guide](./IOS_BUILD_AND_UPLOAD.md)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)
- [TestFlight Documentation](https://developer.apple.com/testflight/)
