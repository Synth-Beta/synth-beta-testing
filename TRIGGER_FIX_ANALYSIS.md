# Database Trigger Fix Analysis

## Problem

When adding a comment to a review, you're getting this error:
```
Error: record "new" has no field "engagement_type"
code: '42703'
```

## Root Cause

The `update_review_counts()` function is used by triggers on both the `engagements` and `comments` tables. The function checks `TG_TABLE_NAME` first, but PostgreSQL still validates field references when the function is executed, even if those fields don't exist on the table that triggered it.

### Current Function Structure (from `consolidation/16_update_triggers.sql`)

```sql
CREATE OR REPLACE FUNCTION public.update_review_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'engagements' AND NEW.entity_type = 'review' AND NEW.engagement_type = 'like' THEN
      -- Update likes_count
    ELSIF TG_TABLE_NAME = 'comments' AND NEW.entity_type = 'review' THEN
      -- Update comments_count
    ELSIF TG_TABLE_NAME = 'engagements' AND NEW.entity_type = 'review' AND NEW.engagement_type = 'share' THEN
      -- Update shares_count
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Similar structure for DELETE operations
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;
```

### The Issue

Even though the function checks `TG_TABLE_NAME = 'engagements'` before accessing `NEW.engagement_type`, PostgreSQL validates field references when the trigger function is called. When the trigger fires from the `comments` table, `NEW.engagement_type` doesn't exist, causing the error.

## Solution

We need to restructure the function to check the table name FIRST and only access table-specific fields within those branches. However, the current code already does this, so the issue might be more subtle.

The best fix is to use nested IF statements that check `TG_TABLE_NAME` first, then access table-specific fields only within those branches. Alternatively, we can create separate functions for each table type.

## Recommended Fix

Create a migration that restructures the function to use nested conditionals:

```sql
CREATE OR REPLACE FUNCTION public.update_review_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Handle engagements table
    IF TG_TABLE_NAME = 'engagements' THEN
      IF NEW.entity_type = 'review' AND NEW.engagement_type = 'like' THEN
        UPDATE public.reviews 
        SET likes_count = COALESCE(likes_count, 0) + 1 
        WHERE id = NEW.entity_id;
      ELSIF NEW.entity_type = 'review' AND NEW.engagement_type = 'share' THEN
        UPDATE public.reviews 
        SET shares_count = COALESCE(shares_count, 0) + 1 
        WHERE id = NEW.entity_id;
      END IF;
    -- Handle comments table
    ELSIF TG_TABLE_NAME = 'comments' THEN
      IF NEW.entity_type = 'review' THEN
        UPDATE public.reviews 
        SET comments_count = COALESCE(comments_count, 0) + 1 
        WHERE id = NEW.entity_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Similar nested structure for DELETE
    IF TG_TABLE_NAME = 'engagements' THEN
      IF OLD.entity_type = 'review' AND OLD.engagement_type = 'like' THEN
        UPDATE public.reviews 
        SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) 
        WHERE id = OLD.entity_id;
      ELSIF OLD.entity_type = 'review' AND OLD.engagement_type = 'share' THEN
        UPDATE public.reviews 
        SET shares_count = GREATEST(COALESCE(shares_count, 0) - 1, 0) 
        WHERE id = OLD.entity_id;
      END IF;
    ELSIF TG_TABLE_NAME = 'comments' THEN
      IF OLD.entity_type = 'review' THEN
        UPDATE public.reviews 
        SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0) 
        WHERE id = OLD.entity_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;
```

This ensures that `NEW.engagement_type` is only accessed when we're sure we're dealing with the `engagements` table.

## Files to Update

- Create a new migration file to fix this function
- Location: `supabase/migrations/YYYYMMDDHHMMSS_fix_update_review_counts_trigger.sql`

## Testing

After applying the fix:
1. Try adding a comment to a review - should work without errors
2. Try liking a review - should still work
3. Try sharing a review - should still work
4. Try deleting comments/likes/shares - should still work

