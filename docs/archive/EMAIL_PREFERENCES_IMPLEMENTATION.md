# Email Preferences Implementation Plan

## Overview
This document outlines the implementation of email preferences for Synth, allowing users to control which transactional and notification emails they receive.

---

## Email Types & Functions

### 1. **Confirmation Email** (Supabase: `confirmation`)
- **Purpose**: Verify email address when creating a new account
- **When Sent**: User signs up for the first time
- **Can Disable**: ❌ No - Required for security/account verification
- **Template**: `confirmation-email.html`
- **Supabase Variable**: `{{ .ConfirmationURL }}`

### 2. **Magic Link Email** (Supabase: `magic_link`)
- **Purpose**: Passwordless authentication
- **When Sent**: User requests to sign in via magic link
- **Can Disable**: ❌ No - User explicitly requests this
- **Template**: `magic-link-email.html`
- **Supabase Variable**: `{{ .ConfirmationURL }}`

### 3. **Reset Password Email** (Supabase: `recovery`)
- **Purpose**: Allow users to reset forgotten password
- **When Sent**: User clicks "Forgot Password"
- **Can Disable**: ❌ No - Security-critical for account recovery
- **Template**: `reset-password-email.html`
- **Supabase Variable**: `{{ .ConfirmationURL }}`

### 4. **Change Email Confirmation** (Supabase: `email_change`)
- **Purpose**: Verify new email address when updating account email
- **When Sent**: User changes their email address in settings
- **Can Disable**: ❌ No - Required for security verification
- **Template**: `change-email-confirmation.html`
- **Supabase Variables**: `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .ConfirmationURL }}`

### 5. **Reauthentication Code** (Supabase: `reauthentication`)
- **Purpose**: Provide verification code for sensitive operations
- **When Sent**: User performs sensitive action requiring re-verification
- **Can Disable**: ❌ No - Security-critical
- **Template**: `reauthentication-email.html`
- **Supabase Variable**: `{{ .Token }}`

### 6. **Invite User Email** (Supabase: `invite`)
- **Purpose**: Invite new users to join Synth
- **When Sent**: Admin or user sends invitation to someone
- **Can Disable**: ❌ No - User explicitly requests invite to be sent
- **Template**: `invite-user-email.html`
- **Supabase Variable**: `{{ .ConfirmationURL }}`

### 7. **Event Notifications** (Custom)
- **Purpose**: Notify users about upcoming events they're interested in
- **When Sent**: X days before an event the user marked as interested
- **Can Disable**: ✅ Yes - Optional marketing/notification
- **Implementation**: Custom trigger/cron job
- **Template**: To be created

### 8. **Match Notifications** (Custom)
- **Purpose**: Notify users when they match with someone at an event
- **When Sent**: When two users both swipe right on each other
- **Can Disable**: ✅ Yes - Optional notification
- **Implementation**: Custom trigger on user_swipes table
- **Template**: To be created

### 9. **New Review Notifications** (Custom)
- **Purpose**: Notify users when someone reviews an event they're interested in
- **When Sent**: When a review is posted for an event
- **Can Disable**: ✅ Yes - Optional notification
- **Implementation**: Custom trigger on reviews table
- **Template**: To be created

### 10. **Weekly Digest** (Custom)
- **Purpose**: Send weekly summary of events, matches, and activity
- **When Sent**: Weekly on user's preferred day
- **Can Disable**: ✅ Yes - Optional marketing email
- **Implementation**: Cron job/scheduled function
- **Template**: To be created

---

## Database Schema

### New Table: `email_preferences`

```sql
CREATE TABLE email_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    
    -- Supabase Auth Emails (cannot be disabled, for informational purposes only)
    enable_auth_emails BOOLEAN DEFAULT true NOT NULL, -- Always true, display-only
    
    -- Custom Notification Emails (can be disabled)
    enable_event_reminders BOOLEAN DEFAULT true NOT NULL,
    enable_match_notifications BOOLEAN DEFAULT true NOT NULL,
    enable_review_notifications BOOLEAN DEFAULT true NOT NULL,
    enable_weekly_digest BOOLEAN DEFAULT true NOT NULL,
    
    -- Digest preferences
    weekly_digest_day TEXT DEFAULT 'monday' CHECK (weekly_digest_day IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
    event_reminder_days INTEGER DEFAULT 3 CHECK (event_reminder_days >= 0 AND event_reminder_days <= 30),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on user_id for fast lookups
CREATE INDEX email_preferences_user_id_idx ON email_preferences(user_id);

-- Enable RLS
ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own email preferences"
    ON email_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own email preferences"
    ON email_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own email preferences"
    ON email_preferences FOR UPDATE
    USING (auth.uid() = user_id);

-- Function to auto-create preferences for new users
CREATE OR REPLACE FUNCTION create_email_preferences_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO email_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create preferences when user signs up
CREATE TRIGGER on_auth_user_created_create_email_prefs
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_email_preferences_for_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_email_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_email_preferences_timestamp
    BEFORE UPDATE ON email_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_email_preferences_updated_at();

COMMENT ON TABLE email_preferences IS 'Stores user email notification preferences';
COMMENT ON COLUMN email_preferences.enable_auth_emails IS 'Display-only: Auth emails (signup, password reset, etc.) cannot be disabled for security';
COMMENT ON COLUMN email_preferences.enable_event_reminders IS 'Send reminders X days before events user is interested in';
COMMENT ON COLUMN email_preferences.enable_match_notifications IS 'Notify when user matches with someone at an event';
COMMENT ON COLUMN email_preferences.enable_review_notifications IS 'Notify when someone reviews an event user is interested in';
COMMENT ON COLUMN email_preferences.enable_weekly_digest IS 'Send weekly summary of activity and recommendations';
```

---

## Implementation Components

### 1. **Database Migration** 
File: `supabase/migrations/YYYYMMDDHHMMSS_create_email_preferences.sql`
- Creates `email_preferences` table
- Sets up RLS policies
- Creates triggers for auto-creation

### 2. **TypeScript Types**
File: `src/types/emailPreferences.ts`
```typescript
export interface EmailPreferences {
  id: string;
  user_id: string;
  enable_auth_emails: boolean; // Display-only
  enable_event_reminders: boolean;
  enable_match_notifications: boolean;
  enable_review_notifications: boolean;
  enable_weekly_digest: boolean;
  weekly_digest_day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  event_reminder_days: number;
  created_at: string;
  updated_at: string;
}
```

### 3. **Email Preferences Service**
File: `src/services/emailPreferencesService.ts`
- `getEmailPreferences(userId)` - Fetch user preferences
- `updateEmailPreferences(userId, preferences)` - Update preferences
- `checkIfEmailEnabled(userId, emailType)` - Check before sending

### 4. **UI Component**
File: `src/components/EmailPreferencesSettings.tsx`
- Beautiful, organized settings panel
- Grouped by email type (Auth vs Notifications)
- Toggle switches for each preference
- Info tooltips explaining each email type
- Visual indicators for "required" emails
- Save button with loading state

### 5. **Integration**
- Add to `SettingsModal.tsx` as new section
- Update Supabase types to include new table
- Add helper functions to check preferences before sending emails

---

## UI/UX Design

### Settings Layout:

```
┌─────────────────────────────────────────┐
│ Email Preferences                       │
├─────────────────────────────────────────┤
│                                         │
│ Account & Security Emails              │
│ These emails are required for security │
│ ┌─────────────────────────────────────┐│
│ │ ✓ Account Confirmation     [ON]     ││
│ │ ✓ Password Reset           [ON]     ││
│ │ ✓ Email Changes            [ON]     ││
│ │ ✓ Magic Link Sign In       [ON]     ││
│ │ ✓ Security Verification    [ON]     ││
│ └─────────────────────────────────────┘│
│                                         │
│ Notification Emails                     │
│ You can customize these preferences     │
│ ┌─────────────────────────────────────┐│
│ │ Event Reminders           [Toggle]  ││
│ │   Notify me [3] days before event   ││
│ │                                     ││
│ │ Match Notifications       [Toggle]  ││
│ │   When I match with someone         ││
│ │                                     ││
│ │ Review Notifications      [Toggle]  ││
│ │   When events get reviewed          ││
│ │                                     ││
│ │ Weekly Digest             [Toggle]  ││
│ │   Send on [Monday ▼]                ││
│ └─────────────────────────────────────┘│
│                                         │
│           [Save Preferences]            │
└─────────────────────────────────────────┘
```

---

## Supabase Email Template Configuration

### How to Upload Templates to Supabase:

1. Go to Supabase Dashboard → Authentication → Email Templates
2. For each template type:
   - **Confirm signup**: Use `confirmation-email.html`
   - **Invite user**: Use `invite-user-email.html`
   - **Magic Link**: Use `magic-link-email.html`
   - **Change Email Address**: Use `change-email-confirmation.html`
   - **Reset Password**: Use `reset-password-email.html`

3. Copy the HTML content from each file
4. Paste into the Supabase template editor
5. Verify variables are correct ({{ .ConfirmationURL }}, {{ .Token }}, etc.)
6. Save each template

---

## Future Email Templates to Create

### 1. **Event Reminder Email**
- Sent X days before event
- Shows event details, venue, time
- Quick link to review/cancel interest

### 2. **Match Notification Email**
- Sent when mutual match occurs
- Shows matched user profile
- Link to start chatting

### 3. **New Review Email**
- Sent when event gets reviewed
- Shows review snippet
- Link to read full review

### 4. **Weekly Digest Email**
- Upcoming events
- Recent matches
- Popular reviews
- Personalized recommendations

---

## Implementation Steps

1. ✅ Create all Supabase auth email templates
2. ⏭️ Run database migration to create `email_preferences` table
3. ⏭️ Create TypeScript types
4. ⏭️ Build email preferences service
5. ⏭️ Build UI component
6. ⏭️ Integrate into Settings modal
7. ⏭️ Test end-to-end
8. ⏭️ Upload templates to Supabase dashboard
9. ⏭️ Create custom email templates (event reminders, etc.)
10. ⏭️ Implement email sending logic with preference checks

---

## Testing Checklist

- [ ] User signs up → email preferences created automatically
- [ ] User can view email preferences
- [ ] User can toggle notification preferences
- [ ] Auth emails are marked as "required" (cannot disable)
- [ ] Changes are saved to database
- [ ] Email sending respects user preferences
- [ ] All Supabase templates render correctly
- [ ] Mobile responsive design
- [ ] Accessibility (keyboard navigation, screen readers)

---

## Notes

- **Security emails cannot be disabled** - This is intentional for account security
- **Supabase handles auth emails** - We just provide templates
- **Custom emails need backend implementation** - Event reminders, matches, etc.
- **Consider rate limiting** - Prevent email spam
- **GDPR compliance** - Users can opt out of marketing emails
- **Unsubscribe links** - Add to all non-auth emails


