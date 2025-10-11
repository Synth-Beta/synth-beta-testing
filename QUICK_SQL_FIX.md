# Quick SQL Fix - Artist Diversity

## 🐛 The Problem
The SQL function had an ambiguous column reference: `event_date` wasn't qualified with a table alias.

## ✅ The Fix
Updated line 130 in the migration to use explicit table aliases:
- Before: `ORDER BY base_relevance_score DESC, event_date ASC`
- After: `ORDER BY se.base_relevance_score DESC, se.event_date ASC`

## 🚀 Apply the Fix

**Go to Supabase SQL Editor:**
1. Open: https://supabase.com/dashboard/project/glpiolbrafqikqhnseto/sql
2. Click **New Query**
3. Copy the ENTIRE contents of: `supabase/migrations/20250210000009_artist_diversity_feed.sql`
4. Paste into SQL Editor
5. Click **RUN**
6. Wait for "Success. No rows returned"

## 🧪 Test
After running the SQL:
1. Refresh your localhost browser (Cmd+Shift+R)
2. Check console - should see diversity logs
3. Feed should show max 2 events per artist!

---
**The file is already updated locally, just re-run it in Supabase!**

