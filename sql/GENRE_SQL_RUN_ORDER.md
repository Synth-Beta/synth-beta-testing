# Genre SQL — Run Order

**Run in this order (linked):**

1. [genres_schema.sql](genres_schema.sql)
2. [backfill_normalized_genres_part1_genres.sql](backfill_normalized_genres_part1_genres.sql)
3. [backfill_normalized_genres_part2_artists_genres.sql](backfill_normalized_genres_part2_artists_genres.sql)
4. [backfill_normalized_genres_part3_events_genres.sql](backfill_normalized_genres_part3_events_genres.sql)
5. [backfill_normalized_genres_part4_verify.sql](backfill_normalized_genres_part4_verify.sql)
6. [genre_similarity_schema.sql](genre_similarity_schema.sql)
7. [genre_similarity_refresh_part1_pairs.sql](genre_similarity_refresh_part1_pairs.sql)
8. [genre_similarity_refresh_part2_marginals.sql](genre_similarity_refresh_part2_marginals.sql)
9. [genre_similarity_refresh_part3_edges.sql](genre_similarity_refresh_part3_edges.sql)
10. [genre_similarity_verify.sql](genre_similarity_verify.sql)
11. [genre_taxonomy_schema.sql](genre_taxonomy_schema.sql)
12. [genre_taxonomy_seed_drop_list.sql](genre_taxonomy_seed_drop_list.sql)
13. [genre_taxonomy_seed_umbrellas.sql](genre_taxonomy_seed_umbrellas.sql)
14. [genre_taxonomy_seed_mid_level.sql](genre_taxonomy_seed_mid_level.sql)
15. [genre_taxonomy_assign_from_similarity.sql](genre_taxonomy_assign_from_similarity.sql)
16. [genre_taxonomy_build_paths.sql](genre_taxonomy_build_paths.sql)
17. [genre_taxonomy_helpers.sql](genre_taxonomy_helpers.sql)
18. [genre_taxonomy_validation.sql](genre_taxonomy_validation.sql)

Paths are relative to `sql/`. If a step times out, use the batch variants in Phase 1 below.

---

## Phase 1: 3NF normalization (genres + join tables)

| # | File | Purpose |
|---|------|--------|
| 1 | [genres_schema.sql](genres_schema.sql) | Tables: `genres`, `artists_genres`, `events_genres`; functions; indexes; RLS |
| 2 | [backfill_normalized_genres_part1_genres.sql](backfill_normalized_genres_part1_genres.sql) | Populate `genres` from artists + events |
| 3 | [backfill_normalized_genres_part2_artists_genres.sql](backfill_normalized_genres_part2_artists_genres.sql) | Populate `artists_genres` (if timeout: run part2a, part2b, part2c, part2d) |
| 4 | [backfill_normalized_genres_part3_events_genres.sql](backfill_normalized_genres_part3_events_genres.sql) | Populate `events_genres` (if timeout: run part3a, part3b, part3c, part3d) |
| 5 | [backfill_normalized_genres_part4_verify.sql](backfill_normalized_genres_part4_verify.sql) | Row counts and sanity check |

---

## Phase 2: Similarity graph (co-occurrence + PMI + pruned edges)

| # | File | Purpose |
|---|------|--------|
| 6 | [genre_similarity_schema.sql](genre_similarity_schema.sql) | MVs: `genre_cooccurrence_pairs`, `genre_marginals`; view `genre_similarity_pmi`; table `genre_similarity_edges` |
| 7 | [genre_similarity_refresh_part1_pairs.sql](genre_similarity_refresh_part1_pairs.sql) | Refresh `genre_cooccurrence_pairs` MV |
| 8 | [genre_similarity_refresh_part2_marginals.sql](genre_similarity_refresh_part2_marginals.sql) | Refresh `genre_marginals` MV |
| 9 | [genre_similarity_refresh_part3_edges.sql](genre_similarity_refresh_part3_edges.sql) | Repopulate `genre_similarity_edges` (top 25 per genre) |
| 10 | [genre_similarity_verify.sql](genre_similarity_verify.sql) | Optional: counts, sample pairs with names |

---

## Phase 3: DAG taxonomy (umbrellas + mid-level + parent assignment + paths + helpers)

| # | File | Purpose |
|---|------|--------|
| 11 | [genre_taxonomy_schema.sql](genre_taxonomy_schema.sql) | Tables: `genre_taxonomy_roots`, `genre_parent`, `genre_paths`, `genre_taxonomy_exclude`; DAG check function |
| 12 | [genre_taxonomy_seed_drop_list.sql](genre_taxonomy_seed_drop_list.sql) | Seed `genre_taxonomy_exclude` (junk genres to exclude) |
| 13 | [genre_taxonomy_seed_umbrellas.sql](genre_taxonomy_seed_umbrellas.sql) | Seed `genre_taxonomy_roots` (umbrella genres) |
| 14 | [genre_taxonomy_seed_mid_level.sql](genre_taxonomy_seed_mid_level.sql) | Seed 50–100 mid-level (child → parent) for cleaner hierarchy |
| 15 | [genre_taxonomy_assign_from_similarity.sql](genre_taxonomy_assign_from_similarity.sql) | Assign long-tail (and up to 3 parents per genre) from similarity graph |
| 16 | [genre_taxonomy_build_paths.sql](genre_taxonomy_build_paths.sql) | Rebuild `genre_paths` from roots + `genre_parent` |
| 17 | [genre_taxonomy_helpers.sql](genre_taxonomy_helpers.sql) | Function `get_genres_under_umbrella()`; view `genre_cluster_keys` (depth cap + drop list) |
| 18 | [genre_taxonomy_verify.sql](genre_taxonomy_verify.sql) or [genre_taxonomy_validation.sql](genre_taxonomy_validation.sql) | Optional: counts, sample paths, cluster keys, validation |

---

## One-time full run (summary)

```
1.  genres_schema.sql
2.  backfill_normalized_genres_part1_genres.sql
3.  backfill_normalized_genres_part2_artists_genres.sql   (or part2a–d)
4.  backfill_normalized_genres_part3_events_genres.sql   (or part3a–d)
5.  backfill_normalized_genres_part4_verify.sql
6.  genre_similarity_schema.sql
7.  genre_similarity_refresh_part1_pairs.sql
8.  genre_similarity_refresh_part2_marginals.sql
9.  genre_similarity_refresh_part3_edges.sql
10. genre_similarity_verify.sql
11. genre_taxonomy_schema.sql
12. genre_taxonomy_seed_drop_list.sql
13. genre_taxonomy_seed_umbrellas.sql
14. genre_taxonomy_seed_mid_level.sql
15. genre_taxonomy_assign_from_similarity.sql
16. genre_taxonomy_build_paths.sql
17. genre_taxonomy_helpers.sql
18. genre_taxonomy_validation.sql
```

---

## Re-run only (after data or schema changes)

- **Backfill:** 2 → 3 → 4 → 5  
- **Similarity refresh:** 7 → 8 → 9 (then 10 to verify)  
- **Taxonomy refresh:** 14 → 15 → 16 → 17 (then 18 to validate). To start taxonomy from scratch: `TRUNCATE genre_parent;` then 14 → 15 → 16 → 17.
