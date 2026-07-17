# Event de-duplication — 2026-07-17

Removes ~6,866 duplicate event rows (same artist + venue + exact timestamp) with
**zero data loss**, and prevents them from ever coming back. Review-only SQL — you apply.

## What's a duplicate here (and what ISN'T)
- Duplicate = 2+ event rows for the identical `(artist_id, venue_id, event_date TIMESTAMP)`.
  Because it keys on the **exact timestamp**, different showtimes of a residency
  (ABBA Voyage, etc.) are separate slots and are **never merged**.
- Canonical kept per group = the row **with** a `jambase_id` (else the oldest).
- Groups with **2+ different `jambase_id`s** at one slot are **ambiguous → skipped**, untouched.
- The ~112K legacy events that have no twin are **left alone** — they're real events.

## Root cause & why it won't recur
The sync (`scripts/sync-jambase-incremental-3nf.mjs`) already **skips events with no
jambase_id** and **upserts on jambase_id** — so it can't create NEW null-id rows or
JamBase duplicates (0 in the last 2 months). The 6,866 are legacy residue from an old
import that predated `jambase_id`. The only remaining path is a leftover legacy null-id
*upcoming* event (there are ~13.6K) getting a JamBase twin later — closed by the guards below.

## Apply order (small operations — the editor is fine this time)
Almost nothing attaches to the dups (0 reviews/media/shares, 15 "interested" flags), so
each step is quick. Run each file's steps in order; check the VERIFY output before moving on.

1. **`01_build_map.sql`** — builds `event_dedup_map` (dup → canonical). Read-only + one work table.
2. **`02_repoint.sql`** — repoints interests/reviews/media/reminders/shares onto canonicals (collision-safe). VERIFY must be all zeros.
3. **`03_backup_delete.sql`** — snapshots dups into `events_dedup_backup`, then deletes them. Backup kept for restore.
4. **`04_prevent.sql`** — adds the partial UNIQUE index (`events_null_slot_uidx`) + the `merge_null_id_event_duplicates()` function. **Apply this BEFORE deploying the sync change** (the sync calls the function).
5. **Deploy the sync change** — already written in `upsertEvents3NF`: after each upsert it calls `merge_null_id_event_duplicates(<upserted ids>)` to merge any legacy null-id twin into the canonical. It's wrapped in try/catch (non-fatal), so it can never break the sync even if applied before file 04.

## Safety
- Only duplicate event *rows* are deleted, after every reference is repointed and verified,
  and after a full-row backup (`events_dedup_backup`).
- FK guardrail: `messages.shared_event_id` is NO ACTION — the delete errors rather than
  silently breaking a share if anything was missed (02 repoints them, so it won't trigger).
- Ambiguous / twin-less events are never touched.

## Expected result
events: ~251,413 → ~244,547 rows. All reviews, interests, media, and JamBase links preserved
(repointed onto the surviving canonical event). Duplicates can't re-form.
