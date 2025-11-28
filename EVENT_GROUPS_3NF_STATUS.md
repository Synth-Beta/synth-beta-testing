# Event Groups Feature - 3NF Schema Status

## Current Status: ❌ **NOT AVAILABLE**

The `event_groups` table and related functionality **does not exist** in the current 3NF database schema. This feature was removed during the database consolidation.

## What Was Removed:
- `event_groups` table
- `event_group_members` table  
- `get_event_groups` RPC function
- `create_event_group` RPC function
- `join_event_group` RPC function
- `leave_event_group` RPC function

## Impact:
- Event Groups UI in `EventDetailsModal` is disabled
- Group chat creation for events is not available
- All RPC calls to `get_event_groups` will return 404 errors (now suppressed)

## Code Changes Made:
1. **`src/services/eventGroupService.ts`**: Added feature flag to immediately return empty arrays without making RPC calls
2. **`src/components/events/EventDetailsModal.tsx`**: Disabled `loadEventGroups()` calls
3. **`src/components/UnifiedChatView.tsx`**: Disabled event_groups table queries, fallback to messages.shared_event_id

## Future Implementation:
If you want to re-implement event groups in 3NF form, you could:

**Option 1: Use existing `chats` table**
- Leverage `chats` table with `is_group_chat = true`
- Store event association in `chats.metadata` JSONB field
- Use `relationships` table with `related_entity_type = 'event_group'` for membership

**Option 2: Create new 3NF-compliant tables**
- Create `event_groups` table with proper FKs to `events` and `users`
- Create `event_group_members` table with FKs to `event_groups` and `users`
- Ensure all columns follow 3NF principles (no redundant data)

## Current Behavior:
- All event group related calls return empty arrays/empty results
- No console errors (calls are suppressed)
- Feature is gracefully disabled throughout the app

