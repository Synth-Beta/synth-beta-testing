# Gender & Birthday Fields - Quick Start

## ⚡ Quick Summary
Added `gender` and `birthday` to user profiles for trust and safety when viewing users interested in events.

## 🎯 What to Run in Supabase

### Option 1: Run the migration file directly
1. Open Supabase SQL Editor
2. Copy the contents of `supabase/migrations/20251010000000_add_gender_birthday_to_profiles.sql`
3. Paste and run in SQL Editor
4. Done! ✅

### Option 2: Use Supabase CLI
```bash
cd /Users/sloiterstein/Desktop/Synth/synth-beta-testing-main
supabase db push
```

## 📋 What Changed

### Database
- **Table:** `profiles`
- **New Columns:**
  - `gender` (TEXT, nullable) - Values: male, female, non-binary, prefer-not-to-say, other
  - `birthday` (DATE, nullable) - **Users must be at least 13 years old**, must be in past, reasonable age range

### Code (Already Updated ✅)
- `src/integrations/supabase/types.ts` - TypeScript types updated
- `src/types/database.ts` - Profile interface updated  
- `src/components/profile/ProfileView.tsx` - UserProfile interface updated

## ✅ Safety Checks

- ✅ **Non-breaking:** All existing functions continue to work
- ✅ **Backward compatible:** Existing users won't be affected
- ✅ **Optional fields:** Both fields are nullable
- ✅ **Validation:** Check constraints prevent invalid data
- ✅ **RLS policies:** Unchanged and working
- ✅ **No linter errors:** All TypeScript types valid

## 📝 The SQL Migration

The migration does:
1. Adds `gender` and `birthday` columns (both nullable)
2. Adds validation constraints:
   - Gender must be from allowed list
   - Birthday: **Users must be at least 13 years old** (COPPA compliance)
   - Birthday must be in past and within 120 years
3. Creates indexes for performance
4. Adds documentation comments
5. Safe to run multiple times (uses IF NOT EXISTS)

## 🚀 Next Steps for Frontend

1. **Add to Profile Edit Form:**
   - Gender dropdown (male, female, non-binary, prefer-not-to-say, other)
   - Birthday date picker (with max date = 13 years ago - users must be 13+)

2. **Display in Profile:**
   - Show gender as badge/text
   - Show calculated age (NOT exact birthday for privacy)
   
3. **Show in Event Interest Lists:**
   - Display gender and age for users interested in same events
   - Helps with trust and safety

## 💻 Example Code

### Calculate Age
```typescript
const calculateAge = (birthday: string | null): number | null => {
  if (!birthday) return null;
  const birthDate = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};
```

### Update Profile
```typescript
import { SupabaseService } from '@/services/supabaseService';

await SupabaseService.updateProfile(userId, {
  gender: 'male',
  birthday: '1996-01-15'
});
```

## ❓ Questions?

See `GENDER_BIRTHDAY_IMPLEMENTATION.md` for full documentation.

