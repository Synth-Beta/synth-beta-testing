# 🗄️ Apply All Database Migrations

**Run this to activate all Phase 2, 3 & 4 features**

---

## 🚀 **Single Command (Recommended)**

```bash
cd /Users/sloiterstein/Desktop/Synth/synth-beta-testing-main
supabase db push
```

This will apply ALL pending migrations automatically in order.

---

## ✅ **What Gets Applied**

### **Phase 2 Migration:**
- File: `20250213000000_phase2_event_creation_system.sql`
- Creates: event_claims, event_tickets tables
- Expected output: `Phase 2 Event Creation System Installed | 1 | 1`

### **Phase 3 Migrations (2 files):**
- File: `20250214000000_phase3_admin_promotion_system.sql`
- Creates: event_promotions, admin_actions, moderation_flags tables
- Expected output: `Phase 3 Admin & Promotion System Installed | 1 | 1 | 1`

- File: `20250214000001_user_blocking_system.sql`
- Creates: user_blocks table
- Enhances: profiles table with moderation columns
- Expected output: `User Blocking & Enhanced Moderation System Installed | 1`

### **Phase 4 Migration:**
- File: `20250216000000_phase4_social_engagement.sql`
- Creates: event_groups, event_group_members, event_photos, event_photo_likes, event_photo_comments
- Enhances: user_jambase_events with RSVP columns
- Expected output: `Phase 4 Social & Engagement System Installed | 1 | 1 | 1 | 1 | 1`

---

## 📊 **Verification After Running**

Run this query to verify all tables were created:

```sql
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_name = t.table_name AND table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
AND table_name IN (
  'event_claims',
  'event_tickets',
  'event_promotions',
  'admin_actions',
  'moderation_flags',
  'user_blocks',
  'event_groups',
  'event_group_members',
  'event_photos',
  'event_photo_likes',
  'event_photo_comments'
)
ORDER BY table_name;
```

**Expected Result:** 11 tables should appear

---

## ✅ **What You Should See**

### **Expected Tables:**
```
event_claims           ✅
event_tickets          ✅
event_promotions       ✅
admin_actions          ✅
moderation_flags       ✅
user_blocks            ✅
event_groups           ✅
event_group_members    ✅
event_photos           ✅
event_photo_likes      ✅
event_photo_comments   ✅
```

### **Expected Functions:**
- claim_event()
- review_event_claim()
- promote_event()
- review_event_promotion()
- flag_content()
- moderate_content()
- block_user()
- unblock_user()
- is_user_blocked()
- create_event_group()
- join_event_group()
- leave_event_group()
- get_event_groups()
- get_event_photos()
- update_rsvp_status()

---

## 🔍 **If You Already Ran Some Migrations**

You mentioned you already applied Phase 2 and Phase 3 earlier. If so:

### **Check what's already applied:**
```sql
SELECT * FROM supabase_migrations.schema_migrations 
WHERE version LIKE '202502%' 
ORDER BY version DESC;
```

### **Then just run:**
```bash
supabase db push
```

It will only apply migrations that haven't been run yet. It's **safe to run multiple times**.

---

## ⚠️ **If You Get Errors**

### **"Table already exists"**
✅ This is fine! It means the migration was already applied.  
✅ Supabase tracks which migrations ran.  
✅ `supabase db push` will skip already-applied migrations.

### **"Function already exists"**
✅ Migrations use `CREATE OR REPLACE FUNCTION`  
✅ Safe to rerun  

### **Syntax errors**
❌ Check the error message  
❌ We fixed all syntax errors earlier  
❌ Should not happen  

---

## 🎯 **After Applying Migrations**

### **Test Each Feature:**

1. **Event Creation:**
   ```sql
   SELECT * FROM event_claims LIMIT 1;
   SELECT * FROM event_tickets LIMIT 1;
   ```

2. **Promotions:**
   ```sql
   SELECT * FROM event_promotions LIMIT 1;
   ```

3. **Moderation:**
   ```sql
   SELECT * FROM moderation_flags LIMIT 1;
   SELECT * FROM user_blocks LIMIT 1;
   ```

4. **Social:**
   ```sql
   SELECT * FROM event_groups LIMIT 1;
   SELECT * FROM event_photos LIMIT 1;
   ```

5. **Test Functions:**
   ```sql
   -- Test getting pending admin tasks
   SELECT * FROM get_pending_admin_tasks();
   
   -- Test getting event groups (pick any event ID)
   SELECT * FROM get_event_groups('your-event-id-here');
   ```

---

## 🚀 **QUICK START**

**Just run this:**
```bash
cd /Users/sloiterstein/Desktop/Synth/synth-beta-testing-main && supabase db push
```

**Then verify:**
```sql
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'event_%';
```

Should return **11 or more** tables.

---

## 💡 **That's It!**

After running `supabase db push`, all your features will be live:
- ✅ Event creation
- ✅ Event claiming  
- ✅ Event promotion
- ✅ Content moderation
- ✅ User blocking
- ✅ Concert buddy matching
- ✅ Event groups
- ✅ Photo galleries
- ✅ Social proof

**One command activates everything!** 🎊

