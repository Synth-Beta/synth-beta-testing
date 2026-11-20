# Performance pass — 2026-11-19

## What to run, in order

1. **Migration `migrations/20261119120000_faster_catalog_search.sql`**: faster, more relevant
   artist / venue / event / people search. Same function names and outputs, so the apps need no
   change to benefit (they are also updated in this branch). Self-contained: it also creates
   everything from `20260914190000_forgiving_catalog_search.sql` (pg_trgm, match-score helpers,
   trigram indexes, `search_users_fuzzy`), which was never applied to production. Builds indexes
   on artists/venues/users/events, which briefly blocks writes to those tables: run at a quiet time.
2. **Migration `migrations/20261119121000_artist_upcoming_events_nearby.sql`**: artist page
   "nearest shows first, then by date". The apps fall back to sorting on the device until it
   is deployed.
3. **`02_add_missing_hot_path_indexes.sql`** (this folder): adds indexes for chats, friends,
   reviews and notifications **only where none exists**. Prints what it did. Safe to re-run.
4. **`01_find_slow_queries.sql`** (this folder, read-only): shows what is actually slow in
   production (feed, calendar, chats). Run this and share the output plus
   `\sf public.get_personalized_feed_v5` to tune them next.

## Search: what was wrong

| Problem | Effect | Fix |
|---|---|---|
| Event search took an arbitrary 200 rows per branch *before* ranking, then sorted oldest-first | "taylor swift": **0 of 40** results were upcoming; exact-match shows could be missing entirely | Find best artists/venues first, then pull each one's next shows via the `(artist_id, event_date)` index. Upcoming first (soonest), then recent past |
| 2-letter queries ("ta") scored every name containing those letters | slowest on the first keystrokes | Prefix lookup on a new btree index |
| Fuzzy-matching partial words ("the ka") rechecked ~55k names | 384 ms | Typo matching only once every word is 3+ letters (prefix lookup covers the rest) |
| Typo queries matching hundreds of names kept an arbitrary subset | right artist could be dropped | Keep the matches with the most upcoming shows |
| Web artist search made a 2nd round trip downloading every upcoming event row to count them | extra latency on every search | SQL returns live counts; client query removed |

## Measured (synthetic catalog: 200k artists, 25k venues, 1.66M events; median of 3, ms)

| query | artists before → after | venues before → after | events before → after |
|---|---|---|---|
| `ta` | 49 → **5** | 12 → **1** | 80 → **39** |
| `tay` | 72 → **17** | 5 → 10 | 58 → **46** |
| `taylor` | 28 → 22 | 5 → 6 | 100 → **75** |
| `taylor swift` | 101 → **83** | 17 → 14 | 100 → 146 * |
| `teylor swft` (typo) | 59 → 68 | 17 → 13 | 117 → 111 * |
| `the` | 137 → **56** | 49 → **10** | 19 → 112 * |
| `the ka` | 384 → **19** | 88 → **1** | 30 → 76 * |
| `phish` | 30 → **23** | 5 → 6 | 119 → **76** |
| `grateful` | 2 → 2 | 1 → 2 | 5 → 34 * |

\* The old event search was sometimes faster only because it stopped at the first 200
arbitrary rows — which is exactly why its results were wrong (mostly past shows, real
matches missing). Every event query now returns upcoming shows first.

Real-world latency also improves from the app changes in this branch:
- Mobile shows each result type as soon as it arrives instead of waiting for the slowest.
- A slow earlier request can no longer overwrite newer results (mobile).
- Switching result tabs on web no longer re-runs all four searches.
- Repeat searches within 60 s (backspacing, retyping, reopening) are answered from memory.
