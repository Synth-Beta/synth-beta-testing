-- bucket_list had no uniqueness guarantee on (user_id, entity_id), so the same
-- artist/venue could be inserted more than once (confirmed: one user has the
-- same entity_id 3x). Clean up existing duplicates, then add a constraint so
-- it can't happen again - the app's existing 23505 "already in list" handling
-- in addArtist/addVenue will now actually take effect.

-- Keep the earliest add per (user_id, entity_id); drop the rest.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, entity_id
           ORDER BY added_at ASC, id ASC
         ) AS rn
  FROM public.bucket_list
)
DELETE FROM public.bucket_list
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE public.bucket_list
ADD CONSTRAINT bucket_list_user_entity_unique UNIQUE (user_id, entity_id);
