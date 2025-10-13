# Apply Artist Diversity Fix - QUICK GUIDE

## 🎯 Problem
Billie Eilish is dominating your feed (12+ events). We need to apply diversity controls.

## 🚀 Solution: Run the SQL Migration

### **Option 1: Supabase Dashboard (RECOMMENDED)**

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/glpiolbrafqikqhnseto
2. Click on **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the entire contents of this file:
   ```
   supabase/migrations/20250210000009_artist_diversity_feed.sql
   ```
5. Paste it into the SQL Editor
6. Click **RUN** button
7. Wait for confirmation: "Success. No rows returned"

### **Option 2: Supabase CLI**

```bash
cd /Users/sloiterstein/Desktop/Synth/synth-beta-testing-main
supabase db push
```

## ✅ **What This Does**

Creates a new function `get_personalized_events_feed_with_diversity` that:
- **Limits to 2 events per artist** (prevents Billie Eilish domination)
- **Applies diversity penalties** for repeated artists
- **Maintains relevance scoring** while ensuring variety
- **Preserves location and genre preferences**

## 🧪 **After Running the Migration**

1. **Refresh your browser**
2. **Check the console** - you should see:
   ```javascript
   ✅ Personalized feed loaded: {
     count: 20,
     topArtist: "Billie Eilish (2 events)", // ← Max 2!
     artistDiversity: 15, // ← More diverse
   }
   ```
3. **Look at the feed** - should show:
   - Max 2 Billie Eilish events
   - More variety (Goose, Hot Milk, etc.)
   - Better overall diversity

## 📊 **Expected Results**

**Before:**
- Billie Eilish: 12+ events
- Limited variety
- Poor diversity

**After:**
- Billie Eilish: Max 2 events  
- Goose: 2 events
- Hot Milk: 2 events
- Other artists: Fill remaining slots
- Much better diversity!

## ⚙️ **Configurable Settings**

The function accepts these parameters:
- `p_max_per_artist` - Default: 2 (can be adjusted)
- `p_limit` - Number of events to return
- `p_offset` - For pagination
- `p_include_past` - Include past events (default: false)

## 🔧 **Troubleshooting**

If it still shows old results after migration:
1. **Hard refresh** browser: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. **Clear cache and reload**
3. **Check console for errors**
4. **Verify migration ran** - Check Supabase SQL Editor for errors

---

**Next Step:** Run the migration now! Then refresh your browser to see the diversity in action! 🎉

