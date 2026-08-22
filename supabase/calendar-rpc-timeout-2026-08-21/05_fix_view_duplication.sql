-- events_with_artist_venue returns every affected event TWICE — PROPOSED FIX, 2026-08-22
--
-- ⚠ REVIEW BEFORE APPLYING. Not run against the database.
--
-- ===========================================================================
-- CONFIRMED CAUSE: the venue join to external_entity_ids fans out
-- ===========================================================================
-- The view joins external_entity_ids three times to expose jambase ids:
--
--   LEFT JOIN external_entity_ids eei_venue
--     ON eei_venue.entity_uuid = eb.venue_id
--    AND eei_venue.entity_type = 'venue' AND eei_venue.source = 'jambase'
--
-- That join has no guarantee of one row per entity, and for venues there isn't one:
--
--   entity_type | source  | mappings | entities | excess
--   ------------+---------+----------+----------+-------
--   event       | jambase |  266,136 |  266,136 |      0   <- clean
--   artist      | jambase |   47,703 |   47,703 |      0   <- clean
--   artist      | spotify |    7,709 |    7,709 |      0   <- clean
--   venue       | jambase |   29,407 |   23,085 |  6,322   <- fans out
--
-- Only the venue join multiplies. Every event held at one of those ~6,322
-- twice-mapped venues is emitted twice by the view.
--
-- This is fallout from the 2026-07-12 venue dedup: 533,313 venues collapsed to
-- 24,991, so one canonical venue legitimately carries several jambase ids, and
-- upsertExternalId was deliberately made to tolerate that. The mappings are correct.
-- The VIEW is what is wrong for assuming one.
--
-- ⚠ DO NOT "fix" this by deleting the extra external_entity_ids rows. The sync
--   resolves incoming jambase venue ids through that table; dropping the alternate
--   ids would make those venues unresolvable and re-duplicate them on next sync.
--
-- Blast radius: this view backs the home feed, profile, reviews, matching, chat
-- event cards, connect, and artist-follow lookups across web. Anything counting or
-- listing from it is double-counting today.

-- ===========================================================================
-- FIX: collapse each external-id join to one deterministic row
-- ===========================================================================
-- LEFT JOIN LATERAL ... LIMIT 1 keeps the "one row per event" guarantee no matter
-- how many mappings an entity accumulates. Applied to all three joins, not just
-- venue: artist and event are 1:1 today, but nothing enforces it and the sync is
-- explicitly permissive about multi-mapping.
--
-- Which id wins is arbitrary — every mapped id resolves to the same canonical
-- entity — so the ordering exists only to make the result stable across runs.
-- (Today's behaviour is worse than arbitrary: with duplicate rows, consumers taking
-- [0] get whichever row the planner happened to emit first.)
--
-- Column list, order, and types are unchanged, which is what CREATE OR REPLACE VIEW
-- requires. The event_base CTE is preserved as-is; it does nothing useful but
-- removing it is a separate change and not this fix's business.

CREATE OR REPLACE VIEW public.events_with_artist_venue AS
 WITH event_base AS (
         SELECT e.id, e.title, e.description, e.event_date, e.doors_time,
            e.venue_city, e.venue_state, e.venue_address, e.venue_zip,
            e.latitude, e.longitude, e.external_url, e.artist_id, e.venue_id,
            e.is_promoted, e.promotion_tier, e.is_user_created, e.created_by_user_id,
            e.source, e.genres, e.ticket_available, e.price_range, e.price_min,
            e.price_max, e.price_currency, e.ticket_urls, e.setlist, e.tour_name,
            e.event_status, e.images, e.is_featured, e.featured_until,
            e.created_at, e.updated_at, e.media_urls, e.last_modified_at,
            e.event_media_url
           FROM events e
        )
 SELECT eb.id,
    eb.title,
    eb.description,
    eb.event_date,
    eb.doors_time,
    eb.venue_city,
    eb.venue_state,
    eb.venue_address,
    eb.venue_zip,
    eb.latitude,
    eb.longitude,
    eb.external_url,
    eb.artist_id,
    eb.venue_id,
    eb.is_promoted,
    eb.promotion_tier,
    eb.is_user_created,
    eb.created_by_user_id,
    eb.source,
    eb.genres,
    eb.ticket_available,
    eb.price_range,
    eb.price_min,
    eb.price_max,
    eb.price_currency,
    eb.ticket_urls,
    eb.setlist,
    eb.tour_name,
    eb.event_status,
    eb.images,
    eb.is_featured,
    eb.featured_until,
    eb.created_at,
    eb.updated_at,
    eb.media_urls,
    eb.last_modified_at,
    eb.event_media_url,
    a.name AS artist_name_normalized,
    a.image_url AS artist_image_url,
    a.genres AS artist_genres,
    v.name AS venue_name_normalized,
    NULL::text AS venue_address_normalized,
    NULL::text AS venue_city_normalized,
    NULL::text AS venue_state_normalized,
    NULL::text AS venue_zip_normalized,
    eei_artist.external_id AS artist_jambase_id,
    eei_venue.external_id AS venue_jambase_id,
    eei_event.external_id AS event_jambase_id
   FROM event_base eb
     LEFT JOIN artists a ON eb.artist_id = a.id
     LEFT JOIN venues v ON eb.venue_id = v.id
     LEFT JOIN LATERAL (
        SELECT x.external_id
        FROM external_entity_ids x
        WHERE x.entity_uuid = eb.artist_id
          AND x.entity_type = 'artist'::text
          AND x.source = 'jambase'::text
        ORDER BY x.created_at DESC, x.external_id DESC
        LIMIT 1
     ) eei_artist ON true
     LEFT JOIN LATERAL (
        SELECT x.external_id
        FROM external_entity_ids x
        WHERE x.entity_uuid = eb.venue_id
          AND x.entity_type = 'venue'::text
          AND x.source = 'jambase'::text
        ORDER BY x.created_at DESC, x.external_id DESC
        LIMIT 1
     ) eei_venue ON true
     LEFT JOIN LATERAL (
        SELECT x.external_id
        FROM external_entity_ids x
        WHERE x.entity_uuid = eb.id
          AND x.entity_type = 'event'::text
          AND x.source = 'jambase'::text
        ORDER BY x.created_at DESC, x.external_id DESC
        LIMIT 1
     ) eei_event ON true;

-- ===========================================================================
-- VERIFY
-- ===========================================================================
-- Expect zero rows.
SELECT id, count(*) AS copies
FROM public.events_with_artist_venue
GROUP BY id
HAVING count(*) > 1
LIMIT 20;

-- Expect these two to match exactly.
SELECT
  (SELECT count(*) FROM public.events_with_artist_venue) AS view_rows,
  (SELECT count(*) FROM public.events)                   AS base_rows;

-- INDEX SUPPORT — CHECKED 2026-08-22, no new index needed.
--   external_entity_ids_entity_idx ON (entity_uuid)
-- Each entity_uuid holds only one or two rows (an artist can carry a jambase and a
-- spotify mapping), so this probe lands on ~1 row and the entity_type/source
-- predicates filter on the heap for free. A composite (entity_uuid, entity_type,
-- source) would buy almost nothing and cost writes on a table the sync hammers.
--
-- TRADE-OFF, stated plainly: LATERAL ... LIMIT 1 forces a nested loop — one probe
-- per event per join. That is the right shape for how this view is actually queried
-- (filtered by id/artist/venue, with limits) but it is worse than a hash join for an
-- unfiltered full-table scan of the view. Full scans of this view are already
-- pathological — filtering and ordering it on event_date times out today — so this
-- optimises the case that exists. If a genuine full-scan consumer shows up later,
-- the alternative shape is a DISTINCT ON (entity_uuid) subquery joined normally,
-- which hash-joins well but makes single-row lookups much worse.
