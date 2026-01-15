# 🔒 APNS Authentication Keys Security Protocol

## ⚠️ CRITICAL SECURITY ALERT

**Apple Push Notification Service (APNS) Authentication Keys (`.p8` files) are HIGHLY SENSITIVE and must NEVER be committed to version control.**

## What Are These Files?

- **File Type**: `.p8` files are Apple's APNS authentication keys
- **Purpose**: Used to send push notifications to iOS devices
- **Security Level**: **CRITICAL** - If exposed, attackers can send push notifications to your users

## Current Status

✅ **GOOD NEWS**: These files are currently:
- **NOT tracked** in git (untracked files)
- **NOT committed** to the repository
- **NOW IGNORED** via `.gitignore`

## Security Protocol

### 1. ✅ Files Are Now Protected

The following patterns have been added to `.gitignore`:
```
*.p8
*.p12
*.pem
*.cer
*.key
**/secure/**
**/secrets/**
AuthKey*.p8
backend/secure/
supabase/migrations/backend/secure/
```

### 2. ⚠️ If Keys Were Ever Committed (Check Required)

If these files were EVER committed to git history, you MUST:

#### Immediate Actions:
1. **Revoke the exposed key immediately** in Apple Developer Portal:
   - Go to https://developer.apple.com/account/resources/authkeys/list
   - Find key ID: `63PL9SDG9V`
   - Click "Revoke" (this will invalidate the key)

2. **Generate a new key**:
   - Create new APNS key in Apple Developer Portal
   - Download the new `.p8` file
   - Update `APNS_KEY_ID` environment variable

3. **Remove from git history** (if committed):
   ```bash
   # Use git filter-branch or BFG Repo-Cleaner
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch '**/AuthKey*.p8' '**/secure/**/*.p8'" \
     --prune-empty --tag-name-filter cat -- --all
   
   # Force push (WARNING: This rewrites history)
   git push origin --force --all
   ```

4. **Notify team** if repository is shared

### 3. ✅ Proper Storage Location

**DO NOT** store keys in the repository. Instead:

#### Option A: Environment Variables (Recommended)
```env
# In .env.local (NOT committed)
APNS_KEY_PATH=/path/to/secure/location/AuthKey_63PL9SDG9V.p8
APNS_KEY_ID=63PL9SDG9V
APNS_TEAM_ID=YOUR_TEAM_ID
```

#### Option B: Secure Directory Outside Repository
```bash
# Store in user's home directory
~/.secrets/AuthKey_63PL9SDG9V.p8

# Set proper permissions
chmod 600 ~/.secrets/AuthKey_63PL9SDG9V.p8
```

#### Option C: Secrets Management Service
- AWS Secrets Manager
- Azure Key Vault
- HashiCorp Vault
- GitHub Secrets (for CI/CD)

### 4. ✅ Verification Checklist

Run these commands to verify security:

```bash
# Check if files are ignored
git check-ignore -v backend/secure/AuthKey_63PL9SDG9V.p8

# Check if files are tracked
git ls-files | grep -i "AuthKey\|\.p8"

# Check git history (should return nothing)
git log --all --full-history --oneline -- "*AuthKey*.p8"
```

### 5. 🔍 How to Check If Keys Were Exposed

```bash
# Check local history
git log --all --full-history --oneline -- "*AuthKey*.p8"

# Check remote branches
git log origin/main --oneline --all -- "*AuthKey*.p8"

# Search entire repository
git log --all --full-history --source -- "*AuthKey*.p8"
```

If any of these return results, **the keys were exposed** and must be revoked.

## Current File Locations

These files should be **removed from the repository** and stored securely elsewhere:

1. `backend/secure/AuthKey_63PL9SDG9V.p8` ❌ (should not be in repo)
2. `supabase/migrations/backend/secure/AuthKey_63PL9SDG9V.p8` ❌ (should not be in repo)

## Recommended Action Plan

1. ✅ **DONE**: Added to `.gitignore` (files are now protected)
2. ⚠️ **TODO**: Verify keys were never committed to remote
3. ⚠️ **TODO**: Move files to secure location outside repository
4. ⚠️ **TODO**: Update `APNS_KEY_PATH` environment variable
5. ⚠️ **TODO**: Delete files from repository directories
6. ⚠️ **TODO**: If exposed, revoke and regenerate keys

## Best Practices Going Forward

1. **Never commit** `.p8`, `.p12`, `.pem`, `.cer`, or `.key` files
2. **Always use** environment variables for key paths
3. **Store keys** outside the repository
4. **Use secrets management** services in production
5. **Rotate keys** periodically
6. **Monitor** for unauthorized key usage

## If Keys Were Exposed

If you discover these keys were committed to a public repository:

1. **Immediately revoke** the key in Apple Developer Portal
2. **Generate new key** and update all services
3. **Remove from git history** (see commands above)
4. **Force push** to update remote (coordinate with team)
5. **Monitor** for suspicious push notification activity
6. **Consider** notifying affected users if necessary

## References

- [Apple APNs Documentation](https://developer.apple.com/documentation/usernotifications)
- [GitHub: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

