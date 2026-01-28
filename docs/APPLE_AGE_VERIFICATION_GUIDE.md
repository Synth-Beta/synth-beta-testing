# Apple Age Verification & Parental Controls - Implementation Guide

## Overview

This document explains how age verification and parental controls work in the app, and how to demonstrate them to Apple reviewers.

## How Age Verification Works

### 1. **Mandatory Birthday Collection During Signup**

**Location:** Onboarding Flow → Profile Setup Step

**How it works:**
- Users **must** provide their birthday during onboarding (cannot skip)
- Age is validated client-side: users under 13 are blocked from proceeding
- Error message: "You must be at least 13 years old"
- Birthday is stored in the database as a DATE field

**Code Location:** `src/components/onboarding/ProfileSetupStep.tsx` (lines 283-299)

**Database:** `users.birthday` column (DATE type)

### 2. **Automatic Age Verification**

**How it works:**
- When a user provides their birthday, the system automatically:
  1. Calculates their age from the birthday
  2. Sets `age_verified = TRUE` in the database
  3. Sets `is_minor = TRUE` if age < 18
  4. Auto-enables `parental_controls_enabled = TRUE` for users under 18
  5. Auto-enables `dm_restricted = TRUE` for users under 18

**Code Location:** `src/services/onboardingService.ts` (lines 76-98)

**Database Functions:**
- `calculate_user_age(user_uuid)` - Calculates age from birthday
- `is_user_minor(user_uuid)` - Returns TRUE if user is under 18

**Database Migration:** `supabase/migrations/20260128152456_add_age_verification_parental_controls.sql`

### 3. **Age Verification Display**

**Location:** Settings → Parental Controls → Age Verification Card

**What it shows:**
- "Age Verified" status badge (green checkmark if verified)
- Current age (calculated from birthday)
- Birthday (read-only, cannot be changed without verification)

**Code Location:** `src/components/AgeVerificationCard.tsx`

## How Parental Controls Work

### 1. **Automatic Activation for Minors**

**How it works:**
- Users under 18 automatically have parental controls enabled
- Controls cannot be disabled by the minor user
- Settings are visible and functional

**Database:** `users.parental_controls_enabled` (automatically TRUE for users < 18)

### 2. **Available Controls**

**Location:** Settings → Parental Controls

**Controls Available:**

1. **Restrict Direct Messages**
   - Toggle: "Restrict Direct Messages"
   - When enabled: Only allows DMs from mutual followers
   - Database: `users.dm_restricted` (BOOLEAN)
   - Auto-enabled for minors

2. **Private Account**
   - Toggle: "Private Account"
   - When enabled: Requires approval for new followers
   - Database: `users.is_public_profile` (BOOLEAN, inverted)
   - Can be enabled by any user

3. **Content Filtering**
   - Automatically filters explicit/age-restricted events for minors
   - Filters events with "18+", "21+", "explicit" tags
   - Filters events with age restrictions > user's age
   - Code: `src/utils/contentFilter.ts`

**Code Location:** `src/components/ParentalControlsSettings.tsx`

### 3. **Content Filtering Implementation**

**How it works:**
- When fetching events, the system checks the user's age
- If user is under 18, events are filtered to remove:
  - Events with explicit tags ("18+", "21+", "adult", "explicit")
  - Events with age restrictions >= 18
  - Events with mature content indicators

**Code Location:** 
- Filter utility: `src/utils/contentFilter.ts`
- Applied in: `src/services/personalizedFeedService.ts` (line 448-449)

## How to Prove This to Apple Reviewers

### Step 1: Provide Screenshots

Take screenshots showing:

1. **Onboarding Flow:**
   - Screenshot of Profile Setup step showing birthday field (required)
   - Screenshot showing error when trying to enter age < 13
   - Screenshot showing successful completion with birthday entered

2. **Settings → Parental Controls:**
   - Screenshot showing "Parental Controls" menu item
   - Screenshot showing Age Verification Card with "Age Verified" badge
   - Screenshot showing age display
   - Screenshot showing parental controls toggles (for minor account)

3. **For Minor Account (13-17 years old):**
   - Screenshot showing parental controls automatically enabled
   - Screenshot showing DM restrictions toggle
   - Screenshot showing private account toggle

### Step 2: Provide Test Account Credentials

Create a test account for Apple reviewers:

**Option A: Minor Account (13-17)**
```
Email: apple-review-minor@synth.app
Password: [create secure password]
Birthday: [set to make user 15-16 years old]
```

**What reviewers will see:**
- Age Verification shows "Verified" status
- Age shows as 15-16 years old
- Parental Controls section shows controls enabled
- DM restrictions are ON by default
- Content filtering is active (no explicit events shown)

**Option B: Adult Account (18+)**
```
Email: apple-review-adult@synth.app
Password: [create secure password]
Birthday: [set to make user 25+ years old]
```

**What reviewers will see:**
- Age Verification shows "Verified" status
- Age shows as 25+ years old
- Parental Controls can be manually enabled
- All content visible (no filtering)

### Step 3: Provide Database Evidence

Run these SQL queries in Supabase SQL Editor and share results:

```sql
-- Show age verification columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('age_verified', 'is_minor', 'parental_controls_enabled', 'dm_restricted');

-- Show age calculation functions exist
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('calculate_user_age', 'is_user_minor');

-- Show example users with age verification
SELECT 
  user_id,
  birthday,
  age_verified,
  is_minor,
  parental_controls_enabled,
  dm_restricted,
  EXTRACT(YEAR FROM AGE(CURRENT_DATE, birthday)) as calculated_age
FROM users
WHERE birthday IS NOT NULL
LIMIT 5;
```

### Step 4: Provide Code Evidence

Point Apple reviewers to these key files:

1. **Age Verification:**
   - `src/components/onboarding/ProfileSetupStep.tsx` - Birthday collection & validation
   - `src/services/onboardingService.ts` - Age calculation & flag setting
   - `src/components/AgeVerificationCard.tsx` - Age verification display

2. **Parental Controls:**
   - `src/components/ParentalControlsSettings.tsx` - Controls UI
   - `src/components/SettingsModal.tsx` - Settings menu integration
   - `src/utils/contentFilter.ts` - Content filtering logic

3. **Database:**
   - `supabase/migrations/20260128152456_add_age_verification_parental_controls.sql` - Schema

### Step 5: Write Response to Apple

**Template Response:**

```
Dear Apple Review Team,

Thank you for your feedback regarding age verification and parental controls.

Our app includes comprehensive age verification and parental control features:

AGE VERIFICATION:
1. Mandatory birthday collection during onboarding (cannot be skipped)
2. Age validation: Users under 13 cannot complete signup
3. Automatic age verification: When birthday is provided, age_verified flag is set to TRUE
4. Age display: Users can view their verified age in Settings → Parental Controls

HOW TO LOCATE:
- During signup: Complete onboarding flow, birthday field is required in Profile Setup step
- Age verification status: Settings → Parental Controls → Age Verification Card
- Age display: Shows current age calculated from birthday

PARENTAL CONTROLS:
1. Automatic activation: Enabled automatically for users under 18
2. Direct Message restrictions: Limits DMs to mutual followers only
3. Private Account: Requires approval for new followers
4. Content Filtering: Automatically filters explicit/age-restricted events for minors

HOW TO LOCATE:
- Settings → Parental Controls (menu item in Settings)
- Controls are visible and functional for accounts under 18
- Test account provided: [email] / [password] (minor account, age 15)

DATABASE EVIDENCE:
- age_verified column: Tracks if user has verified age
- is_minor column: Automatically calculated (TRUE if age < 18)
- parental_controls_enabled column: Auto-enabled for minors
- Database functions: calculate_user_age() and is_user_minor() for age calculations

Please let me know if you need any additional information or clarification.

Best regards,
[Your Name]
```

## Testing Checklist

Before submitting to Apple, verify:

- [ ] Birthday field is required during onboarding (cannot skip)
- [ ] Users under 13 are blocked with error message
- [ ] Age verification status shows in Settings → Parental Controls
- [ ] Age is correctly calculated and displayed
- [ ] Parental controls automatically enable for users under 18
- [ ] DM restrictions toggle works for minor accounts
- [ ] Private account toggle works
- [ ] Content filtering removes explicit events for minors
- [ ] Settings → Parental Controls menu item is visible
- [ ] Age Verification Card displays correctly

## Key Points for Apple Review

1. **Age Verification is Mandatory:** Users cannot skip birthday entry
2. **Age is Verified:** System calculates and stores age verification status
3. **Parental Controls are Automatic:** Enabled automatically for users under 18
4. **Controls are Functional:** DM restrictions and content filtering actually work
5. **Easily Discoverable:** Found in Settings → Parental Controls menu
6. **Database-Backed:** All data stored in database with proper schema

## Database Schema

```sql
-- Age verification columns
age_verified BOOLEAN DEFAULT FALSE  -- Set to TRUE when birthday provided
is_minor BOOLEAN                    -- Calculated: TRUE if age < 18
parental_controls_enabled BOOLEAN  -- Auto-enabled for minors
dm_restricted BOOLEAN               -- Restricts DMs to mutual followers

-- Age calculation functions
calculate_user_age(user_uuid)       -- Returns age in years
is_user_minor(user_uuid)            -- Returns TRUE if age < 18
```

## Summary

✅ **Age Verification:** Mandatory birthday collection → Automatic verification → Status display  
✅ **Parental Controls:** Auto-enabled for minors → Functional controls → Content filtering  
✅ **Apple Compliance:** Meets requirements for In-App Controls and Age Assurance
