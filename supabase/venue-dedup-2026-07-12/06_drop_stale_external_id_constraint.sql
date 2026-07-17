-- =============================================================================
-- 06 — Drop the stale "one external-id per entity" constraint  (post venue-dedup)
-- =============================================================================
-- external_entity_ids has UNIQUE (entity_uuid, source, entity_type), which enforces
-- "a venue may have only ONE JamBase venue id". That was true before venue dedup,
-- but dedup collapses duplicate venue rows into one canonical — and JamBase often
-- lists the same physical venue under several venue ids, all of which now resolve
-- to that one canonical. So this constraint is now WRONG: it blocks the sync from
-- recording the extra id -> venue mappings (error 23505 on
-- external_entity_ids_entity_source_type_uniq).
--
-- The external-id -> entity lookups only need external_id to be unique, which is
-- still guaranteed by UNIQUE (source, entity_type, external_id). Dropping the
-- reverse constraint is safe and lets many external ids map to one venue.
--
-- (The sync already tolerates this constraint via a non-fatal skip, so it will run
--  without this change — but dropping it lets the extra mappings persist so future
--  syncs resolve those ids directly instead of re-deriving them each run.)
-- -----------------------------------------------------------------------------

-- DRY RUN — confirm the constraints (you should see the entity_source_type one)
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid='public.external_entity_ids'::regclass AND contype='u'
ORDER BY conname;

-- APPLY
ALTER TABLE public.external_entity_ids
  DROP CONSTRAINT IF EXISTS external_entity_ids_entity_source_type_uniq;

-- OPTIONAL — there are also two IDENTICAL external-id uniqueness constraints
-- (same columns, different order). Keep one, drop the redundant one to save a
-- duplicate index's write cost:
--   ALTER TABLE public.external_entity_ids
--     DROP CONSTRAINT IF EXISTS external_entity_ids_entity_type_source_external_id_key;
-- (leaves external_entity_ids_source_type_external_id_uniq enforcing uniqueness)

-- VERIFY — external_id uniqueness still enforced, entity constraint gone
SELECT conname FROM pg_constraint
WHERE conrelid='public.external_entity_ids'::regclass AND contype='u'
ORDER BY conname;

-- ROLLBACK:
--   ALTER TABLE public.external_entity_ids
--     ADD CONSTRAINT external_entity_ids_entity_source_type_uniq UNIQUE (entity_uuid, source, entity_type);
