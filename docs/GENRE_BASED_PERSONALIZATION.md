# Genre-Based Personalization — Full Summary

Single reference for everything built for genre-based personalization: 3NF normalization, similarity graph, DAG taxonomy, materialized paths, clusters, feed scoring, and analytics. Includes schemas.

---

## Overview

**Goals**

- **UX / filters:** “Show me all Rock events” = events under the rock path (umbrella + sub-genres).
- **Partners / analytics:** Clean categories and rollups by umbrella or cluster.
- **Personalization:** Feed scores events by user’s genre preferences (umbrella-aware), artist follows, friend interest, **cluster affinity** (genre cluster + country), and other signals.

**Approach**

- **Hybrid:** Human-defined umbrella roots (10–15) and mid-level (50–100); auto-assign long-tail from co-occurrence similarity; multiple parents allowed in the DAG.
- **Storage:** Normalized `genres` + join tables; PMI similarity graph; DAG taxonomy with materialized paths; event/artist clusters; user cluster affinity table.

---

## Phase 1: 3NF Genre Normalization

**Purpose:** One row per unique genre; artists and events linked via join tables. Raw JamBase strings stay on `artists.genres` and `events.genres` for reference.

### Function

| Function | Returns | Purpose |
|----------|---------|---------|
| `normalize_genre_key(raw TEXT)` | TEXT | Lowercase, trim, collapse spaces/dashes for dedup key. |
| `upsert_genre(raw_genre TEXT)` | UUID | Insert or get genre by normalized key; return `genres.id`. |
| `sync_artist_genres(p_artist_id UUID, p_raw_genres TEXT[])` | void | Replace artist’s links in `artists_genres` from raw array. |
| `sync_event_genres(p_event_id UUID, p_raw_genres TEXT[])` | void | Replace event’s links in `events_genres` from raw array. |

### Schema: `genres`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| `name` | TEXT | NOT NULL (e.g. "Hip Hop") |
| `normalized_key` | TEXT | NOT NULL UNIQUE (e.g. "hip hop") |
| `slug` | TEXT | NOT NULL UNIQUE (e.g. "hip-hop") |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() |

Indexes: `idx_genres_normalized_key`, `idx_genres_slug`, `idx_genres_name`.

### Schema: `artists_genres`

| Column | Type | Constraints |
|--------|------|-------------|
| `artist_id` | UUID | NOT NULL, REFERENCES artists(id) ON DELETE CASCADE |
| `genre_id` | UUID | NOT NULL, REFERENCES genres(id) ON DELETE CASCADE |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| — | — | PRIMARY KEY (artist_id, genre_id) |

Indexes: `idx_artists_genres_artist`, `idx_artists_genres_genre`.

### Schema: `events_genres`

| Column | Type | Constraints |
|--------|------|-------------|
| `event_id` | UUID | NOT NULL, REFERENCES events(id) ON DELETE CASCADE |
| `genre_id` | UUID | NOT NULL, REFERENCES genres(id) ON DELETE CASCADE |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| — | — | PRIMARY KEY (event_id, genre_id) |

Indexes: `idx_events_genres_event`, `idx_events_genres_genre`.

**Files:** `sql/genres_schema.sql`, backfill parts 1–4 (or `sql/genre_one_time_full_run.sql`).

---

## Phase 2: Genre Similarity Graph (Co-occurrence + PMI)

**Purpose:** Weighted graph of genre similarity from artist co-occurrence; used for taxonomy parent assignment and (optionally) “similar genres.”

### Materialized view: `genre_cooccurrence_pairs`

| Column | Type |
|--------|------|
| `genre_a` | UUID (genre_id, &lt; genre_b) |
| `genre_b` | UUID |
| `pair_count` | BIGINT |

UNIQUE INDEX on (genre_a, genre_b). Source: `artists_genres` self-join, same artist, genre_a &lt; genre_b.

### Materialized view: `genre_marginals`

| Column | Type |
|--------|------|
| `genre_id` | UUID |
| `artist_count` | BIGINT |

UNIQUE INDEX on (genre_id). Source: `artists_genres` GROUP BY genre_id.

### View: `genre_similarity_pmi`

| Column | Type |
|--------|------|
| `genre_a` | UUID |
| `genre_b` | UUID |
| `pair_count` | BIGINT |
| `pmi` | DOUBLE PRECISION (ln of normalized co-occurrence) |

Source: `genre_cooccurrence_pairs` joined to `genre_marginals` and total artist count; PMI = ln((pair_count * N) / (count_a * count_b)).

### Schema: `genre_similarity_edges`

| Column | Type | Constraints |
|--------|------|-------------|
| `genre_id` | UUID | NOT NULL, REFERENCES genres(id) ON DELETE CASCADE |
| `neighbor_id` | UUID | NOT NULL, REFERENCES genres(id) ON DELETE CASCADE |
| `weight` | DOUBLE PRECISION | NOT NULL (PMI) |
| — | — | PRIMARY KEY (genre_id, neighbor_id), CHECK (genre_id &lt;&gt; neighbor_id) |

Indexes: `idx_genre_similarity_edges_genre`, `idx_genre_similarity_edges_neighbor`. Populated by refresh script (e.g. top 25 neighbors per genre).

**Files:** `sql/genre_similarity_schema.sql`, `sql/genre_similarity_refresh_part1_pairs.sql`, part2_marginals, part3_edges.

---

## Phase 3: DAG Genre Taxonomy

**Purpose:** Hierarchical map of genres with multiple parents; materialized paths for fast “under umbrella” queries and cluster keys.

### Schema: `genre_taxonomy_roots`

| Column | Type | Constraints |
|--------|------|-------------|
| `genre_id` | UUID | PRIMARY KEY, REFERENCES genres(id) ON DELETE CASCADE |

Human-curated umbrella roots (e.g. rock, pop, electronic). Seeded by `genre_taxonomy_seed_umbrellas.sql`.

### Schema: `genre_parent`

| Column | Type | Constraints |
|--------|------|-------------|
| `child_id` | UUID | NOT NULL, REFERENCES genres(id) ON DELETE CASCADE |
| `parent_id` | UUID | NOT NULL, REFERENCES genres(id) ON DELETE CASCADE |
| `confidence` | DOUBLE PRECISION | NOT NULL DEFAULT 1.0 |
| — | — | PRIMARY KEY (child_id, parent_id), CHECK (child_id &lt;&gt; parent_id) |

Indexes: `idx_genre_parent_child`, `idx_genre_parent_parent`. Multiple rows per child = multiple parents.

### Schema: `genre_paths`

| Column | Type | Constraints |
|--------|------|-------------|
| `genre_id` | UUID | NOT NULL, REFERENCES genres(id) ON DELETE CASCADE |
| `path_slug` | TEXT | NOT NULL (e.g. "rock.indie-rock") |
| `depth` | INT | NOT NULL (0 = root) |
| — | — | PRIMARY KEY (genre_id, path_slug) |

Indexes: `idx_genre_paths_genre`, `idx_genre_paths_path_slug` (text_pattern_ops), `idx_genre_paths_depth`. Rebuilt by `genre_taxonomy_build_paths.sql`.

### Schema: `genre_taxonomy_exclude`

| Column | Type | Constraints |
|--------|------|-------------|
| `normalized_key` | TEXT | PRIMARY KEY |

Drop list (junk/non-genre keys). Seeded by `genre_taxonomy_seed_drop_list.sql`.

### Function: `genre_taxonomy_assert_dag(p_child_id UUID, p_parent_id UUID)`

Returns boolean; raises if parent is a descendant of child (would create cycle). Used during parent assignment.

### Function: `get_genres_under_umbrella(p_slug TEXT, p_max_depth INT DEFAULT 5)`

Returns SETOF UUID. All genre IDs whose path_slug equals p_slug or starts with p_slug and depth ≤ p_max_depth; excludes drop list. Used for “all Rock events” and umbrella expansion in feed.

### View: `genre_cluster_keys`

| Column | Type |
|--------|------|
| `genre_id` | UUID |
| `umbrella_slug` | TEXT (first segment of path_slug) |
| `cluster_path_slug` | TEXT (path_slug or first two segments) |

One row per genre (best path by depth); only genres with artist_count ≥ 5 and not in exclude. Used for event/artist clusters and analytics.

**Files:** `sql/genre_taxonomy_schema.sql`, `genre_taxonomy_seed_drop_list.sql`, `genre_taxonomy_seed_umbrellas.sql`, `genre_taxonomy_seed_mid_level.sql`, `genre_taxonomy_assign_from_similarity.sql`, `genre_taxonomy_build_paths.sql`, `genre_taxonomy_helpers.sql`.

---

## Fast Paths, Clusters, and Feed Integration

**Purpose:** Use taxonomy and clusters in APIs and the main feed: path-based calendar filter, event/artist clusters, user cluster affinity, feed scoring (cluster + umbrella genre), and analytics rollups.

### Calendar: path-based genre filter

**RPC:** `get_calendar_events(..., p_umbrella_slug TEXT DEFAULT NULL, p_max_depth INT DEFAULT 5)`

When `p_umbrella_slug` is set, events are filtered via `events_genres` and `get_genres_under_umbrella(p_umbrella_slug, p_max_depth)` instead of raw `e.genres && p_genres`. Backward-compatible 6-param overload calls the 8-param version with NULL umbrella.

**File:** `supabase/migrations/20260129100000_calendar_events_umbrella_filter.sql`. Client: single-genre filter sends umbrella slug (e.g. MapCalendarTourSection).

### View: `event_clusters`

| Column | Type |
|--------|------|
| `event_id` | UUID |
| `cluster_path_slug` | TEXT |
| `country` | TEXT (from venues.country) |

One row per (event, cluster_path_slug, country). Source: `events` → `events_genres` → `genre_cluster_keys`, LEFT JOIN `venues`.

### View: `artist_clusters`

| Column | Type |
|--------|------|
| `artist_id` | UUID |
| `cluster_path_slug` | TEXT |

One row per (artist, cluster_path_slug). Source: `artists` → `artists_genres` → `genre_cluster_keys`.

**File:** `supabase/migrations/20260129100001_event_artist_clusters_views.sql`.

### Schema: `user_cluster_affinity`

| Column | Type | Constraints |
|--------|------|-------------|
| `user_id` | UUID | NOT NULL, REFERENCES auth.users(id) ON DELETE CASCADE |
| `cluster_path_slug` | TEXT | NOT NULL |
| `country` | TEXT | NOT NULL DEFAULT '' |
| `score` | NUMERIC | NOT NULL DEFAULT 0 |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| — | — | PRIMARY KEY (user_id, cluster_path_slug, country) |

Indexes: `idx_user_cluster_affinity_user`, `idx_user_cluster_affinity_cluster_country`. RLS: users can SELECT own rows.

**Function:** `refresh_user_cluster_affinity()` — repopulates from `user_event_relationships` (going/maybe) + `event_clusters`. Run after taxonomy rebuild or periodically.

**File:** `supabase/migrations/20260129100002_user_cluster_affinity.sql`.

### Feed: cluster match + umbrella-aware genre score

**RPC:** `get_personalized_feed_v3` (in `20251221162000_ensure_personalized_feed_v3_exists.sql` and `20260129100003_feed_v3_cluster_umbrella.sql`).

**New CTEs:**

- **event_cluster_scores:** Per-event sum of `user_cluster_affinity.score` where (cluster_path_slug, country) matches the event’s clusters. Joined to event_candidates.
- **user_umbrella_genre_ids:** Set of genre IDs under the same umbrella as each key in `user_preferences.genre_preferences` (via `genres` → `genre_paths` → `get_genres_under_umbrella(split_part(path_slug, '.', 1), 5)`).

**New score terms in `scored_events`:**

- **Cluster:** `LEAST(COALESCE(ecs.cluster_score, 0) * 2, 20)`.
- **Umbrella genre:** `+15` when the event has any `events_genres.genre_id` IN `user_umbrella_genre_ids`.

Existing signals (artist follow, friend interest, raw genre_preferences, promoted, recency, distance, ticket_available) unchanged.

### Analytics rollups

| View | Columns | Purpose |
|------|---------|---------|
| `analytics_events_by_cluster` | cluster_path_slug, country, event_count | Event counts by cluster + country. |
| `analytics_events_by_umbrella` | umbrella_slug, event_count | Event counts by umbrella. |
| `analytics_artists_by_cluster` | cluster_path_slug, artist_count | Artist counts by cluster. |

**File:** `supabase/migrations/20260129100004_analytics_rollups_by_cluster.sql`.

---

## Run Order (SQL + Migrations)

1. **Genre pipeline (sql/)** — run before or ensure objects exist for migrations that depend on them:
   - `genres_schema.sql` → backfill parts 1–4 (or `genre_one_time_full_run.sql`)
   - `genre_similarity_schema.sql` → refresh parts 1–3
   - `genre_taxonomy_schema.sql` → seed_drop_list → seed_umbrellas → seed_mid_level → assign_from_similarity → build_paths → genre_taxonomy_helpers
2. **Supabase migrations (order):**
   - `20260129100000_calendar_events_umbrella_filter.sql`
   - `20260129100001_event_artist_clusters_views.sql`
   - `20260129100002_user_cluster_affinity.sql`
   - `20260129100003_feed_v3_cluster_umbrella.sql` (if feed v3 already existed)
   - `20260129100004_analytics_rollups_by_cluster.sql`
3. **After taxonomy/path rebuild:** run `refresh_user_cluster_affinity()`.

See `sql/GENRE_SQL_RUN_ORDER.md` for the full genre SQL list and links.

---

## Data Flow (High Level)

```
artists.genres / events.genres (raw)
    → normalize + upsert → genres, artists_genres, events_genres
         → genre_cooccurrence_pairs, genre_marginals, genre_similarity_edges
              → genre_taxonomy_roots + genre_parent (seeded + assigned)
                   → genre_paths, get_genres_under_umbrella, genre_cluster_keys
                        → event_clusters, artist_clusters
                             → user_cluster_affinity (refresh from user_event_relationships)
                                  → get_personalized_feed_v3 (cluster + umbrella genre score)
get_calendar_events(p_umbrella_slug) → get_genres_under_umbrella + events_genres
analytics_events_by_cluster / by_umbrella, analytics_artists_by_cluster
```
