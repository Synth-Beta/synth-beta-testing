# Genre DAG Taxonomy — Spec & Implementation

**Goal 3: UX, Filters, Analytics, Storytelling** — *How do humans understand 2,500 genres?*

---

## What it is

- **Hierarchical map of genres** (root → mid → long-tail).
- **Multiple parents allowed** (realistic): e.g. *Acid Rock* under *Psychedelic Rock* and under *Experimental Rock*.
- **Example:**
  - Rock → Psychedelic Rock → Acid Rock  
  - Acid Rock → Experimental Rock (second parent)

## Why it matters

| Need | Use |
|------|-----|
| **Users** | Simple filters (e.g. “Rock”, “Electronic”) |
| **Partners** | Clean categories for reporting |
| **Analytics** | Rollups by umbrella / cluster |
| **Reality** | Pure ML cannot solve this alone — hybrid human + data |

---

## How we implement (hybrid)

| Layer | Approach | Implementation |
|-------|----------|----------------|
| **Top** | Manually define 10–15 umbrellas | `genre_taxonomy_roots` + `genre_taxonomy_seed_umbrellas.sql` |
| **Mid** | Manually define 50–100 mid-level genres | `genre_taxonomy_seed_mid_level.sql` (child → parent into `genre_parent`) |
| **Long-tail** | Auto-assign from similarity | `genre_taxonomy_assign_from_similarity.sql` (embedding/co-occurrence, confidence score) |
| **Multiple parents** | When similarity supports it | Assign script adds top-k parents per genre (not just one) |

---

## Storage

| Artifact | Purpose |
|----------|---------|
| **`genre_parent`** | `(child_id, parent_id, confidence)` — DAG edges; multiple rows per child = multiple parents |
| **`genre_paths`** | Materialized root→genre paths for fast “under umbrella” and filter queries |
| **`genre_taxonomy_roots`** | Umbrella genre IDs (roots of the DAG) |
| **`genre_taxonomy_exclude`** | Drop list (junk/non-genre normalized_key) |

---

## Implementation checklist

- [x] DAG schema: `genre_parent`, cycle check (`genre_taxonomy_assert_dag`)
- [x] 10–15 umbrellas: seeded in `genre_taxonomy_seed_umbrellas.sql` (currently 21; can trim)
- [x] Auto-assign long-tail: similarity-based, with confidence
- [x] Materialized paths: `genre_taxonomy_build_paths.sql`, `get_genres_under_umbrella()`, `genre_cluster_keys`
- [x] **Mid-level manual (50–100):** `genre_taxonomy_seed_mid_level.sql` — add (child, parent) pairs; run after umbrellas, before assign
- [x] **Multiple parents:** Assign script uses top-k parents per genre (default 3, `v_min_weight` 0.3) when above threshold

---

## Run order (taxonomy)

1. `genre_taxonomy_schema.sql`
2. `genre_taxonomy_seed_drop_list.sql`
3. `genre_taxonomy_seed_umbrellas.sql`
4. **`genre_taxonomy_seed_mid_level.sql`** ← mid-level manual
5. `genre_taxonomy_assign_from_similarity.sql` (long-tail + multiple parents)
6. `genre_taxonomy_build_paths.sql`
7. `genre_taxonomy_helpers.sql`

See `sql/GENRE_SQL_RUN_ORDER.md` for full pipeline.
