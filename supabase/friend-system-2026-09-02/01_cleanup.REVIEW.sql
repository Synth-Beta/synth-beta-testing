-- REVIEW ONLY - do not run until approved. Read-only preview first, writes commented.
--
-- Two small inconsistencies, all six rows from user `sloiterstein` on 2026-02-05, which
-- looks like one old dev/test session rather than an ongoing defect. Current friend
-- traffic is clean: 46 accepted pairs in user_relationships match 46 rows in friends
-- exactly, both directions, with no self-rows and no duplicate pending pairs.

-- 1. PREVIEW - pending friend requests between users who are ALREADY friends.
--    Whoever sent these sees a stuck "Requested" button that can never resolve, because
--    the pair is already in `friends` and the request row was never closed out.
SELECT ur.id, su.username AS sender, ru.username AS receiver, ur.created_at
FROM public.user_relationships ur
JOIN public.users su ON su.user_id = ur.user_id
JOIN public.users ru ON ru.user_id = ur.related_user_id
WHERE ur.relationship_type = 'friend'
  AND ur.status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.friends f
    WHERE (f.user1_id = ur.user_id       AND f.user2_id = ur.related_user_id)
       OR (f.user1_id = ur.related_user_id AND f.user2_id = ur.user_id)
  );

  

-- 3. THE FIX for #1: DELETE the duplicate, do not promote it.
--    Each of these pending rows has a twin `accepted` row in the reverse direction that
--    predates it - the friendship is already recorded, and this row was created on top of
--    it. Setting status = 'accepted' therefore violates unique_friendship_bidirectional
--    (LEAST(user_id, related_user_id), GREATEST(...), relationship_type), which exists to
--    keep exactly one row per pair. The duplicate carries no history worth keeping.
DELETE FROM public.user_relationships ur
WHERE ur.relationship_type = 'friend'
  AND ur.status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.user_relationships other
    WHERE other.id <> ur.id
      AND other.relationship_type = 'friend'
      AND other.status = 'accepted'
      AND LEAST(other.user_id, other.related_user_id) = LEAST(ur.user_id, ur.related_user_id)
      AND GREATEST(other.user_id, other.related_user_id) = GREATEST(ur.user_id, ur.related_user_id)
  );

-- 4. THE FIX for #2: these three store sloiterstein's *user id* in request_id where a
--    relationship id belongs, so they were never resolvable and nothing can repair them.
--    65 of the 68 friend_request notifications carry a valid id and all three bad ones are
--    from 2026-02-05, so the write path is not still producing this shape.
DELETE FROM public.notifications n
WHERE n.type = 'friend_request'
  AND n.data->>'request_id' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_relationships ur
    WHERE ur.id::text = n.data->>'request_id'
  );

-- 5. VERIFY: both preview queries above should return 0 rows.
