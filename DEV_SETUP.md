# Local Development Setup

## Quick Start

1. **Install all dependencies:**
   ```bash
   npm run setup
   ```

2. **Run both frontend and backend:**
   ```bash
   npm run dev:full
   ```

3. **Or run separately:**
   ```bash
   # Frontend only (Vite dev server on port 5173)
   npm run dev
   
   # Backend only (Express server on port 3001)
   npm run backend:dev
   ```

## Environment Variables

Create a `.env.local` file in the root directory with:

```env
# ============================================
# Frontend Environment Variables (VITE_ prefix)
# ============================================

# Supabase Configuration (Client-side)
VITE_SUPABASE_URL=[YOUR_SUPABASE_URL]
VITE_SUPABASE_ANON_KEY=[YOUR_SUPABASE_ANON_KEY]

# Backend URL
VITE_BACKEND_URL=http://localhost:3001

# Mapbox API (Required for maps)
VITE_MAPBOX_TOKEN=[YOUR_MAPBOX_TOKEN]

# Development flags
VITE_NODE_ENV=development

# ============================================
# Backend Environment Variables
# ============================================

# Supabase Configuration (Backend)
SUPABASE_URL=[YOUR_SUPABASE_URL]
SUPABASE_ANON_KEY=[YOUR_SUPABASE_ANON_KEY]
SUPABASE_SERVICE_ROLE_KEY=[YOUR_SERVICE_ROLE_KEY]  # Optional, for admin operations

# External API Keys (Required in production)
JAMBASE_API_KEY=[YOUR_JAMBASE_API_KEY]
SETLIST_FM_API_KEY=[YOUR_SETLIST_FM_API_KEY]  # Optional, for setlist features

# Rate Limiting (Optional - uses in-memory fallback if not set)
UPSTASH_REDIS_REST_URL=[YOUR_UPSTASH_REDIS_URL]  # Optional, for distributed rate limiting
UPSTASH_REDIS_REST_TOKEN=[YOUR_UPSTASH_REDIS_TOKEN]  # Optional

# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:8080

# ============================================
# Authentication Configuration
# ============================================
# Authentication Mode: 'dev' (mock users for testing) or 'apple' (Apple Sign In)
AUTH_MODE=dev

# Session Token Configuration
JWT_SECRET=[YOUR_JWT_SECRET]  # Generate a secure random string for production
JWT_EXPIRES_IN=7d  # Token expiration (default: 7 days)

# Apple Sign In Configuration (for future token verification)
APPLE_TEAM_ID=[YOUR_APPLE_TEAM_ID]
APPLE_KEY_ID=[YOUR_APPLE_KEY_ID]
APPLE_BUNDLE_ID=[YOUR_APPLE_BUNDLE_ID]
APPLE_PRIVATE_KEY_PATH=backend/secure/AuthKey_[YOUR_APPLE_KEY_ID].p8  # For local development only

# ============================================
# Apple Push Notifications (APNs)
# ============================================
# APNs Auth Key Configuration (Recommended)
APNS_KEY_PATH=/Users/sloiterstein/.secrets/AuthKey_J764D4P5DU.p8
APNS_KEY_ID=J764D4P5DU
APNS_TEAM_ID=R6JXB945ND

# ============================================
# API Key Rotation (Optional)
# ============================================
# Uncomment during key rotation:
# JAMBASE_API_KEY_OLD=[OLD_KEY]
# JAMBASE_ROTATION_DATE=2024-12-31
# SETLIST_FM_API_KEY_OLD=[OLD_KEY]
# SETLIST_FM_ROTATION_DATE=2024-12-31
```

**Note:** Replace `[YOUR_*]` placeholders with your actual API keys. Get these from:
- Supabase: Your project settings at https://supabase.com
- JamBase: https://www.jambase.com/api
- Setlist.fm: https://www.setlist.fm/settings/api
- Upstash: https://console.upstash.com/ (for distributed rate limiting)

## 🔒 Security Warnings - CRITICAL

### ✅ Safe to Expose (Client-Side / VITE_* Variables)

These variables are **designed** to be public and can be safely exposed in frontend code:

- ✅ `VITE_SUPABASE_URL` - Supabase project URL (public)
- ✅ `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key (public by design)
- ✅ `VITE_MAPBOX_TOKEN` - Mapbox public token (designed for client-side use)
- ✅ `VITE_BACKEND_URL` - Backend API URL (public endpoint)

**Why these are safe:**
- Supabase anon key is designed to be public - security comes from RLS policies
- Mapbox tokens are meant for client-side use
- Backend URLs are public endpoints

### ❌ NEVER Expose (Backend-Only / Server-Side Secrets)

These variables **MUST NEVER** be exposed to the frontend or committed to git:

- ❌ `SUPABASE_SERVICE_ROLE_KEY` - **CRITICAL:** Full database access, bypasses RLS
- ❌ `JWT_SECRET` - **CRITICAL:** Used to sign authentication tokens
- ❌ `JAMBASE_API_KEY` - **HIGH:** External API key with usage limits
- ❌ `SETLIST_FM_API_KEY` - **HIGH:** External API key with usage limits
- ❌ `UPSTASH_REDIS_REST_TOKEN` - **HIGH:** Redis access token
- ❌ `APPLE_PRIVATE_KEY_PATH` / Apple Sign In keys - **CRITICAL:** Apple authentication
- ❌ `APNS_KEY_PATH` / APNs keys - **CRITICAL:** Push notification authentication

**Why these are dangerous:**
- Service role key = Full database access, can bypass all RLS policies
- JWT secret = Can forge authentication tokens
- API keys = Can abuse external services, incur costs
- Private keys = Can impersonate your app/service

### 🚨 Security Rules

1. **Never use `VITE_` prefix for secrets:**
   ```env
   # ❌ WRONG - Exposes secret to frontend
   VITE_SUPABASE_SERVICE_ROLE_KEY=xxx
   
   # ✅ CORRECT - Backend only
   SUPABASE_SERVICE_ROLE_KEY=xxx
   ```

2. **Never hardcode secrets in code:**
   ```javascript
   // ❌ WRONG - Hardcoded secret
   const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
   
   // ✅ CORRECT - Environment variable
   const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
   ```

3. **Never commit `.env` files:**
   - `.env.local` should be in `.gitignore`
   - Use platform secrets (Vercel, Railway, etc.) for production

4. **Verify before deployment:**
   ```bash
   # Run security audit
   node scripts/security-audit.js
   
   # Check for exposed secrets in build
   npm run build:verify
   ```

### 📋 Environment Variable Checklist

Before deploying, verify:

- [ ] No `VITE_SUPABASE_SERVICE_ROLE_KEY` exists
- [ ] No `VITE_JWT_SECRET` exists
- [ ] No hardcoded secrets in `src/` or `public/` folders
- [ ] All secrets are in `.env.local` (not committed)
- [ ] Production secrets are in platform environment variables (Vercel, etc.)
- [ ] Security audit passes: `node scripts/security-audit.js`

See [docs/SECURITY_AUDIT_CHECKLIST.md](docs/SECURITY_AUDIT_CHECKLIST.md) for complete security testing procedures.

**Authentication Modes:**
- `AUTH_MODE=dev`: Returns mock users for testing (no Apple credentials required)
- `AUTH_MODE=apple`: Placeholder for Apple token verification (currently returns mock user, verification not yet implemented)

See [SECURITY.md](SECURITY.md) for detailed security policies and rate limiting information.

## Fixed Chrome Issues

✅ **404 Error on `/events` endpoint**: Fixed table name from `events` to `jambase_events`
✅ **Invalid time value errors**: Added error handling for date formatting
✅ **Multiple GoTrueClient instances**: Consolidated to single Supabase client
✅ **Field name mismatches**: Updated queries to use correct database field names

## Local URLs

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3001
- **Backend Health Check**: http://localhost:3001/health

## API Endpoints

- `GET /api/concerts/search` - Search concerts
- `GET /api/concerts/:id` - Get concert by ID
- `GET /api/concerts/recent` - Get recent concerts
- `GET /api/concerts/stats` - Get concert statistics
- `GET /health` - Backend health check

## Development Workflow

1. Make changes to your code
2. Both frontend and backend will auto-reload
3. Test in Chrome at http://localhost:5173
4. Check backend API at http://localhost:3001
5. No need to commit every change - work locally!

## Troubleshooting

- If ports are in use, kill processes: `lsof -ti:5173,3001 | xargs kill`
- If dependencies are missing: `npm run setup`
- Check backend logs in terminal for API issues
- Use Chrome DevTools Network tab to debug API calls
