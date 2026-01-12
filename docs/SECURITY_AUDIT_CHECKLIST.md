# Security Audit Checklist

This checklist helps you verify that your application is secure before deploying to production or submitting to the App Store.

## Pre-Deployment Security Checks

### 1. Console Log Removal ✅

**Test:** Build production bundle and verify console logs are removed

```bash
# Build production bundle
npm run build

# Preview production build
npm run preview
```

**Chrome DevTools Test:**
1. Open `http://localhost:4173` (or your preview URL)
2. Open Chrome DevTools (F12)
3. Go to Console tab
4. ✅ **PASS:** No console.log, console.warn, or console.error output visible
5. ❌ **FAIL:** If you see any console output, check `vite.config.ts` esbuild.drop configuration

**Expected Result:** Console should be empty or only show browser warnings (not your app logs)

---

### 2. Source Maps Disabled ✅

**Test:** Verify source maps are not included in production build

```bash
# Check dist folder
ls -la dist/assets/*.map 2>/dev/null || echo "No source maps found - GOOD"
```

**Chrome DevTools Test:**
1. Open production build in Chrome
2. Open DevTools → Sources tab
3. ✅ **PASS:** Only see minified/obfuscated code (webpack://, node_modules, etc.)
4. ❌ **FAIL:** If you see your original source files clearly readable

**Expected Result:** Source code should be minified and unreadable

---

### 3. Network Request Security Testing 🔒

**Test:** Verify network requests cannot be replayed to access unauthorized data

#### Test 3.1: Supabase Request Replay

1. Open Chrome DevTools → Network tab
2. Log in to your app
3. Find a Supabase REST API request (e.g., `/rest/v1/profiles`)
4. Right-click → Copy → Copy as cURL
5. Open new Incognito window (no authentication)
6. Paste cURL command in terminal
7. Remove or modify the `Authorization: Bearer` header
8. Execute the request

**Expected Results:**
- ✅ **PASS:** Returns `401 Unauthorized` or empty result `[]`
- ❌ **FAIL:** Returns data without authentication

#### Test 3.2: User ID Manipulation

1. Copy a network request that fetches user-specific data
2. Modify the `user_id` parameter in the request
3. Replay the request

**Expected Results:**
- ✅ **PASS:** Returns only your own data or empty result
- ❌ **FAIL:** Returns data for other users

#### Test 3.3: Direct Database Access Attempt

1. Try to access Supabase REST API directly without auth token:
   ```bash
   curl "https://YOUR_PROJECT.supabase.co/rest/v1/profiles?select=*"
   ```

**Expected Results:**
- ✅ **PASS:** Returns empty array `[]` or error
- ❌ **FAIL:** Returns user data

---

### 4. Environment Variable Audit 🔑

**Test:** Verify no secrets are exposed in frontend code

```bash
# Run security audit script
node scripts/security-audit.js
```

**Manual Checks:**

1. ✅ **PASS:** No `VITE_SUPABASE_SERVICE_ROLE_KEY` in frontend code
2. ✅ **PASS:** Only `VITE_SUPABASE_ANON_KEY` used in frontend (safe to expose)
3. ✅ **PASS:** No hardcoded API keys in source code
4. ✅ **PASS:** No JWT secrets in frontend code
5. ❌ **FAIL:** If any secrets found, remove them immediately

**Check Files:**
- `src/integrations/supabase/client.ts` - Should only use anon key
- All `src/**/*.ts` and `src/**/*.tsx` files - No service role keys
- `vite.config.ts` - No secrets in config

---

### 5. Row Level Security (RLS) Verification 🛡️

**Test:** Verify all database tables have RLS enabled

1. Open Supabase Dashboard → SQL Editor
2. Run `scripts/verify-rls-policies.sql`
3. Review the results

**Expected Results:**
- ✅ **PASS:** All tables show "RLS Enabled"
- ✅ **PASS:** All tables have at least one policy
- ✅ **PASS:** Policies use `auth.uid()` or `auth.role()` for access control
- ❌ **FAIL:** Any table without RLS or policies

**Critical Tables to Verify:**
- `profiles` - Users can only read/update their own profile
- `user_reviews` - Users can only manage their own reviews
- `device_tokens` - Service role only
- `push_notification_queue` - Service role only
- `analytics_user_daily` - Users can only view their own analytics
- `user_settings_preferences` - Users can only access their own settings

---

### 6. API Endpoint Security Testing 🌐

**Test:** Verify backend API endpoints are properly secured

#### Test 6.1: Rate Limiting

1. Make rapid requests to an API endpoint (e.g., `/api/search-concerts`)
2. Continue until rate limit is hit

**Expected Results:**
- ✅ **PASS:** Returns `429 Too Many Requests` after limit
- ✅ **PASS:** Includes `Retry-After` header
- ❌ **FAIL:** No rate limiting applied

#### Test 6.2: Input Validation

1. Send malformed requests to API endpoints
2. Try SQL injection attempts in search queries
3. Send oversized payloads

**Expected Results:**
- ✅ **PASS:** Returns `400 Bad Request` for invalid input
- ✅ **PASS:** Rejects SQL injection attempts
- ✅ **PASS:** Returns `413 Payload Too Large` for oversized requests
- ❌ **FAIL:** Accepts invalid input or crashes

#### Test 6.3: Authentication Required

1. Try to access protected endpoints without authentication
2. Try with invalid/expired tokens

**Expected Results:**
- ✅ **PASS:** Returns `401 Unauthorized` without auth
- ✅ **PASS:** Returns `401 Unauthorized` with invalid token
- ❌ **FAIL:** Allows access without proper authentication

---

### 7. Build Output Security Check 📦

**Test:** Verify production build doesn't expose secrets

```bash
# Build production bundle
npm run build

# Check for exposed secrets in build output
grep -r "SERVICE_ROLE_KEY" dist/ || echo "✅ No service role keys in build"
grep -r "eyJ.*service_role" dist/ || echo "✅ No hardcoded JWT tokens in build"
```

**Expected Results:**
- ✅ **PASS:** No secrets found in `dist/` folder
- ❌ **FAIL:** Secrets found in build output

---

### 8. Chrome DevTools Inspection Test 🔍

**Complete Manual Test:**

1. **Open Production Build:**
   ```bash
   npm run build
   npm run preview
   ```

2. **Console Tab:**
   - ✅ No console.log output
   - ✅ No error messages exposing internal logic
   - ✅ No stack traces with file paths

3. **Network Tab:**
   - ✅ Requests use HTTPS only
   - ✅ Authorization headers present for authenticated requests
   - ✅ No API keys visible in request URLs
   - ✅ Response data doesn't expose other users' information

4. **Sources Tab:**
   - ✅ Code is minified/obfuscated
   - ✅ No readable source maps
   - ✅ No comments exposing logic

5. **Application Tab:**
   - ✅ No sensitive data in localStorage
   - ✅ No secrets in sessionStorage
   - ✅ Cookies are httpOnly where appropriate

---

### 9. iOS App Store Specific Checks 📱

**For Capacitor/iOS builds:**

1. ✅ **Build iOS App:**
   ```bash
   npm run build
   npx cap sync ios
   ```

2. ✅ **Verify:**
   - No console logs in Xcode console
   - No debug endpoints accessible
   - No test accounts hardcoded
   - No development API keys

3. ✅ **Test on Device:**
   - App functions correctly
   - No crashes
   - Network requests work
   - Authentication works

---

## Quick Security Checklist Summary

Before deploying to production or App Store:

- [ ] Console logs removed in production build
- [ ] Source maps disabled
- [ ] No hardcoded secrets in codebase
- [ ] No service role keys in frontend
- [ ] All tables have RLS enabled
- [ ] RLS policies tested and working
- [ ] Network requests cannot be replayed without auth
- [ ] Rate limiting enabled on API endpoints
- [ ] Input validation working
- [ ] Production build passes security audit
- [ ] Chrome DevTools inspection passes
- [ ] No sensitive data exposed in network responses

---

## If Issues Are Found

1. **CRITICAL Issues:** Fix immediately before deployment
   - Hardcoded secrets
   - Missing RLS on user data tables
   - Service role keys in frontend

2. **HIGH Priority:** Fix before production launch
   - Weak JWT secrets
   - Missing rate limiting
   - Overly permissive RLS policies

3. **MEDIUM Priority:** Fix in next release
   - Console logs exposing non-sensitive data
   - Missing input validation on non-critical endpoints

---

## Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Vite Production Build Guide](https://vitejs.dev/guide/build.html)

---

**Last Updated:** 2025-01-XX
**Next Review:** Before each production deployment

