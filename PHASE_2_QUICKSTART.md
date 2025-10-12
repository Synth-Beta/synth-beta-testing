# 🚀 Phase 2: Quick Start Guide

**Ready to Test Event Creation & Management!**

---

## ✅ **What's New**

Phase 2 adds event creation for businesses and event claiming for creators. Here's what you can do now:

### **For Business Accounts:**
1. Create events with full details
2. Upload event posters and photos
3. Add multiple ticket links
4. Manage event status (draft/published/cancelled)
5. Edit and delete your events

### **For Creator Accounts:**
1. Claim events featuring your performances
2. Submit verification proof
3. Manage claimed events
4. View claim status

---

## 🎯 **How to Test**

### **Step 1: Apply Database Migration**

```bash
cd /Users/sloiterstein/Desktop/Synth/synth-beta-testing-main
supabase db push
```

Verify installation:
```sql
SELECT 
  'Phase 2 Event Creation System Installed' as status,
  COUNT(*) FILTER (WHERE table_name = 'event_claims') as event_claims_table,
  COUNT(*) FILTER (WHERE table_name = 'event_tickets') as event_tickets_table
FROM information_schema.tables
WHERE table_schema = 'public' 
  AND table_name IN ('event_claims', 'event_tickets');
```

Expected: Both tables should return `1`

### **Step 2: Test Business Account Features**

1. **Navigate to Events:**
   - Look for new "Events" tab in bottom navigation
   - Click to open event management panel

2. **Create Event:**
   - Click "Create Event" button
   - Fill in:
     - Artist Name: "Test Artist"
     - Venue Name: "Test Venue"
     - Event Date: Any future date
   - Optional: Add location, photos, tickets
   - Click "Publish Event" or "Save Draft"

3. **Verify:**
   - Event appears in "Created Events" tab
   - Can edit event details
   - Can delete event

### **Step 3: Test Creator Account Features**

1. **Find Event to Claim:**
   - Browse events in feed or search
   - Open event details modal
   - Look for "Claim Event" button (purple/award icon)

2. **Submit Claim:**
   - Click "Claim Event"
   - Provide claim reason
   - Add verification link (optional)
   - Click "Submit Claim"

3. **Track Claim:**
   - Go to Events tab
   - Check "Pending Claims" tab
   - Wait for admin approval (future feature)

### **Step 4: Test Media Upload**

1. **In Event Creation:**
   - Go to "Media" tab
   - Upload poster image (recommended: 1080x1080)
   - Upload additional photos (up to 10)
   - Verify photos display correctly

### **Step 5: Test Ticket Management**

1. **In Event Creation:**
   - Go to "Tickets" tab
   - Add ticket URL
   - Select provider (Ticketmaster, Eventbrite, etc.)
   - Set price range
   - Mark as primary ticket
   - Save event

---

## 📋 **Test Checklist**

### **Business Account Tests:**
- [ ] Events tab appears in navigation
- [ ] Create event button visible
- [ ] Event creation form opens
- [ ] Can fill all form fields
- [ ] Can upload poster image
- [ ] Can upload multiple photos
- [ ] Can add ticket information
- [ ] Can save as draft
- [ ] Can publish event
- [ ] Event appears in "Created Events"
- [ ] Can edit event
- [ ] Can delete event

### **Creator Account Tests:**
- [ ] Events tab appears in navigation
- [ ] "Claim Event" button appears on events
- [ ] Claim modal opens
- [ ] Can submit claim with reason
- [ ] Can add verification proof
- [ ] Claim appears in "Pending Claims"
- [ ] Notification received (after approval)

### **General Tests:**
- [ ] No console errors
- [ ] All modals open/close properly
- [ ] Toast notifications work
- [ ] Loading states display
- [ ] Navigation works between tabs
- [ ] Images upload successfully
- [ ] Forms validate properly

---

## 🐛 **Common Issues**

### **"Events tab not appearing"**
- **Solution:** Make sure you're logged in as business, creator, or admin account
- Check account type in database:
  ```sql
  SELECT user_id, name, account_type FROM profiles WHERE user_id = auth.uid();
  ```

### **"Claim button not showing"**
- **Solution:** Must be creator or admin account
- Event must not already be claimed
- Check event status in database

### **"Cannot upload images"**
- **Solution:** Check storage bucket exists
- Verify user has storage permissions
- Check file size (max 5MB per image)

### **"Event not saving"**
- **Solution:** Fill all required fields (artist, venue, date)
- Check console for validation errors
- Verify database connection

---

## 📊 **Database Queries**

### **Check Your Account Type:**
```sql
SELECT user_id, name, account_type, subscription_tier 
FROM profiles 
WHERE user_id = auth.uid();
```

### **View Your Created Events:**
```sql
SELECT * FROM get_user_created_events(auth.uid());
```

### **View Your Claims:**
```sql
SELECT * FROM event_claims WHERE claimer_user_id = auth.uid();
```

### **View All Events with Owners:**
```sql
SELECT 
  id,
  title,
  artist_name,
  venue_name,
  event_date,
  created_by_user_id,
  claimed_by_creator_id,
  event_status
FROM jambase_events
ORDER BY event_date DESC
LIMIT 10;
```

---

## 🎨 **UI Features**

### **EventCreationModal Tabs:**
1. **Basic Info:** Artist, venue, title, date, description, genres
2. **Location:** Address, city, state, zip, parking, accessibility
3. **Media:** Poster upload, multiple photos
4. **Tickets:** Multiple tickets, providers, pricing

### **MyEventsManagementPanel Tabs:**
1. **Created Events:** For business accounts
2. **Claimed Events:** For creator accounts
3. **Pending Claims:** For creator accounts

### **New Navigation:**
- "Events" tab with calendar icon
- Only visible for business/creator/admin accounts
- Positioned between Profile and Analytics

---

## 🔐 **Permissions**

| Feature | User | Creator | Business | Admin |
|---------|------|---------|----------|-------|
| View Events Tab | ❌ | ✅ | ✅ | ✅ |
| Create Events | ❌ | ❌ | ✅ | ✅ |
| Claim Events | ❌ | ✅ | ❌ | ✅ |
| Edit Own Events | ❌ | ✅* | ✅ | ✅ |
| Edit Any Event | ❌ | ❌ | ❌ | ✅ |
| Review Claims | ❌ | ❌ | ❌ | ✅** |

*Only claimed events  
**Admin UI pending

---

## 📱 **Mobile Testing**

1. Test responsive layout on mobile
2. Check tab navigation works
3. Verify modals display correctly
4. Test photo upload on mobile
5. Check form inputs are accessible

---

## 🎉 **Success Criteria**

Phase 2 is working when:
- ✅ Business accounts see Events tab
- ✅ Can create and publish events
- ✅ Events appear in management panel
- ✅ Creators can claim events
- ✅ Claims appear in pending tab
- ✅ No console errors
- ✅ All modals functional
- ✅ Media uploads work
- ✅ RLS policies enforcing correctly

---

## 📞 **Need Help?**

1. Check `PHASE_2_IMPLEMENTATION_COMPLETE.md` for full documentation
2. Review console for specific errors
3. Verify migration ran successfully
4. Check account type is correct
5. Ensure logged in as correct user

---

## 🚀 **Next Steps**

After testing Phase 2:
1. Create business account (if needed)
2. Create test event
3. Upload photos
4. Add tickets
5. Create creator account
6. Claim test event
7. Verify permissions work

---

**Phase 2 is Ready!** Start creating and claiming events! 🎊

