-- ============================================================================
-- Purge bot messages from all chats. Keep every human message.
-- 2026-08-24 -- FOR REVIEW. Run statement-by-statement. Nothing here is applied.
-- ============================================================================
--
-- WHAT COUNTS AS A BOT MESSAGE
--   messages.sender_id -> users.user_id where users.is_bot = true
--
--   Two writers produce them:
--     * api/_lib/cron/seedBotMessages.ts   -- daily genre-chat questions.
--       Tags metadata with {"bot_seed": true, "batch": "daily"}.
--       Sender pool: users WHERE is_bot = true  (seedBotMessages.ts:64)
--     * api/_lib/aiSceneGuides/*           -- scene guide seeding.
--       Sender pool prefers is_ai_scene_guide = true, FALLS BACK to is_bot
--       (cronScheduler.ts:139, qualitySeed.ts:64)
--
--   So sender-based (STEP 2A) catches both writers. The metadata marker
--   (STEP 2B) catches ONLY the daily seeder. 2A is what "only bot messages,
--   start from scratch" means -- 2B is offered for the narrower case.
--
-- NOT AFFECTED
--   seedBotMessages only touches chats.updated_at after inserting -- cosmetic,
--   no message counter or last_message pointer to repair. Deleting leaves the
--   chats themselves intact; only their updated_at is now slightly ahead of
--   their newest surviving message.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 0a (read-only, REQUIRED). What will be deleted? Run BEFORE anything.
-- ----------------------------------------------------------------------------
SELECT
  count(*) FILTER (WHERE u.is_bot)                                AS bot_sender_messages,
  count(*) FILTER (WHERE m.metadata->>'bot_seed' = 'true')        AS metadata_tagged,
  count(*) FILTER (WHERE u.is_bot AND m.metadata->>'bot_seed' IS DISTINCT FROM 'true')
                                                                  AS bot_sender_untagged,
  count(*)                                                        AS total_messages,
  count(DISTINCT m.chat_id) FILTER (WHERE u.is_bot)               AS chats_touched
FROM public.messages m
LEFT JOIN public.users u ON u.user_id = m.sender_id;


-- ----------------------------------------------------------------------------
-- STEP 0b (read-only, REQUIRED). Does anything reference messages?
-- If a child table has ON DELETE NO ACTION/RESTRICT the delete will FAIL; if it
-- CASCADEs, those child rows go too. Either way know it before deleting, not
-- after. Send me the output if anything unexpected shows up.
-- ----------------------------------------------------------------------------
SELECT
  tc.table_name  AS child_table,
  kcu.column_name AS child_column,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'messages'
  AND tc.table_schema = 'public';


-- ----------------------------------------------------------------------------
-- STEP 0c (read-only). Sanity-check the bot roster itself. If this returns
-- users you did NOT expect to be bots, STOP -- is_bot is the delete key, and a
-- mislabelled real account would lose its messages.
-- ----------------------------------------------------------------------------
 

-- ----------------------------------------------------------------------------
-- STEP 1. NO BACKUP -- REMOVED ON PURPOSE (user decision, 2026-08-24).
--
-- A backup table was offered and explicitly declined: the bot messages are not
-- wanted in any form. There is therefore NO UNDO for STEP 2A. Once it runs the
-- 332 rows are gone; the only way back is re-seeding fresh ones from the cron.
--
-- If a backup table was already created earlier, remove it too:
--     DROP TABLE IF EXISTS public.messages_bot_purge_backup_20260824;
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.messages_bot_purge_backup_20260824;


-- ----------------------------------------------------------------------------
-- STEP 2A. THE DELETE -- all messages sent by bot accounts.
-- PERMANENT AND UNRECOVERABLE. Confirm STEP 0a/0b/0c look right first:
-- expect 332 bot messages, 184 human messages untouched, 8 bot accounts.
-- ----------------------------------------------------------------------------
DELETE FROM public.messages m
USING public.users u
WHERE u.user_id = m.sender_id
  AND u.is_bot = true;


-- ----------------------------------------------------------------------------
-- STEP 2B. ALTERNATIVE, narrower -- ONLY the daily seeded questions, leaving
-- any other bot-sent message alone. Use INSTEAD OF 2A, not as well.
-- ----------------------------------------------------------------------------
-- DELETE FROM public.messages
-- WHERE metadata->>'bot_seed' = 'true';


-- ----------------------------------------------------------------------------
-- STEP 3. Verify. Expect 0.
-- ----------------------------------------------------------------------------
SELECT count(*) AS remaining_bot_messages
FROM public.messages m
JOIN public.users u ON u.user_id = m.sender_id
WHERE u.is_bot = true;


-- ----------------------------------------------------------------------------
-- STEP 4 (REQUIRED after 2A). Repair chats.latest_message_id.
--
-- STEP 0b confirmed the only FK into messages is chats.latest_message_id with
-- ON DELETE SET NULL. So every chat whose newest message was a bot message now
-- points at NULL and its preview row goes blank in the chat list, even though
-- older human messages are still there. Repoint each to its newest SURVIVING
-- message. Chats left with no messages at all correctly stay NULL.
-- ----------------------------------------------------------------------------
UPDATE public.chats c
SET latest_message_id = newest.id
FROM (
  SELECT DISTINCT ON (chat_id) chat_id, id
  FROM public.messages
  ORDER BY chat_id, created_at DESC, id DESC
) newest
WHERE newest.chat_id = c.id
  AND c.latest_message_id IS DISTINCT FROM newest.id;

-- Expect 0: any chat still NULL but holding messages.
SELECT count(*) AS chats_needing_repair
FROM public.chats c
WHERE c.latest_message_id IS NULL
  AND EXISTS (SELECT 1 FROM public.messages m WHERE m.chat_id = c.id);


-- ----------------------------------------------------------------------------
-- IF is_ai_scene_guide EXISTS AND SOME GUIDES ARE NOT is_bot
-- cronScheduler.ts prefers that column "if column exists". Check for guides
-- that would survive STEP 2A:
--
--   SELECT count(*) FROM public.messages m
--   JOIN public.users u ON u.user_id = m.sender_id
--   WHERE u.is_ai_scene_guide = true AND COALESCE(u.is_bot, false) = false;
--
-- If that is > 0 and you want them gone too, widen 2A's predicate to
--   AND (u.is_bot = true OR u.is_ai_scene_guide = true)
-- (no backup to widen -- see STEP 1).
-- ----------------------------------------------------------------------------
