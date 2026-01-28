# Gender and Birthday Profile Fields - Implementation Guide

## Overview
Added `gender` and `birthday` fields to user profiles for trust and safety purposes. These fields will be displayed to users interested in the same events to increase accountability and trust.

## Database Changes

### Table Modified
- **Table:** `public.profiles`
- **New Columns:** 
  - `gender` (TEXT, nullable)
  - `birthday` (DATE, nullable)

### Migration File
`supabase/migrations/20251010000000_add_gender_birthday_to_profiles.sql`

## SQL to Run in Supabase

Copy and run the migration file in your Supabase SQL Editor:
```sql
-- Located at: supabase/migrations/20251010000000_add_gender_birthday_to_profiles.sql
```

Or run directly in Supabase:
```bash
cd /Users/sloiterstein/Desktop/Synth/synth-beta-testing-main
supabase db push
```

## Field Specifications

### Gender Field
- **Type:** TEXT
- **Nullable:** Yes
- **Allowed Values:** 
  - `male`
  - `female`
  - `non-binary`
  - `prefer-not-to-say`
  - `other`
- **Constraint:** `valid_gender_values` check constraint
- **Indexed:** Yes (for efficient filtering)

### Birthday Field
- **Type:** DATE
- **Nullable:** Yes
- **Constraints:** 
  - **Must be at least 13 years old** (COPPA compliance)
  - Must be in the past
  - Must be within last 120 years (reasonable age range)
- **Constraint:** `valid_birthday_range` check constraint
- **Indexed:** Yes (for age calculations)

## Privacy & Display Rules

### What's Displayed
- **Gender:** Full gender value shown to users interested in same events
- **Age:** Calculated age (not exact birthday) shown for privacy
  - Example: "28 years old" instead of "January 15, 1996"

### Who Can See
- Users interested in the same events (for trust and safety)
- Friends (via existing friend visibility rules)
- Profile owner (always)

## Implementation Steps for Frontend

### 1. Update Profile Edit Form
Add input fields for gender and birthday in the profile edit component:

```tsx
// In ProfileEdit component or similar
<Select
  label="Gender (Optional)"
  value={profile?.gender || ''}
  onChange={(value) => updateField('gender', value)}
  options={[
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
    { value: 'non-binary', label: 'Non-binary' },
    { value: 'prefer-not-to-say', label: 'Prefer not to say' },
    { value: 'other', label: 'Other' }
  ]}
/>

<Input
  type="date"
  label="Birthday (Optional - Must be 13+)"
  value={profile?.birthday || ''}
  onChange={(value) => updateField('birthday', value)}
  max={(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 13);
    return date.toISOString().split('T')[0];
  })()} // User must be at least 13 years old
/>
```

### 2. Display Age in Profile View
Show calculated age instead of exact birthday:

```tsx
// Calculate age from birthday
import { calculateAge } from '@/utils/calculateAge';

// In profile display
const age = calculateAge(profile?.birthday);
{age && <span>{age} years old</span>}
{profile?.gender && <span>{profile.gender}</span>}
```

### 3. Update Profile Service Calls
The existing `SupabaseService.updateProfile()` will automatically support the new fields:

```tsx
import { SupabaseService } from '@/services/supabaseService';

// Update profile with new fields
await SupabaseService.updateProfile(userId, {
  gender: 'male',
  birthday: '1996-01-15'
});
```

### 4. Display in Event Interest Views
Show gender and age in components where users see others interested in events:

```tsx
// In EventInterestsModal or similar
<div className="user-trust-info">
  {user.gender && <Badge>{user.gender}</Badge>}
  {calculateAge(user.birthday) && (
    <Badge>{calculateAge(user.birthday)} years old</Badge>
  )}
</div>
```

## Updated TypeScript Types

The following files have been updated with the new fields:
- ✅ `src/integrations/supabase/types.ts` - Added to profiles Row, Insert, Update types
- ✅ `src/types/database.ts` - Added to Profile interface
- ✅ `src/components/profile/ProfileView.tsx` - Added to UserProfile interface

## Backward Compatibility

✅ **All existing functions continue to work:**
- Existing RLS policies unchanged
- `update_user_last_active()` function unaffected
- `SupabaseService.updateProfile()` supports new fields via TypeScript types
- All profile queries continue to work (new fields are nullable)

✅ **Safe to run:**
- Uses `IF NOT EXISTS` clauses
- Can be run multiple times without errors
- Existing user profiles unaffected (fields default to NULL)

## Testing Checklist

- [ ] Run migration in Supabase SQL Editor
- [ ] Verify columns added: `SELECT * FROM profiles LIMIT 1;`
- [ ] Test updating own profile with new fields
- [ ] Verify gender constraint rejects invalid values
- [ ] **Verify birthday constraint rejects users under 13 years old**
- [ ] Verify birthday constraint rejects future dates
- [ ] Verify birthday constraint rejects dates over 120 years ago
- [ ] Test age calculation function
- [ ] Verify fields visible in event interest views
- [ ] Test privacy rules (friends vs non-friends visibility)
- [ ] Verify existing profiles still work without these fields

## Security Notes

1. **Age Requirement:** Users must be at least 13 years old (COPPA compliance)
2. **Optional Fields:** Both fields are optional to respect user privacy
3. **Age Display:** Show calculated age, not exact birthday
4. **Validation:** Server-side validation via check constraints
5. **RLS Policies:** Existing policies control who can see these fields
6. **Trust & Safety:** Helps establish accountability for event meetups

## Next Steps

1. **Run the migration** in Supabase SQL Editor
2. **Update profile edit UI** to include gender and birthday inputs
3. **Add age display** to profile views (show age, not birthday)
4. **Show trust info** in event interest lists
5. **Add validation** in frontend forms
6. **Test thoroughly** with different user scenarios

## Questions?

If you encounter any issues:
1. Check migration ran successfully
2. Verify TypeScript types are up to date
3. Check RLS policies allow profile updates
4. Ensure date format is YYYY-MM-DD for birthday field

