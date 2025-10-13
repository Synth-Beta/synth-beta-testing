# Email System - Quick Start Guide

## 🎯 What Was Built

### ✅ Completed
1. **6 Email Templates** (Synth-branded, spam-optimized)
   - Account confirmation
   - Magic link login
   - Password reset
   - Email change confirmation
   - Reauthentication code
   - User invites

2. **Database Schema** for email preferences

3. **Full UI** in Settings → Email Preferences

4. **Service Layer** for managing preferences

---

## 🚀 3-Step Setup (You Need To Do This)

### STEP 1: Run Database Migration

**Option A - Supabase CLI** (Recommended):
```bash
cd /Users/sloiterstein/Desktop/Synth/synth-beta-testing-main
supabase db push
```

**Option B - Manual** (If CLI doesn't work):
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of: `supabase/migrations/20250110000000_create_email_preferences.sql`
3. Paste and run

This creates the `email_preferences` table.

---

### STEP 2: Upload Email Templates to Supabase

Go to: **Supabase Dashboard → Authentication → Email Templates**

Upload each template (copy HTML and paste):

1. **Confirm signup** ← `email-templates/confirmation-email.html`
2. **Invite user** ← `email-templates/invite-user-email.html`
3. **Magic Link** ← `email-templates/magic-link-email.html`
4. **Change Email** ← `email-templates/change-email-confirmation.html`
5. **Reset Password** ← `email-templates/reset-password-email.html`

**Important**: Make sure variables like `{{ .ConfirmationURL }}` are present!

---

### STEP 3: Test It

1. Start app: `npm run dev`
2. Sign in
3. Go to Settings → Email Preferences
4. Toggle some preferences
5. Click "Save Preferences"
6. Test an actual email (sign up, password reset, etc.)

---

## 📋 Email Type Reference

### Auth Emails (Cannot Disable)
These are managed by Supabase and always enabled for security:

| Type | When Sent | Template Variable |
|------|-----------|-------------------|
| Confirmation | New signup | `{{ .ConfirmationURL }}` |
| Magic Link | Passwordless login | `{{ .ConfirmationURL }}` |
| Password Reset | Forgot password | `{{ .ConfirmationURL }}` |
| Email Change | Update email | `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .ConfirmationURL }}` |
| Reauthentication | Security check | `{{ .Token }}` |
| Invite | Admin invite | `{{ .ConfirmationURL }}` |

### Notification Emails (Can Disable)
These are custom and need to be implemented later:

| Type | Purpose | Status |
|------|---------|--------|
| Event Reminders | Before interested events | 🔜 To implement |
| Match Notifications | When you match | 🔜 To implement |
| Review Notifications | Event reviews | 🔜 To implement |
| Weekly Digest | Weekly summary | 🔜 To implement |

---

## 🏗️ What Got Created

### Files Created:
```
email-templates/
  ├── confirmation-email.html          ✅ Done
  ├── invite-user-email.html           ✅ Done
  ├── magic-link-email.html            ✅ Done
  ├── change-email-confirmation.html   ✅ Done (spam-optimized)
  ├── reset-password-email.html        ✅ Done
  └── reauthentication-email.html      ✅ Done

supabase/migrations/
  └── 20250110000000_create_email_preferences.sql  ✅ Done

src/types/
  └── emailPreferences.ts              ✅ Done

src/services/
  └── emailPreferencesService.ts       ✅ Done

src/components/
  ├── EmailPreferencesSettings.tsx     ✅ Done
  └── SettingsModal.tsx                ✅ Updated

docs/
  ├── EMAIL_PREFERENCES_IMPLEMENTATION.md  ✅ Full spec
  ├── EMAIL_IMPLEMENTATION_SUMMARY.md      ✅ Detailed guide
  └── EMAIL_QUICK_START.md                 ✅ This file
```

### Features:
- ✅ Beautiful Synth-branded templates
- ✅ Spam-filter optimized
- ✅ Mobile responsive
- ✅ Settings UI with toggles
- ✅ Database with RLS
- ✅ Auto-creates preferences for new users
- ✅ Service layer for preference checks

---

## 🎨 Email Design

All templates feature:
- **Pink gradient header** (#FF3399 → #FF66B3)
- **Synth logo** (black square with white "S")
- **Beige accents** (#F5F5DC)
- **Inter font**
- **Mobile responsive**
- **Spam-safe** (no data URIs, no dead links)

---

## 🔮 Future: Custom Emails

When you want to send custom notification emails:

```typescript
import { isEmailTypeEnabled } from '@/services/emailPreferencesService';

// Before sending any notification email, check:
const canSend = await isEmailTypeEnabled(userId, 'event_reminders');

if (canSend) {
  // Send the email
}
```

This respects user preferences automatically!

---

## ❓ Need Help?

- **Full details**: Read `EMAIL_IMPLEMENTATION_SUMMARY.md`
- **Technical spec**: Read `EMAIL_PREFERENCES_IMPLEMENTATION.md`
- **Troubleshooting**: See summary doc's troubleshooting section

---

## ✅ Done!

After completing Steps 1-3, your email system is live! 🎉

Users can now:
- ✉️ Receive beautiful Synth-branded emails
- ⚙️ Control their email preferences
- 🔔 Choose which notifications to receive
- ⏰ Set reminder timing preferences


