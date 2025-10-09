# 🧪 Testing In-App Event Sharing Feature

## 📋 Pre-Testing Setup

### **Step 1: Apply Database Migration**

You need to run the SQL migration in your Supabase project first.

#### **Option A: Using Supabase CLI (Recommended)**
```bash
cd C:\Users\Owner\Desktop\synth-beta-testing-1
supabase db push
```

#### **Option B: Manual SQL Execution**
1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor** in the left sidebar
4. Copy the contents of: `supabase/migrations/20250110000001_add_event_sharing_to_messages.sql`
5. Paste into the SQL editor
6. Click **Run** button
7. Verify success message

### **Step 2: Start Local Development Server**
```bash
cd C:\Users\Owner\Desktop\synth-beta-testing-1
npm run dev
```

The app should start at `http://localhost:5173` (or similar)

---

## ✅ Testing Checklist

### **1. Test Share Button Visibility**
- [ ] Navigate to any event in the app
- [ ] Verify "Share" button appears on event cards
- [ ] Button should have a pink/purple theme with Share2 icon
- [ ] Button should only show when logged in

### **2. Test Share Modal Opening**
- [ ] Click the "Share" button on any event
- [ ] EventShareModal should open
- [ ] Modal should show:
  - Event preview card at top
  - Custom message textarea
  - Three tabs: Chats, Friends, External

### **3. Test Sharing to Existing Chats**
**Prerequisites:** You need at least one existing chat

- [ ] Click "Chats" tab
- [ ] Verify your chats appear in the list
- [ ] Try searching for a chat using the search bar
- [ ] Select one or more chats (checkmarks should appear)
- [ ] (Optional) Add a custom message
- [ ] Click "Share (X)" button
- [ ] Verify success toast notification
- [ ] Modal should close

### **4. Test Sharing to Friends**
**Prerequisites:** You need at least one friend

- [ ] Click "Friends" tab
- [ ] Verify your friends appear in the list
- [ ] Try searching for a friend
- [ ] Select one or more friends
- [ ] (Optional) Add a custom message
- [ ] Click "Share (X)" button
- [ ] Verify success toast notification
- [ ] New chats should be created automatically

### **5. Test External Sharing**
- [ ] Click "External" tab
- [ ] Click "Copy Event Link" button
- [ ] Verify link copied toast notification
- [ ] Paste link somewhere to verify it's correct format

### **6. Test Viewing Shared Events in Chat**
- [ ] Navigate to Messages/Chat view
- [ ] Open a chat where you shared an event
- [ ] Verify the event appears as a beautiful card (not plain text)
- [ ] Card should show:
  - "You shared an event" or "Friend Name shared an event"
  - Event details (title, artist, venue, date)
  - Custom message (if you added one)
  - Action buttons (I'm Interested / I Was There / Get Tickets)
  - Timestamp

### **7. Test Event Card Interactions**
- [ ] Click "I'm Interested" button on shared event
- [ ] Verify interest is marked
- [ ] Click "Get Tickets" button
- [ ] Verify it opens ticket URL in new tab
- [ ] Click anywhere on the event card
- [ ] Verify it opens event details (or logs to console)

### **8. Test Edge Cases**
- [ ] Try sharing when you have no chats → Should show "No chats found"
- [ ] Try sharing when you have no friends → Should show "No friends found"
- [ ] Try sharing without selecting any recipients → Should show error toast
- [ ] Try sharing with very long custom message → Should work
- [ ] Share same event to same chat twice → Should work (creates 2 messages)

---

## 🐛 Common Issues & Solutions

### **Issue: Share button doesn't appear**
**Solution:** 
- Make sure you're logged in
- Check that `currentUserId` prop is being passed to the event card component
- Verify the component import is correct

### **Issue: Modal shows "No chats found"**
**Solution:**
- Create at least one chat first
- Go to Messages → New Chat → Select a friend
- Then try sharing again

### **Issue: Modal shows "No friends found"**
**Solution:**
- Add friends first
- Go to social/profile section
- Send friend requests and wait for acceptance
- Then try sharing again

### **Issue: Shared event doesn't appear in chat**
**Solution:**
- Refresh the chat view
- Check browser console for errors
- Verify the migration ran successfully
- Check that `message_type` column exists in messages table

### **Issue: Event card shows "Event not found"**
**Solution:**
- The event might have been deleted from database
- Check that the `shared_event_id` is valid
- Verify the event exists in `jambase_events` table

### **Issue: Database errors when sharing**
**Solution:**
- Make sure migration ran successfully
- Check Supabase logs for RLS policy errors
- Verify your user has proper permissions

---

## 🔍 Debugging Tips

### **Check Database Tables:**
```sql
-- Verify messages table has new columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'messages';

-- Check if event_shares table exists
SELECT * FROM event_shares LIMIT 5;

-- View shared events
SELECT m.*, e.title, e.artist_name 
FROM messages m
LEFT JOIN jambase_events e ON m.shared_event_id = e.id
WHERE m.message_type = 'event_share'
ORDER BY m.created_at DESC
LIMIT 10;
```

### **Browser Console Checks:**
```javascript
// Check if service is loaded
console.log(InAppShareService);

// Check share targets
InAppShareService.getShareTargets('your-user-id')
  .then(targets => console.log('Share targets:', targets));

// Check friends
InAppShareService.getFriends('your-user-id')
  .then(friends => console.log('Friends:', friends));
```

### **Network Tab:**
- Open browser DevTools → Network tab
- Filter by "supabase" or "messages"
- Look for POST requests when sharing
- Check response status (should be 200 or 201)
- Inspect response body for errors

---

## 📊 What to Test For

### **Functionality:**
- ✅ Share button appears and works
- ✅ Modal opens and closes properly
- ✅ All three tabs work (Chats, Friends, External)
- ✅ Search functionality works
- ✅ Multi-select works
- ✅ Custom message is saved and displayed
- ✅ Events appear correctly in chat
- ✅ Event cards are interactive
- ✅ Action buttons work (Interest, Tickets)

### **UI/UX:**
- ✅ Animations are smooth
- ✅ Colors match PlusOne theme (pink/purple)
- ✅ Text is readable
- ✅ Buttons have hover states
- ✅ Loading states show properly
- ✅ Error messages are clear
- ✅ Success notifications appear
- ✅ Modal is responsive on mobile

### **Performance:**
- ✅ Modal opens quickly
- ✅ Chat list loads fast
- ✅ Event cards render without lag
- ✅ Search is responsive
- ✅ No memory leaks (check DevTools)

---

## 🎯 Test Scenarios

### **Scenario 1: Share to Single Friend**
1. Find an upcoming concert
2. Click Share button
3. Go to Friends tab
4. Select one friend
5. Add message: "Let's go to this together! 🎵"
6. Click Share
7. Go to Messages
8. Open the new chat
9. Verify event card appears with your message
10. Friend should see the same card

### **Scenario 2: Share to Group Chat**
1. Find a concert
2. Click Share
3. Go to Chats tab
4. Select a group chat
5. Add message: "Anyone want to go?"
6. Click Share
7. Open the group chat
8. All members should see the event card

### **Scenario 3: Share to Multiple Chats**
1. Find a popular event
2. Click Share
3. Select 3-4 different chats
4. Add message: "Check this out!"
5. Click Share
6. Verify success toast says "Successfully shared to X chats"
7. Check each chat to confirm event appears

### **Scenario 4: Share Past Event**
1. Find a past event (concert that already happened)
2. Share it to a friend
3. Open the chat
4. Verify event card shows "Past Event" badge
5. Verify "I Was There" button appears instead of "I'm Interested"

---

## 📝 Testing Notes Template

Use this template to document your testing:

```
Date: ___________
Tester: ___________
Environment: Local / Staging / Production

✅ PASSED TESTS:
- 

❌ FAILED TESTS:
- 

🐛 BUGS FOUND:
- 

💡 SUGGESTIONS:
- 

📊 PERFORMANCE NOTES:
- 

🎨 UI/UX FEEDBACK:
- 
```

---

## 🚀 Ready to Test!

**Quick Start:**
```bash
# 1. Apply migration
supabase db push

# 2. Start dev server
npm run dev

# 3. Open browser
# Navigate to http://localhost:5173

# 4. Log in to your account

# 5. Find any event and click "Share"

# 6. Test all the features! 🎉
```

---

## 📞 Need Help?

If you encounter issues:
1. Check the console for errors
2. Review the main documentation: `docs/IN_APP_EVENT_SHARING_FEATURE.md`
3. Check Supabase logs
4. Verify migration ran successfully
5. Make sure you have friends and chats set up

**Happy Testing! 🎵✨**

