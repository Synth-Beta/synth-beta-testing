# 🔐 How to Securely Move APNS Keys

## Current Situation

✅ **Good News**: The APNS keys were **never committed** to git, so they're safe.

⚠️ **Action Needed**: The keys are currently in your repository directories but should be moved to a secure location.

## Step-by-Step: Move Keys Securely

### Step 1: Create Secure Directory (Outside Repository)

**On macOS/Linux:**
```bash
mkdir -p ~/.secrets
chmod 700 ~/.secrets
```

**On Windows:**
```powershell
# Create secure directory in user profile
New-Item -ItemType Directory -Path "$env:USERPROFILE\.secrets" -Force
# Set permissions (Windows)
icacls "$env:USERPROFILE\.secrets" /inheritance:d /grant "$env:USERNAME:(OI)(CI)F"
```

### Step 2: Move Keys to Secure Location

**On macOS/Linux:**
```bash
# Move the key files
mv backend/secure/AuthKey_63PL9SDG9V.p8 ~/.secrets/
mv supabase/migrations/backend/secure/AuthKey_63PL9SDG9V.p8 ~/.secrets/

# Set secure permissions (owner read/write only)
chmod 600 ~/.secrets/AuthKey_63PL9SDG9V.p8
```

**On Windows (PowerShell):**
```powershell
# Move the key files
Move-Item -Path "backend\secure\AuthKey_63PL9SDG9V.p8" -Destination "$env:USERPROFILE\.secrets\"
Move-Item -Path "supabase\migrations\backend\secure\AuthKey_63PL9SDG9V.p8" -Destination "$env:USERPROFILE\.secrets\"
```

### Step 3: Remove Empty Directories

```bash
# Remove empty secure directories from repo
rmdir backend/secure
rmdir supabase/migrations/backend/secure
```

### Step 4: Update Environment Variables

Update your `.env.local` file (NOT committed):

**macOS/Linux:**
```env
APNS_KEY_PATH=/Users/YOUR_USERNAME/.secrets/AuthKey_63PL9SDG9V.p8
APNS_KEY_ID=63PL9SDG9V
APNS_TEAM_ID=YOUR_TEAM_ID
NODE_ENV=production
```

**Windows:**
```env
APNS_KEY_PATH=C:\Users\YOUR_USERNAME\.secrets\AuthKey_63PL9SDG9V.p8
APNS_KEY_ID=63PL9SDG9V
APNS_TEAM_ID=YOUR_TEAM_ID
NODE_ENV=production
```

### Step 5: Verify Keys Are Ignored

```bash
git status
# Should NOT show the AuthKey files
```

### Step 6: Test the Setup

```bash
# Verify the key file is accessible
ls -la ~/.secrets/AuthKey_63PL9SDG9V.p8

# Test your backend can read it
node -e "const fs = require('fs'); console.log('Key readable:', fs.existsSync(process.env.APNS_KEY_PATH || ''))"
```

## Alternative: Use Environment Variables Only

If you're using a cloud service (Vercel, AWS, etc.), you can:

1. **Upload the key** to your cloud provider's secrets manager
2. **Set environment variable** in your deployment platform
3. **Never store** the key file in your local repository

## Verification Checklist

- [ ] Keys moved to secure location outside repository
- [ ] Empty `secure/` directories removed from repo
- [ ] `.env.local` updated with new path
- [ ] `git status` shows no AuthKey files
- [ ] Backend can read key from new location
- [ ] Push notifications still work

## Security Reminders

1. ✅ Keys are now in `.gitignore` - they won't be committed
2. ✅ Keys should be outside the repository
3. ✅ Use environment variables, not hardcoded paths
4. ✅ Never share keys via email, Slack, or other insecure channels
5. ✅ Rotate keys periodically (every 6-12 months)

