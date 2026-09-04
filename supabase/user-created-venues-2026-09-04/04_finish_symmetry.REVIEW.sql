-- REVIEW ONLY - do not run until approved. Run after 02 + 03.
--
-- Completes the two items 02 deferred. Both were gated on counts that 03
-- returned as 0 on 2026-09-04, so both are now safe:
--
--   reviews_with_no_venue_and_no_event        = 0  -> (a) validates cleanly
--   custom_venue_reviews_outside_unique_index = 0  -> (b) is contentless
--
-- `reviews` holds 54 rows, so the index rebuild in (b) is sub-second; no
-- CONCURRENTLY dance needed. Still run statement by statement — the Supabase
-- editor wraps a multi-statement paste in one transaction.


-- (a) Venue twin of reviews_artist_or_user_created_check.
--
-- The artist side already guarantees that a review with no event names exactly
-- one artist. Without this, the venue side has no such guarantee: a review can
-- carry no venue at all, or both a catalog venue and a custom one, and only
-- client-side JS (eventReviewSubmitService.ts:323) says otherwise.
--
-- Applies to drafts too, exactly like the artist constraint. That is safe here:
-- the 03 count covered every row including drafts, and both submit paths refuse
-- to save without a venue (submitEventReviewFromForm.ts:203).
--
-- Re-check immediately before running — a review written between 03 and now
-- would abort the ALTER:
--   select count(*) from public.reviews where event_id is null and venue_id is null;

alter table public.reviews
  add constraint reviews_venue_or_user_created_check
  check (
    event_id is not null
    or (venue_id is not null and user_created_venue_id is null)
    or (venue_id is null and user_created_venue_id is not null)
  );


-- (b) Teach the published-review dedup index about custom venues.
--
-- reviews_user_id_artist_or_custom_venue_id_unique keys on `venue_id` alone
-- despite its name, so a custom-venue review sits outside the index entirely
-- and two published reviews for the same artist at the same custom venue would
-- both be accepted. COALESCE'ing the two venue columns closes that, and matches
-- how the artist half of the same index already works.
--
-- Contentless today: no row has user_created_venue_id, so
-- COALESCE(venue_id, user_created_venue_id) equals venue_id for every existing
-- row and the rebuilt index has identical contents.
--
-- Run these three as separate statements.

drop index if exists public.reviews_user_id_artist_or_custom_venue_id_unique;

create unique index reviews_user_id_artist_or_custom_venue_id_unique
  on public.reviews (
    user_id,
    coalesce(artist_id, user_created_artist_id),
    coalesce(venue_id, user_created_venue_id)
  )
  where event_id is null
    and is_draft = false
    and coalesce(artist_id, user_created_artist_id) is not null
    and coalesce(venue_id, user_created_venue_id) is not null;

comment on index public.reviews_user_id_artist_or_custom_venue_id_unique is
  'One published review per (user, artist, venue) when not tied to an event. COALESCEs the catalog and user-created columns on both sides.';
