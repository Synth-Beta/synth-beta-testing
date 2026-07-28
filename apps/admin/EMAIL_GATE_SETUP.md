# Email Gate Setup

This document explains the email gate system that requires users to enter their email before accessing the site.

## Overview

The email gate system captures user emails before they can access the Synth platform. It uses IP address tracking to ensure users are only prompted once, even if they return later.

## Database Setup

### Apply Migration

Run the following command to apply the migration:

```bash
# If using Supabase CLI locally
supabase db push

# Or apply directly in Supabase Dashboard
# Navigate to SQL Editor and run the migration file:
# supabase/migrations/20250202000000_create_email_gate_table.sql
```

### Database Schema

The migration creates the following table:

**`email_gate_entries`**
- `id` (UUID, Primary Key): Unique identifier
- `email` (TEXT, NOT NULL): User's email address
- `ip_address` (TEXT, NOT NULL, UNIQUE): User's IP address
- `user_agent` (TEXT): Browser user agent string
- `created_at` (TIMESTAMPTZ): When the entry was created
- `updated_at` (TIMESTAMPTZ): When the entry was last updated

### Features

1. **IP-based tracking**: Once an IP submits an email, they won't be prompted again
2. **Anonymous access**: Uses Supabase RLS policies to allow unauthenticated users to insert and check their IP
3. **Duplicate prevention**: Unique constraint on IP address
4. **Automatic timestamps**: Triggers update `updated_at` automatically
5. **Indexed queries**: Fast lookups by IP address and email

## Implementation

### Files Created

1. **Migration**: `supabase/migrations/20250202000000_create_email_gate_table.sql`
   - Creates the database table and RLS policies

2. **Service**: `src/services/emailGateService.ts`
   - Handles all database interactions
   - Fetches user IP address from external service
   - Checks if IP exists in database
   - Submits email entries

3. **Component**: `src/components/EmailGate.tsx`
   - Modal dialog that prompts for email
   - Cannot be dismissed until email is submitted
   - Beautiful Synth-branded design
   - Form validation

4. **Integration**: `src/App.tsx`
   - Shows EmailGate before any other content
   - Uses state to track completion

### How It Works

1. User visits the site
2. App loads and EmailGate component checks user's IP
3. If IP is not in database:
   - Show email gate modal
   - User must enter valid email
   - Email + IP saved to database
   - User proceeds to app
4. If IP is in database:
   - Skip email gate
   - User proceeds directly to app

### IP Address Detection

The system uses two fallback services for IP detection:
1. Primary: `https://api.ipify.org?format=json`
2. Fallback: `https://api.ip.sb/ip`

If both fail, it uses "unknown" as IP (graceful degradation).

## Analytics & Querying

### View All Entries (requires authentication)

```sql
SELECT * FROM email_gate_entries ORDER BY created_at DESC;
```

### Count Total Entries

```sql
SELECT COUNT(*) FROM email_gate_entries;
```

### Count by Email Domain

```sql
SELECT 
  SUBSTRING(email FROM '@(.*)$') as domain,
  COUNT(*) as count
FROM email_gate_entries
GROUP BY domain
ORDER BY count DESC;
```

### Recent Entries (Last 7 Days)

```sql
SELECT * FROM email_gate_entries
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

## Testing

### Test Locally

1. Clear browser data or use incognito mode
2. Visit the site
3. You should see the email gate modal
4. Enter an email and submit
5. Refresh the page - you should not see the modal again
6. Clear browser data and try again with different IP (or use VPN)

### Test Production

Same steps as local, but on your production domain.

## Security Considerations

1. **No PII in logs**: Email addresses are sensitive data - ensure they're not logged
2. **GDPR Compliance**: Users should be informed about data collection
3. **Email validation**: Basic regex validation is implemented
4. **Rate limiting**: Consider adding rate limiting to prevent abuse
5. **Data retention**: Consider adding a policy for how long to keep email data

## Privacy Policy

Update your privacy policy to include:
- Collection of email addresses and IP addresses
- Purpose: To manage access and communication
- Data retention period
- User rights (access, deletion, etc.)

## Disabling the Email Gate

To temporarily disable the email gate:

1. Comment out the EmailGate check in `src/App.tsx`:
```typescript
const [emailGateComplete, setEmailGateComplete] = useState(true); // Set to true
```

2. Or add an environment variable:
```typescript
const ENABLE_EMAIL_GATE = import.meta.env.VITE_ENABLE_EMAIL_GATE !== 'false';
```

## Future Enhancements

- **Email verification**: Send confirmation emails
- **Welcome emails**: Automated welcome sequence
- **Admin dashboard**: View and manage email entries
- **Export functionality**: Export email list for marketing
- **Unsubscribe mechanism**: Allow users to opt out
- **Geographic analytics**: Analyze user locations by IP

