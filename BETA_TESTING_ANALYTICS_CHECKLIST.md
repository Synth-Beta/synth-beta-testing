# 🧪 BETA TESTING - Analytics Accuracy Checklist

## Goal
Verify that all analytics dashboards are showing accurate, real data from your database.

---

## Step 1: Run Database Verification (5 minutes)

### Option A: Quick Check (Easiest!)

1. Open `QUICK_ANALYTICS_CHECK.sql` in Supabase SQL Editor
2. Run queries 1-3 first (no user ID needed)
3. **Get your user ID**: Run `GET_YOUR_USER_ID.sql`
4. Replace `'YOUR_USER_ID_HERE'` in queries 4-6 with your actual UUID
5. Run queries 4-6

### Option B: Full Verification (More Detailed)

1. Get your user ID first: Run `GET_YOUR_USER_ID.sql`
2. Copy your user ID (it's a UUID like `a1b2c3d4-...`)
3. Open `VERIFY_ANALYTICS_DATA.sql`
4. Find & Replace all instances of `'YOUR_USER_ID'` with your actual UUID
5. Run all queries

### What to Look For:

✅ **Query #1 (Total Interactions)**: Should be > 0 if tracking is working
- If 0: Tracking is broken, all metrics will be wrong
- If > 0: Tracking is working! 🎉

✅ **Query #2 (Event Type Breakdown)**: Should show:
- `view` - When you view events
- `click` - When you click events
- `click_ticket` - When you click ticket links  
- `search` - When you search

✅ **Query #4 (Attended Events)**: Should match your "Concert Enthusiast" achievement
- completed_reviews + draft_reviews + attendance_only = total

✅ **Query #27 (Overall Health Check)**: All should show "Working ✓" or "Has Data ✓"

---

## Step 2: Test USER Dashboard (10 minutes)

### Open your profile → Achievements tab

1. **Concert Enthusiast (Attended Events)**
   - Compare to Query #4 result
   - Should match total_attended
   - ✅ / ❌

2. **Local Expert (Unique Venues)**
   - Compare to Query #5 result
   - Check venue names match
   - ✅ / ❌

3. **Super Fan (Artist Follows)**
   - Compare to Query #6 result
   - Should match artist_follows_count
   - ✅ / ❌

4. **Early Bird (Interested Events)**
   - Compare to Query #8 result
   - Should match interested_events count
   - ✅ / ❌

5. **Review Master (Reviews Written)**
   - Compare to Query #9 result
   - Should match completed_reviews
   - ✅ / ❌

6. **Following Count (Profile)**
   - Compare to Query #6 + Query #7
   - Should be artist_follows + venue_follows
   - ✅ / ❌

### Issues to Report:

- Which achievements are incorrect?
- What are the correct values from SQL?
- Screenshots of both dashboard and query results

---

## Step 3: Test Tracking in Browser (5 minutes)

### Open Browser Console (F12 or Cmd+Option+I)

1. **View an Event**
   - Should see: `🎯 Tracking impression for event:...`
   - Should see: `✅ Interaction logged: impression`
   
2. **Click an Event**
   - Should see: `✅ Interaction logged: click`
   
3. **Search for Events**
   - Should see: `✅ Interaction logged: search`
   
4. **Click Get Tickets**
   - Should see: `✅ Interaction logged: click_ticket`

5. **Wait 30 seconds**
   - Should see: `✅ Batch sent: {insert count: X}`

### If No Console Logs:

- Tracking is NOT working
- All interaction-based metrics will show 0
- Need to fix tracking before proceeding

---

## Step 4: Test CREATOR Dashboard (If You're a Creator)

### Change Your Account Type:

```sql
UPDATE profiles 
SET account_type = 'creator',
    business_info = jsonb_build_object(
      'artist_name', 'YOUR ARTIST NAME HERE'
    )
WHERE user_id = 'YOUR_USER_ID';
```

### Check Creator Analytics:

1. **Navigate to Analytics tab** (should appear in bottom nav)
2. **Check Total Followers**
   - Compare to Query #13 (replace with your artist name)
   - ✅ / ❌

3. **Check Total Events**
   - Compare to Query #12 result
   - ✅ / ❌

4. **Check Total Reviews**
   - Compare to Query #14 result
   - ✅ / ❌

5. **Check Fan Insights**
   - Should show venues where you've performed
   - ✅ / ❌

6. **Check Geographic Insights**
   - Should show cities/states where you've performed
   - ✅ / ❌

### Issues to Report:

- Does the Analytics tab appear?
- Which metrics are wrong?
- Screenshots of dashboard vs query results

---

## Step 5: Test ADMIN Dashboard (If You're Admin)

### Change Your Account Type:

```sql
UPDATE profiles 
SET account_type = 'admin'
WHERE user_id = 'YOUR_USER_ID';
```

### Check Admin Analytics:

1. **Navigate to Analytics tab**
2. **Overview Tab**
   - Compare Total Users to Query #18
   - Compare Total Events to Query #19
   - Compare Active Today to Query #21
   - ✅ / ❌

3. **Users Tab**
   - Check user growth matches Query #22
   - Check daily active users match Query #23
   - ✅ / ❌

4. **Revenue Tab**
   - Compare to Query #24
   - Should be ticket_clicks * $50
   - ✅ / ❌

5. **Content Tab**
   - Compare to Query #19 results
   - ✅ / ❌

6. **System Tab**
   - All metrics are placeholder (expected)
   - ⚠️ (OK for now)

### Issues to Report:

- Which metrics don't match SQL?
- Screenshots of discrepancies

---

## Step 6: Report Findings

### Create a Report with:

1. **Tracking Status**
   - [ ] Working (seeing console logs)
   - [ ] Not Working (no console logs)
   - [ ] Partially Working (some logs, some errors)

2. **USER Analytics**
   - [ ] All Correct ✅
   - [ ] Some Issues (list which achievements)
   - [ ] All Wrong ❌

3. **CREATOR Analytics** (if tested)
   - [ ] All Correct ✅
   - [ ] Some Issues (list which metrics)
   - [ ] All Wrong ❌
   - [ ] Not Tested

4. **ADMIN Analytics** (if tested)
   - [ ] All Correct ✅
   - [ ] Some Issues (list which metrics)
   - [ ] All Wrong ❌
   - [ ] Not Tested

5. **Screenshots**
   - Dashboard views
   - SQL query results
   - Console logs (if tracking issues)

---

## Known Issues (Expected)

These are OK for beta:

✅ **BUSINESS Analytics** - Not implemented yet (all placeholder)
✅ **System Health** - Placeholder data (OK)
✅ **Geographic Distribution** - Placeholder data (OK)
✅ **Revenue** - Estimated from ticket clicks (OK for now)
✅ **Friends Count** - Always 0 (friends system not built yet)

---

## Critical Issues (Must Fix)

If you see these, report immediately:

🔴 **No console logs when viewing/clicking events**
- Tracking is completely broken

🔴 **Query #1 returns 0**
- No interactions being saved

🔴 **Achievements show 0 despite having data**
- Achievement calculations broken

🔴 **Following count is 0 despite following artists/venues**
- Follow counting broken

---

## Next Steps After Testing

Based on findings, we'll:

1. **Fix tracking** if broken (highest priority)
2. **Fix any calculation bugs** in USER analytics
3. **Improve CREATOR analytics** (artist linking)
4. **Implement BUSINESS analytics** (currently all placeholder)
5. **Add revenue tracking** (replace estimation)

---

## Questions to Answer

1. Is tracking working? (console logs?)
2. Are USER achievements accurate?
3. Does your following count match SQL?
4. If creator: Do your stats look right?
5. If admin: Do platform metrics match SQL?

**Please share your findings and I'll fix any issues!** 🚀
