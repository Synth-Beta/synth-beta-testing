# Security Policies and Best Practices

This document outlines the security measures implemented in the application following OWASP best practices.

## Rate Limiting

All public API endpoints are protected by rate limiting with IP + user-based tracking.

### Rate Limit Tiers

- **Strict** (10 requests/minute): Search endpoints, data modification endpoints
  - `/api/search-concerts`
  - `/api/user/streaming-profile` (POST, DELETE)
  - `/api/setlists/search`
  - `/api/location/search`

- **Moderate** (30 requests/minute): Read-only endpoints, profile views
  - `/api/concerts/search`
  - `/api/concerts/recent`
  - `/api/concerts/stats`
  - `/api/user/streaming-profile` (GET)

- **Lenient** (100 requests/minute): Health checks, static data
  - `/health`
  - `/api/concerts/health`
  - `/api/setlists/health`

### Rate Limit Responses

When rate limits are exceeded, the API returns:
- HTTP Status: `429 Too Many Requests`
- `Retry-After` header: Seconds until the limit resets
- Response body: `{ success: false, error: "Rate limit exceeded", retry_after: seconds }`

### Implementation

- Uses Upstash Redis for distributed rate limiting in serverless environments
- Falls back to in-memory rate limiting if Upstash is not configured
- Tracks by IP address and authenticated user ID (if available)
- Automatically cleans up old entries

## Input Validation and Sanitization

All user input is validated and sanitized before processing.

### Validation

- **Schema-based validation** using Joi
- **Type checking**: Enforces expected data types
- **Length limits**: Per-field maximum lengths based on database schema
- **Pattern validation**: UUIDs, emails, dates, state codes, zip codes
- **Rejects unexpected fields**: Prevents mass assignment vulnerabilities

### Sanitization

- **String trimming**: Removes leading/trailing whitespace
- **Null byte removal**: Prevents null byte injection
- **Control character removal**: Removes dangerous control characters
- **HTML entity encoding**: Optional encoding for XSS prevention (when displaying user content)

### Validation Errors

Invalid input returns:
- HTTP Status: `400 Bad Request`
- Response body: `{ success: false, error: "Validation error", details: [...] }`

## API Key Security

All API keys are managed securely with support for rotation.

### Environment Variables

**Required in Production:**
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key (safe to expose client-side)
- `JAMBASE_API_KEY` - JamBase API key

**Optional:**
- `SETLIST_FM_API_KEY` - Setlist.fm API key (required for setlist features)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (backend only)

**For Rate Limiting (Optional):**
- `UPSTASH_REDIS_REST_URL` - Upstash Redis REST URL
- `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis REST token

### Key Rotation

The application supports graceful API key rotation:

1. **Primary and Secondary Keys**: Set both `{SERVICE}_API_KEY` and `{SERVICE}_API_KEY_OLD`
2. **Automatic Fallback**: On 401/403 errors, automatically tries secondary key
3. **Rotation Date**: Set `{SERVICE}_ROTATION_DATE` to force secondary key usage after a date
4. **Monitoring**: Key usage is logged for security monitoring

### Key Storage

- **Never hard-coded** in source code
- **Environment variables only** - Use `.env.local` for local development
- **Production secrets** - Use secure secret management (Vercel Environment Variables, etc.)
- **Client-side keys** - Only `VITE_SUPABASE_ANON_KEY` is exposed client-side (by design, safe to expose)

## CORS Configuration

Cross-Origin Resource Sharing is configured with security in mind.

### Production
- **Strict origin checking**: Only allows configured origins
- **No wildcard**: Rejects requests without origin header
- **Configured origins**: Set via `FRONTEND_URL` environment variable

### Development
- **Permissive**: Allows localhost and development origins
- **No-origin allowed**: Supports mobile apps and Postman

### Allowed Origins
- Production frontend URL (`FRONTEND_URL`)
- Local development URLs (localhost:3000, localhost:5173, etc.)
- Capacitor/Ionic app origins
- Vercel deployment URL

## Request Size Limits

To prevent DoS attacks via large payloads:

- **JSON body**: Maximum 1MB
- **URL-encoded**: Maximum 1MB
- **Response**: Returns `413 Payload Too Large` if exceeded

## Error Handling

Error messages are sanitized to prevent information disclosure.

### Production
- **Generic errors**: "Internal server error" or "Something went wrong"
- **No stack traces**: Stack traces are logged server-side only
- **Detailed logging**: Full error details logged for debugging

### Development
- **Detailed errors**: Error messages and stack traces included
- **Helpful debugging**: Full error context in responses

## SQL Injection Prevention

All database queries use parameterized queries via Supabase client:

- **Supabase client**: Automatically parameterizes all queries
- **No raw SQL**: Direct SQL queries are avoided
- **RLS policies**: Row Level Security policies enforce data access rules

## Authentication and Authorization

- **Supabase Auth**: JWT-based authentication
- **RLS policies**: Database-level access control
- **User context**: `auth.uid()` extracted from JWT for user-based rate limiting
- **Service role**: Only used for backend operations, never exposed client-side

## Security Headers

Rate limit responses include standard headers:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: ISO timestamp when limit resets
- `Retry-After`: Seconds until retry is allowed (RFC 7231)

## Monitoring and Logging

Security events are logged for monitoring:

- **Rate limit violations**: Logged with IP/user identifier
- **Validation failures**: Logged with rejected fields
- **API key failures**: Logged with rotation attempts
- **Error occurrences**: Logged with full context (server-side only)

## Compliance

This implementation follows:
- **OWASP Top 10** security risks
- **RFC 7231** for HTTP rate limiting
- **OWASP Input Validation** guidelines
- **OWASP API Security** best practices

## Reporting Security Issues

If you discover a security vulnerability, please:
1. **Do not** create a public GitHub issue
2. Contact the development team directly
3. Provide detailed information about the vulnerability
4. Allow reasonable time for remediation before public disclosure

## Updates

This security documentation is updated as new security measures are implemented. Review this document regularly to stay current with security practices.

