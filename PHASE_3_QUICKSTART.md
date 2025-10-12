# 🚀 Phase 3: Quick Start Testing Guide

**Ready to test Admin, Promotion & Moderation features!**

---

## ✅ **Prerequisites**

Make sure Phase 3 migrations are applied:

```bash
cd /Users/sloiterstein/Desktop/Synth/synth-beta-testing-main
supabase db push
```

**Verify:**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('event_promotions', 'admin_actions', 'moderation_flags', 'user_blocks')
ORDER BY table_name;
```

Expected: All 4 tables should appear ✅

---

## 🧪 **Testing Scenarios**

### **Scenario 1: User Reports Content** 👤

**As a regular user:**

1. **Find any event**
   - Browse feed or search
   - Open event details modal

2. **Click "Report" button**
   - Look for gray flag button
   - Should be next to "Interested" button

3. **Fill out report:**
   - Select reason (e.g., "Spam" or "Fake Event")
   - Add optional details
   - Click "Submit Report"

4. **Verify:**
   - ✅ Toast shows "Report Submitted"
   - ✅ Modal closes
   - ✅ Check database:
   ```sql
   SELECT * FROM moderation_flags 
   WHERE flagged_by_user_id = auth.uid()
   ORDER BY created_at DESC LIMIT 5;
   ```

---

### **Scenario 2: User Blocks Another User** 🚫

**As a regular user:**

1. **Visit another user's profile**
   - Search for a user
   - Click on their profile

2. **Click "Block" button**
   - Look for gray ban icon button
   - Should be near "Add Friend" button

3. **Confirm block:**
   - Read consequences
   - Optionally add reason
   - Click "Block User"

4. **Verify:**
   - ✅ Toast shows "User Blocked"
   - ✅ Button changes to "Unblock"
   - ✅ Check database:
   ```sql
   SELECT * FROM user_blocks 
   WHERE blocker_user_id = auth.uid();
   ```

5. **Test unblock:**
   - Click "Unblock" button
   - Confirm unblock
   - ✅ User unblocked successfully

---

### **Scenario 3: Business Promotes Event** 💼

**As a business or creator account:**

1. **Go to My Events:**
   - Click "Events" tab in navigation
   - View your created or claimed events

2. **Click "Promote" button:**
   - On any published event
   - Purple TrendingUp icon

3. **Select promotion tier:**
   - Choose Basic ($49), Premium ($149), or Featured ($499)
   - Review features
   - Click "Request Promotion"

4. **Verify:**
   - ✅ Toast shows "Promotion Request Submitted"
   - ✅ Check database:
   ```sql
   SELECT * FROM event_promotions 
   WHERE promoted_by_user_id = auth.uid()
   ORDER BY created_at DESC;
   ```
   - ✅ Status should be 'pending'

---

### **Scenario 4: Admin Reviews Event Claim** 👨‍💼

**As an admin account:**

1. **Go to Analytics:**
   - Click Analytics in navigation

2. **Click "Claims" tab:**
   - Should see new tab in admin dashboard
   - View pending claims list

3. **Review a claim:**
   - Click on pending claim
   - View event details
   - Check verification proof (if provided)
   - Add admin notes

4. **Approve or Reject:**
   - Click green "Approve" button, OR
   - Click red "Reject" button (add notes required)

5. **Verify:**
   - ✅ Claim moves to Approved/Rejected tab
   - ✅ Creator receives notification
   - ✅ Check database:
   ```sql
   SELECT * FROM event_claims 
   WHERE claim_status IN ('approved', 'rejected')
   ORDER BY reviewed_at DESC LIMIT 5;
   ```

---

### **Scenario 5: Admin Moderates Content** 🛡️

**As an admin account:**

1. **Go to Moderation tab:**
   - Analytics > Moderation
   - View pending flags

2. **Select flagged content:**
   - Click on any pending flag
   - View content preview
   - Read flag reason and details

3. **Take action:**
   - **Remove Content:** Deletes content, notifies owner
   - **Warn User:** Increments warning count
   - **Dismiss:** Closes flag without action
   - Add review notes (optional)

4. **Verify:**
   - ✅ Action completes successfully
   - ✅ User receives notification
   - ✅ Check database:
   ```sql
   -- Check flag was reviewed
   SELECT * FROM moderation_flags 
   WHERE flag_status != 'pending'
   ORDER BY reviewed_at DESC LIMIT 5;
   
   -- Check user warnings (if you chose Warn)
   SELECT user_id, name, moderation_status, warning_count 
   FROM profiles 
   WHERE warning_count > 0;
   ```

---

## 🔍 **Verification Queries**

### **Check Your Reports:**
```sql
SELECT 
  mf.*,
  (SELECT title FROM jambase_events WHERE id = mf.content_id::uuid) as content_title
FROM moderation_flags mf
WHERE flagged_by_user_id = auth.uid()
ORDER BY created_at DESC;
```

### **Check Your Blocks:**
```sql
SELECT * FROM get_blocked_users();
```

### **Check Promotion Requests:**
```sql
SELECT 
  ep.*,
  je.title as event_title
FROM event_promotions ep
JOIN jambase_events je ON je.id = ep.event_id
WHERE promoted_by_user_id = auth.uid()
ORDER BY created_at DESC;
```

### **Admin: View All Pending Tasks:**
```sql
SELECT * FROM get_pending_admin_tasks();
```

### **Admin: View Recent Actions:**
```sql
SELECT 
  aa.*,
  p.name as admin_name
FROM admin_actions aa
JOIN profiles p ON p.user_id = aa.admin_user_id
ORDER BY created_at DESC
LIMIT 20;
```

---

## 🎨 **UI Access Points**

### **Report Buttons Located:**
- ✅ Event Details Modal (top action bar)
- ✅ User Profiles (header actions)
- 🔄 Reviews (future)
- 🔄 Comments (future)

### **Block Buttons Located:**
- ✅ User Profiles (header actions)
- 🔄 Chat interface (future)
- 🔄 Review user cards (future)

### **Promote Buttons Located:**
- ✅ My Events Management Panel

### **Admin Panels Located:**
- ✅ Analytics > Claims tab
- ✅ Analytics > Moderation tab

---

## 🐛 **Common Issues**

### **"Report button not appearing"**
**Solution:** Check imports in EventDetailsModal and ProfileView

### **"Block button doesn't work"**
**Solution:** Verify user_blocks table exists and RLS policies enabled

### **"Admin panels empty"**
**Solution:** 
- Check account_type is 'admin'
- Create test data (reports, claims)

### **"Promote button not showing"**
**Solution:** Must be created/claimed event owner

---

## 📊 **Test Data Creation**

### **Create Test Admin Account:**
```sql
UPDATE profiles 
SET account_type = 'admin' 
WHERE user_id = auth.uid();
```

### **Create Test Flag:**
Use the UI to report something, or:
```sql
SELECT flag_content(
  'event'::TEXT,
  (SELECT id FROM jambase_events LIMIT 1),
  'spam'::TEXT,
  'This is a test flag'
);
```

### **Check Moderation Status:**
```sql
SELECT 
  user_id,
  name,
  moderation_status,
  warning_count,
  last_warned_at
FROM profiles
WHERE user_id = auth.uid();
```

---

## ✨ **Feature Highlights**

### **For All Users:**
- 🚩 Report inappropriate content
- 🚫 Block users you don't want to interact with
- 📝 8 different report categories
- 🔔 Notifications for report outcomes

### **For Business/Creators:**
- 🚀 Promote events to reach more people
- 💰 3 pricing tiers to choose from
- 📊 Track promotion performance
- ⏰ Set promotion duration

### **For Admins:**
- 🛡️ Review all flagged content
- ✅ Approve/reject event claims
- 📋 Complete audit trail
- 🎯 Pending tasks dashboard
- 👥 User moderation controls

---

## 🎯 **Testing Checklist**

### **User Features:**
- [ ] Report an event
- [ ] Report a profile
- [ ] Block a user
- [ ] Unblock a user
- [ ] View your reports
- [ ] View blocked users list

### **Business Features:**
- [ ] Request Basic promotion
- [ ] Request Premium promotion
- [ ] Request Featured promotion
- [ ] View promotion status
- [ ] Cancel promotion (future)

### **Admin Features:**
- [ ] View pending claims
- [ ] Approve a claim
- [ ] Reject a claim
- [ ] View pending flags
- [ ] Remove flagged content
- [ ] Warn a user
- [ ] Dismiss a flag
- [ ] View audit log

---

## 🚀 **You're Ready!**

Phase 3 is fully implemented and ready for testing. All features are accessible through the UI, and admins have complete control.

**Next:** Test everything, fix bugs, then move to Phase 4! 🎊

---

**Questions? Check `PHASE_3_COMPLETE.md` for full documentation!**

