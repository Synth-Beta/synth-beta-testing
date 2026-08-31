# Synth Personalized Feed — ML Optimization Roadmap

Source document supplied by the user 2026-08-31. Reproduced below from `## Scope` onward,
unedited. Everything above that heading is a verification annex added when the document was
filed — read it first, because two of the document's four headline recommendations are already
shipped and one of its proposed formulas has already been measured to zero on this data.

---

# VERIFICATION ANNEX (added 2026-08-31, checked against the repo)

## Already built — do NOT rebuild

Migration `supabase/migrations/20260802120000_feed_v5_decay_and_popularity.sql`, applied
2026-08-02, implements **both** of the roadmap's top-two "if you only do four things" items. The
roadmap appears to have been written without knowledge of this file.

### §1.1 Time decay — SHIPPED

`public.decay_weight(signal_type, signal_weight, occurred_at)` exists and
`refresh_user_preferences_v5` uses it. Not a flat sum any more.

The roadmap proposes a 90-day half-life for interest signals. That migration **already chose 90**,
and did so empirically: a first pass at 45 days was dry-run against prod and rejected because
`event_interest` averages 294 days old and retained just **1.1%** of its weight — erasure, not
discounting. At 90 days, `event_interest` retains 10.2% and `interest` retains 33.6%. Verified
per-user: 12/15 sampled users kept the same #1 genre, 3/15 flipped to a more recently-signaled
one, and the heaviest user (Jam Band, raw sum 225.5) stayed #1 at a decayed 53.2.

Related finding recorded there: the `signal_type` enum defines removal signals
(`artist_unfollow`, `event_interest_removed`, …) but **zero rows exist for any of them** and
nothing in the app ever logs one. Unfollowing an artist never reduces their score. Decay partially
self-heals this; the logging gap itself is still open.

### §1.2 Popularity / velocity — SHIPPED

`public.event_popularity_scores` exists: `total_count`, `recent_count`, `prior_count`,
`velocity_score`, refreshed by a function on cron. `trending_candidates` in
`get_personalized_feed_v5` already sorts:

```sql
ORDER BY COALESCE(ep.total_count, 0) DESC,
         COALESCE(ep.velocity_score, 0) DESC,
         e.event_date DESC
```

So the roadmap's "trending is `ORDER BY event_date DESC`, i.e. *soon*, not *popular*" describes
the state **before** 2026-08-02, not today.

**The roadmap's proposed velocity formula would ship a no-op.** Its 48h-recent-vs-prior window was
already tried and measured against prod: it evaluated to **zero for every single event**. Reasons
recorded in the migration header:

- `relationship_type` has only ever been `'interested'` in prod (0 going/maybe rows)
- app-wide volume is **1–11 interest marks per week**
- the single most-interested-in event of all time has **6** total

What shipped instead: `LN(1 + total_count)` as the magnitude term that is real signal today
(it separates the 6-interest event from the 125 one-interest events), plus the velocity
infrastructure built on a wider **14-day / 14-day** window so it starts contributing as volume
grows without needing another migration.

## Scale reality check — gates the whole timeline

The roadmap's Phase 0 volume planning assumes **1,000 DAU × 3 sessions × 30 impressions ≈ 90k
rows/day**. Actual production scale as of 2026-08-31:

| Quantity | Actual |
|---|---|
| Users (`auth.users` = `public.users`) | **121** |
| `user_event_relationships` rows, all time | **191** (all `interested`) |
| Interest marks per week, app-wide | **1–11** |
| Max interest on any single event, ever | **6** |
| Events in catalog | 244,645 |
| Venues | 24,991 |

Consequences:

- Phase 3 gate ("≥8 weeks impressions, ideally ≥100k labeled impressions") and Phase 6 gate
  ("~50k+ labeled sessions") are **years away at current scale**, not months. The stated
  Month 3–5 / Month 9–12 timeline assumes roughly 10× the users.
- Anything depending on **user×item interaction density** — collaborative filtering, ALS,
  matrix factorization, SASRec/BERT4Rec over user sequences — is not viable now. 191
  interactions across 121 users is ~1.6 per user.
- Techniques that draw on the **catalog** (244,645 events, 24,991 venues) rather than user
  behavior ARE viable immediately. That is the distinction that should drive sequencing. See
  the PCA section below.

## Claims not yet verified

- **§1.4, `capture_review_music_data()` `ON CONFLICT` targeting a constraint dropped Feb 2026.**
  This function does not exist in any `.sql` in the repo — like `notify_friend_event_interest`,
  it lives only in the live database, so repo grep cannot confirm or deny it. Given it is the
  roadmap's #4 item and concerns the strongest taste signal, verify directly:
  ```sql
  SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'capture_review_music_data';
  SELECT count(*) FROM public.user_preference_signals WHERE signal_type LIKE '%review%';
  ```
- **§1.3 distance is a binary bounding box with no scoring term.** Consistent with what is in
  the migrations (`e.latitude BETWEEN v_min_lat AND v_max_lat`), and the roadmap's fix looks
  sound. Not independently re-verified end to end.

## PCA / dimensionality reduction — the technique that fits TODAY

The roadmap does not cover PCA, which was the specific technique asked about. Placing it here
because it is the one ML method in this space that works at 121 users.

**Why it fits:** PCA/truncated SVD on a **genre co-occurrence matrix** is computed from the event
catalog, not from user interactions. 244,645 events is ample. It is not blocked by the sparsity
that blocks everything in Phases 3–7.

**What it fixes that the current ranker cannot:**

1. **Correlated genre dimensions are double-counted.** `genre_sum` is a flat sum over matched
   tags. `indie-rock`, `indie`, and `alternative` are near-duplicates, so an event tagged with
   all three scores ~3× on what is really one taste axis. `genre_idf` damps *frequency*, not
   *correlation* — they are different problems, and IDF cannot fix this one.
2. **Slug/non-slug duplicate tags** (`indie-rock` 1339 vs `indie rock` 655; `hip-hop-rap` 5713
   vs `hip hop` 413) collapse automatically into the same latent factor, because they co-occur
   with identical neighbours. Currently handled by the `genre_match_slug()` string fix, which
   works but has to be maintained by hand.
3. **Junk tags dissolve.** `artists.genres` contains artist names ("billy childs"), places
   ("Leeds", "Alabama"), and non-genres ("vegan", "2020s"). Each appears on 1–3 artists, so each
   carries almost no variance and is effectively dropped by a truncated decomposition — no
   blocklist to maintain.

**Concrete shape:**

```
Build   M[genre, genre] = co-occurrence counts across events.genres  (244k events)
        PPMI-weight M, then truncated SVD → k ≈ 20–40 latent factors
Store   genre_factors(genre_slug text PRIMARY KEY, vec float8[])
Derive  event_vec = IDF-weighted mean of its genres' factor vectors
        user_vec  = decayed-preference-weighted mean of their genres' vectors
Score   cosine(user_vec, event_vec)  — replaces or blends with the genre_sum term
```

Runs offline in Python (`numpy` / `scikit-learn` `TruncatedSVD`), output is a small table.
`pgvector` is already a plausible fit for storage and cosine at serve time.

**Honest limits:**

- It **cannot fix coverage**. 8,997 upcoming events have zero genre tags; their vector is zero
  either way. The dominant remaining gap is still enrichment data, exactly as recorded in
  `project_feed_relevance_2026_08_24`. PCA improves ranking *among tagged events* only.
- It needs the same calibration discipline as every prior feed change: query live percentile
  distributions and dry-run before choosing a coefficient. See `project_feed_diversity_2026_07`
  for the calibration bug that discipline caught.
- `k` should be chosen from the explained-variance curve, not guessed.

**Adjacent and also viable now, same reason (catalog not behavior):** venue co-occurrence
embeddings — item2vec / SVD over the artist×venue bipartite graph from 244,645 events. This is
the ML form of the "venue co-occurrence" idea already recorded as next-move (B) in
`project_feed_relevance_2026_08_24`, and it is genuinely genre-independent, unlike the
artist-genre fallback and artist-to-artist similarity ideas that were measured and killed.

## Prior work this roadmap should be read alongside

Recorded in memory; all measured against prod, several already applied:

- `project_feed_relevance_2026_08_24` — relevance gate, genre slug normalization, genre IDF; the
  **ideas measured and killed** list (pool ordering, artist-genre fallback, artist-to-artist
  similarity) and the finding that *artist matching cannot carry this feed* (median 8 scored
  artists per user, 0–2 with a show in the 90-day window).
- `project_feed_diversity_2026_07` — the 1-per-artist cap and the `6·ln(genre) + 16·ln(artist)`
  calibration, including the double-count bug caught by dry-run.
- `project_feed_500_incident_2026_07` — following-pool nationwide-scan bottleneck, 13.2s → 210ms.
- `project_event_genre_backfill_2026_08_12` — why `artists.genres` is empty for ~19.7K artists;
  Spotify's artist API no longer returns genres.

---

# Scope

**Scope:** upgrading `get_personalized_feed_v5` + `PersonalizationEngineV5` from a hand-tuned
heuristic ranker into a learned, multi-stage recommender.

**Baseline as of today:**
```
total_weight = 1.0 + 6.0·LN(1 + genre_score) + 16.0·LN(1 + artist_score)
selection    = Efraimidis–Spirakis weighted sampling, key = -LN(RANDOM())/(w+1)
diversity    = ROW_NUMBER() PARTITION BY artist_id, keep rank 1
distance     = binary ~50mi bounding box
pools        = Following (300→25) | Recommended (2500→50) | Trending (300→25)
assembly     = pages of 10 rec + 5 following + 5 trending, shuffled within page
```

**The one structural fact that shapes everything below:** concerts are *one-and-only items*.
Every event is new, happens once, and disappears. You can never accumulate interaction history
on an item before you must recommend it. This kills any technique that depends on item
interaction history and makes **content-feature-based retrieval** the central architectural
requirement rather than a nice-to-have.

---

## Timeline at a glance

| Phase | Duration | Gate to start | Headline change |
|---|---|---|---|
| **0. Instrumentation** | Weeks 1–3 | none | Impression logging, event tracking schema |
| **1. Cheap wins** | Weeks 2–6 (parallel) | none | Decay, popularity, distance scoring, bug fixes |
| **2. Offline eval harness** | Weeks 5–9 | Phase 0 shipped | Replay framework, metrics, A/B infrastructure |
| **3. Learned ranker** | Months 3–5 | ≥8 wks impressions | LTR + position-bias tower |
| **4. Learned retrieval** | Months 5–8 | Phase 3 stable | Two-tower model, ANN index |
| **5. Social graph** | Months 6–9 | overlaps P4 | Friend-affinity weighting, graph candidates |
| **6. Multi-task** | Months 9–12 | ≥50k labeled sessions | MMoE: click / going / satisfaction |
| **7. Sequence + diversity** | Months 12+ | scale | SASRec, MMR/DPP, bandits |

Durations assume 1–2 engineers part-time on this, not a dedicated ML team.

---

# PHASE 0 — Instrumentation (Weeks 1–3)

**This is the only phase with a hard deadline.** Every subsequent phase trains on data you
are not currently collecting. Days not logged are training examples permanently lost.

## 0.1 The critical gap: you log positives, not negatives

Today `user_preference_signals` records what users *did* (view, interest, follow, review).
It does not record what they were **shown and ignored**. Without negatives you cannot train
any ranking model — you'd only have examples of things users liked, with nothing to contrast
them against.

## 0.2 Impression log schema

```sql
CREATE TABLE public.feed_impressions (
  id             bigserial PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  event_id       uuid NOT NULL,
  session_id     uuid NOT NULL,          -- one app-open
  request_id     uuid NOT NULL,          -- one RPC call (dedupes the dual-location fan-out)

  -- position & context: required for bias correction in Phase 3
  position       integer NOT NULL,        -- absolute index in the rendered feed
  page_number    integer NOT NULL,
  section        text NOT NULL,           -- following | recommended | trending | friend_interested
  slot_type      text,                    -- event | rail | injected_friend

  -- what the ranker believed at serve time (frozen for replay)
  model_version  text NOT NULL,           -- 'heuristic_v5_20260703' etc.
  total_weight   numeric,
  genre_score    numeric,
  artist_score   numeric,
  sample_key     numeric,
  was_cached     boolean,                 -- served from get_or_refresh_feed_v5_cached?

  -- context features
  distance_miles numeric,
  days_until_event integer,
  city           text,
  lat            numeric, lng numeric,
  device_platform text,                   -- ios | android | web
  local_hour     smallint,
  local_dow      smallint,

  -- outcomes (nullable, filled by later events)
  was_viewport   boolean DEFAULT false,   -- actually scrolled into view
  dwell_ms       integer,
  clicked        boolean DEFAULT false,
  interested     boolean DEFAULT false,
  going          boolean DEFAULT false,
  reviewed       boolean DEFAULT false,
  review_rating  numeric,

  served_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON feed_impressions (user_id, served_at DESC);
CREATE INDEX ON feed_impressions (request_id);
CREATE INDEX ON feed_impressions (event_id, served_at DESC);
```

**Design notes that matter later:**

- **Freeze the scores at serve time.** Recomputing `genre_score` at training time gives you
  the *current* value, not the one the model saw. That is a subtle, fatal leakage bug.
- **`was_viewport` vs. served.** An item at position 40 that never scrolled into view is not
  a negative — the user never saw it. Treating it as one teaches the model nonsense. Log
  viewport separately; use "seen but not clicked" as your negative set.
- **`request_id` handles your dual-location fan-out.** `UnifiedEventsFeed.fetchFeedForLocations`
  fires two parallel RPCs when filter location and GPS differ by >25mi. Without a request id
  you'll double-count impressions.
- **`was_cached`.** Your SWR cache can serve a stale ranking. Training on those without
  knowing it distorts the position-bias estimate.

## 0.3 Client-side wiring

You already have `useIntersectionObserver`-style tracking (`IntersectionTrackingOptions`,
`usePromotionImpression`). Extend that machinery rather than building new:

- `UnifiedEventsFeed.tsx` — emit an impression row per rendered card, with position.
- Batch client-side (e.g. flush every 5s or 20 impressions) — do not fire one insert per card.
- Attribute clicks back to `request_id` + `position` so the join is exact.

## 0.4 Retention & volume planning

At 1,000 DAU × 3 sessions × 30 impressions = ~90k rows/day, ~33M/year. Fine for Postgres with
partitioning. Add monthly partitions from day one:

```sql
-- partition by month; drop or archive raw rows after 12-18 months,
-- keeping aggregated training sets
```

## Phase 0 exit criteria
- [ ] Impressions logging in prod on web + mobile
- [ ] Click/interest/going joins verified against `request_id`
- [ ] Viewport detection working (spot-check: position-40 items rarely marked viewport)
- [ ] A day's data manually inspected for sanity — position distribution, CTR by position

---

# PHASE 1 — Cheap wins (Weeks 2–6, parallel with Phase 0)

No ML. These are defect fixes and missing features that will likely produce a bigger
user-visible quality jump than anything in Phase 3–4, at ~2% of the effort.

## 1.1 Time decay on preference signals — **highest single-item value**

**Problem:** `refresh_user_preferences_v5` is a pure additive accumulator. Production
percentiles: genre scores `median 1.1, p90 10, p99 121, max 225.5` — unbounded and permanent.
A genre you viewed 40 times two years ago outweighs one you engaged with last week. Made
worse by the Feb 2026 drop of the uniqueness constraint, so nothing ever collapses.

**Fix** — add exponential decay inside the aggregation:

```sql
-- in refresh_user_preferences_v5, replace SUM(ups.signal_weight) with:
SUM(
  ups.signal_weight *
  EXP(-1.0 * decay_lambda(ups.signal_type) * EXTRACT(EPOCH FROM (now() - ups.occurred_at)) / 86400.0)
)
```

**Suggested half-lives** (λ = ln(2)/half_life_days):

| signal_type | half-life | rationale |
|---|---|---|
| `view` | 14 days | weakest, noisiest signal |
| `interest` | 90 days | real intent, but tastes drift |
| `follow` | 365 days | deliberate, durable |
| `review` | 730 days | strongest evidence of taste |
| `*_manual_preference` | 365 days | explicit onboarding choice |
| `spotify_*` / `apple_music_*` | **no decay** | already idempotent via delete+reinsert; decaying twice would double-count |

**Watch out:** streaming signals are replaced on every sync, so their `occurred_at` is always
recent. Applying decay to them is harmless but pointless; applying it *and* keeping the
delete-reinsert is fine. Do not add decay to them and also stop the delete — that breaks
idempotency.

**Rollout:** add as a second column (`genre_preference_scores_decayed`) first, compare
distributions against the current one, then switch the ranker over. Do not do this as a
destructive in-place change.

## 1.2 Real popularity signal

You verified via exhaustive grep that there is **no popularity/interest-count/review-count
signal anywhere** — "trending" is `ORDER BY event_date DESC`, i.e. *soon*, not *popular*.

```sql
-- materialized view, refreshed every 15 min via pg_cron
CREATE MATERIALIZED VIEW event_popularity AS
SELECT
  e.id AS event_id,
  COUNT(*) FILTER (WHERE uer.relationship_type IN ('going','interested')) AS interest_total,
  COUNT(*) FILTER (WHERE uer.created_at > now() - interval '48 hours') AS interest_48h,
  COUNT(*) FILTER (WHERE uer.created_at > now() - interval '7 days')  AS interest_7d,
  -- velocity: recent share of total, Bayesian-smoothed against low counts
  (COUNT(*) FILTER (WHERE uer.created_at > now() - interval '48 hours') + 1.0)
    / (COUNT(*) + 10.0) AS velocity_score
FROM events e
LEFT JOIN user_event_relationships uer ON uer.event_id = e.id
WHERE e.event_date >= CURRENT_DATE
GROUP BY e.id;
```

**Velocity beats raw count for events.** A show with 40 saves yesterday is hotter than one
with 200 accumulated over six months — and raw counts have a rich-get-richer feedback loop
(popular events get shown more, so they get more saves). Smoothing (`+1 / +10`) prevents a
single save on a brand-new event from scoring 1.0.

Then rename the pool honestly (`trending` → keep name, change content) and add to scoring:

```sql
+ 3.0 * LN(1 + interest_48h)   -- coefficient to be learned in Phase 3
```

## 1.3 Distance as a scoring term, not a gate

Currently a **binary ~50-mile bounding-box filter only — no distance-weighted scoring term,
no exact haversine**. A 5-mile show and a 49-mile show score identically.

```sql
-- multiplicative decay; d0 ≈ 15 miles is a reasonable starting point
* EXP(-distance_miles / 15.0)
```

Keep the Following-pool distance exemption — a followed artist's show *should* surface
regardless of location. That's correct behavior, not a bug.

Note you'll need real haversine (or PostGIS `ST_DistanceSphere`) rather than the bounding box
for this to be meaningful.

## 1.4 Correctness bugs to fix first

| Bug | Location | Impact |
|---|---|---|
| `ON CONFLICT` targets a constraint dropped Feb 2026 | `capture_review_music_data()` | Review signals may be silently failing → your **strongest** taste signal missing |
| SWR cache fix not in tracked migrations | `supabase/feed-cache-swr-2026-07-18/` | "Empty feed" bug may not actually be deployed |
| RLS disabled on `user_preference_signals` | `20260131100003` | Security + privacy-policy accuracy |
| 6 import cycles incl. `badgeService ↔ notificationService` | see graph report | Latent init-order bugs |
| v3/v4/legacy feed paths still present | `unifiedFeedService.ts`, `UnifiedFeed.tsx` | Confuses every future change; delete |

**Verify #1 against the live DB before anything else.** If review signals aren't writing,
every model you train downstream inherits the gap.

## 1.5 Recency-of-event term

Currently `p_max_days_ahead` default 90, no preference within that window. Users generally
prefer things happening soon-ish but not tonight:

```sql
-- gentle hump: penalize both "tomorrow" (no time to plan) and "in 89 days" (too abstract)
* (1.0 + 0.3 * EXP(-POWER((days_until_event - 14.0)/21.0, 2)))
```
Tune later; the point is to have the term exist so Phase 3 can learn its shape.

## Phase 1 exit criteria
- [ ] Decay live, distributions compared before/after
- [ ] Popularity MV live and in the scoring formula
- [ ] Distance decay live
- [ ] All five bugs verified/fixed
- [ ] Dead v3/legacy paths deleted

---

# PHASE 2 — Evaluation harness (Weeks 5–9)

**You cannot skip this and then do Phase 3.** Without offline eval you'll be shipping models
on vibes, and a bad ranker is worse than a mediocre heuristic because it fails silently.

## 2.1 Metrics

| Metric | What it tells you | Notes |
|---|---|---|
| **NDCG@10** | Ranking quality, position-weighted | Primary offline metric |
| **Recall@50** | Retrieval quality | Primary for Phase 4 |
| **MRR** | Where the first good item lands | |
| CTR@k, Save-rate@k | Business-facing | Confounded by position |
| **Intra-list diversity** | Artist/genre entropy per feed | Guards against Phase 3 collapse |
| **Coverage** | % of catalog ever shown | Guards long-tail starvation |
| **Novelty** | Mean inverse popularity of shown items | Guards popularity feedback loop |

**Track diversity/coverage/novelty from day one.** The classic failure of moving heuristic →
learned ranker is a CTR gain of +5% and a catalog-coverage collapse of −40%, because the model
learns "show popular things" and the feed becomes homogeneous. You will not notice this in
NDCG.

## 2.2 Offline replay

Split **temporally, never randomly** — train on weeks 1–6, validate on week 7, test on week 8.
Random splits leak future information and will make every model look great and perform badly.

```
For each historical request_id:
  reconstruct candidate set + frozen features
  re-rank with candidate model
  score against observed labels (clicked / interested / going)
```

Counterfactual caveat: you only observe outcomes for items that were actually shown. Use
inverse-propensity weighting (propensities come from the Phase 3 bias tower) or accept that
offline numbers are directionally useful but not absolute.

## 2.3 A/B infrastructure

- Deterministic bucketing by `user_id` hash (stable across sessions, or users see the feed
  flip between algorithms).
- `model_version` already in `feed_impressions` — that's your assignment record.
- Minimum 2 weeks per test (weekly seasonality: concert behavior is very weekend-skewed).
- Guardrail metrics that auto-halt: session length, D1/D7 retention, review submission rate.

## Phase 2 exit criteria
- [ ] Replay harness reproduces the current heuristic's live metrics within ~2%
- [ ] A/B assignment + guardrails live
- [ ] Baseline numbers recorded for every metric above

---

# PHASE 3 — Learned ranker (Months 3–5)

**Prerequisite: ≥8 weeks of impressions, ideally ≥100k labeled impressions.**

## 3.1 Learning-to-Rank replaces the hand-tuned coefficients

Your `6` and `16` were calibrated by eyeballing production percentiles — a reasonable stopgap,
explicitly chosen so `16·LN(1+23.4) ≈ 51` beats `6·LN(1+225) ≈ 33`. An LTR model learns those
weights *and* the interactions you'd never hand-tune ("distance matters 3× more on weeknights",
"genre match matters less when the artist score is already high").

**Model:** LightGBM / XGBoost with `rank:pairwise` or LambdaMART objective. Not deep learning —
gradient-boosted trees dominate on tabular ranking features at your data scale, train in
minutes, and are debuggable.

**Grouping:** one group per `request_id` (a group = one feed impression set).

**Feature set** (all already available or added in Phase 1):

```
User:     genre_scores (top-k decayed), artist_score, venue_score,
          signal_count, days_since_signup, session_count_7d,
          connected_spotify?, connected_apple?, friend_count
Item:     genre one-hots, artist_id embedding/target-enc, venue_id,
          days_until_event, event_hour, is_weekend, price_tier
Match:    genre_overlap_score, artist_score_for_this_event,
          venue_follow?, artist_follow?, distance_miles,
          friend_interest_count, second_degree_interest_count
Context:  local_hour, dow, device_platform, position (bias tower only!),
          section, page_number
Popularity: interest_total, interest_48h, velocity_score
```

**Label design** — graded relevance, not binary:
```
reviewed with rating ≥4  → 4
going                    → 3
interested               → 2
clicked                  → 1
seen, no action          → 0
not in viewport          → excluded entirely
```

## 3.2 Position-bias correction — **do this simultaneously, not later**

Your training data is poisoned. Items at position 1 get clicked more *because* they're at
position 1. Train naively and you learn "whatever the old algorithm ranked first is good" —
permanently locking in your current heuristic's mistakes, including its blind spots.

**The shallow-tower approach** (from Google's YouTube multitask ranking paper): a small
side-network takes bias-related inputs (serving position, device) and outputs a scalar; the
main tower's output is added to it, and at serving time you **drop the bias tower** and use
only the main tower's unbiased score.

```
logit = main_tower(features_without_position) + bias_tower(position, device, section)
serve: score = main_tower(...)   # bias tower discarded
```

For tree models, the equivalent is inverse-propensity weighting: estimate P(examine | position)
from your logs (this is why Phase 0 logs viewport), then weight training examples by 1/propensity.

**Why "later" doesn't work:** once a biased model is live, it generates biased data that
confirms its own bias, and you can no longer estimate propensities cleanly from your own logs
without deliberate randomization (see 3.4).

## 3.3 Keep the stochastic selection

Do **not** replace Efraimidis–Spirakis sampling with a strict `ORDER BY score DESC`. The
randomization is doing real work: it's your only source of exploration data, it prevents the
feed from being a static leaderboard, and it makes propensities estimable. Instead, feed the
LTR score into the same sampling:

```sql
sample_key = -LN(RANDOM()) / (EXP(ltr_score) + 1)
```

## 3.4 Add a small randomization slice

Reserve ~2% of impressions for uniformly-random ranking within the candidate set. This gives
you unbiased data for propensity estimation and future counterfactual evaluation. It costs
almost nothing in user experience and is the difference between "we think it's better" and
"we can prove it."

## Phase 3 exit criteria
- [ ] LTR beats heuristic on offline NDCG@10 by a meaningful margin
- [ ] Diversity/coverage/novelty **not** materially worse
- [ ] A/B positive on engagement AND neutral-or-positive on retention
- [ ] Bias tower trained and dropped correctly at serve time
- [ ] 2% random slice live

---

# PHASE 4 — Learned retrieval (Months 5–8)

**This is the phase that directly attacks your cold-start core problem.**

## 4.1 Why your current candidate generation is the real ceiling

Ranking can only reorder what retrieval hands it. Today retrieval is three SQL pools capped at
300/2500/300. If the genuinely best event for a user isn't in those 2,500 rows, no ranker on
earth can surface it. And because every event is brand new with zero interactions, any
retrieval based on item history is impossible.

## 4.2 Two-tower architecture

```
User tower:   [decayed genre vector, artist vector, venue vector,
               location, recent interaction sequence, connected-service flags]
                        ↓
                   user_embedding (128-d)

Event tower:  [genre one-hots, artist embedding, venue embedding,
               date features, price tier, city, popularity]
                        ↓
                   event_embedding (128-d)

score = dot(user_embedding, event_embedding)
```

**The cold-start escape hatch:** the event tower consumes *content features only*. A concert
announced this morning with zero interactions still gets a meaningful embedding from its
artist, genre, and venue — because the model learned what those features mean from *other*
events. That's the whole reason two-tower is the right architecture for you rather than
matrix factorization.

## 4.3 Negative sampling is what makes or breaks this

Naive in-batch negatives are biased toward popular items (popular items appear in more batches,
so they're over-penalized as negatives). Google's Mixed Negative Sampling addresses exactly
this by mixing in-batch negatives with uniformly-sampled negatives from the full catalog.

Practical recipe:
- In-batch negatives (cheap, hard) + uniform negatives from the catalog (unbiased, easy)
- Ratio ~1:1 to start
- Apply **logQ correction** to in-batch negatives (subtract `log(sampling_prob)` from logits)
- Include hard negatives: events in the right city and date window that the user *didn't*
  engage with — these teach fine distinctions

## 4.4 Serving

- Precompute event embeddings nightly + incrementally on new-event ingest
- ANN index: `pgvector` with HNSW keeps everything in Postgres (simplest for you), or
  FAISS/ScaNN if you outgrow it
- User embedding computed at request time (features change per session/location)
- **Filter after retrieval, not before:** geo-filter and date-filter the ANN results, or use
  pgvector's filtered search — retrieving 500 then filtering to 50 is fine

## 4.5 Blend, don't replace

Keep your existing SQL pools as one candidate source alongside two-tower. Union them, dedupe,
and let the Phase 3 ranker sort it out. The Following pool in particular encodes an explicit
user intent ("I follow this artist") that a learned model may under-weight.

## Phase 4 exit criteria
- [ ] Recall@50 beats SQL pools on held-out data
- [ ] New events (< 24h old, zero interactions) appear in retrieval at a reasonable rate
- [ ] p95 latency within budget (your RPC already had 57014 timeout issues — watch this)
- [ ] Catalog coverage up, not down

---

# PHASE 5 — Social graph exploitation (Months 6–9, overlaps Phase 4)

**Your single most under-exploited signal.** You have a real social graph and are using it in
the crudest possible way.

## 5.1 Current state

- Friend edges are **binary** — `user_relationships` accepted or not
- Injection is a **hardcoded ratio** — 1 friend event per 4 main-feed events
- `getSecondDegreeNetworkEvents` exists but only powers a manual "Friends" tab
- No notion that some friends' taste predicts yours and some don't

## 5.2 Friend affinity model (Twitter's `real-graph` analogue)

Train a model predicting P(user A engages with content from user B):

```
Features: interaction frequency (chats, likes, comments),
          shared event attendance history, taste-vector cosine similarity,
          mutual friend count, tie age, reciprocity,
          co-review agreement (did you rate the same shows similarly?)
Label:    did A engage with an event B was interested in
```

Then replace `1 friend event per 4` with **affinity-weighted injection** — a friend whose taste
consistently matches yours gets more slots than your cousin who only listens to podcasts.
This alone is likely a bigger win than Phase 3 for users with active friend graphs.

## 5.3 Graph traversal candidates

Second- and third-degree traversal (GraphJet-style) surfaces "friend of a friend is going" —
strong social proof you currently discard. Combine with the affinity weights so a
2-hop path through a high-affinity friend outranks a 1-hop path through a weak tie.

## 5.4 Community detection (SimClusters analogue)

Twitter's SimClusters identifies latent communities and represents users/items as sparse
embeddings over them. Applied to you: discover **music scenes** ("Brooklyn DIY punk crowd",
"DC go-go", "jam-band circuit") from co-attendance patterns, rather than relying on your
hand-labeled onboarding genres. Concert-going is intensely scene-based, and scenes are exactly
the latent structure your genre taxonomy fails to capture.

You already have a `Scene` / `SceneService` concept in the codebase — this is the ML version
of it, learned rather than curated.

## 5.5 In-network / out-network balance

Twitter's For You averages ~50/50 in-network vs out-of-network as a design reference. Your
current split is 5 following / 10 recommended / 5 trending per page (25% in-network). Worth
A/B testing the ratio rather than leaving it at a hand-picked constant — and eventually
learning it per-user (some users want their friends' shows, some want discovery).

---

# PHASE 6 — Multi-task learning (Months 9–12)

**Prerequisite: ~50k+ sessions with the full label chain.**

## 6.1 Why this fits Synth unusually well

Most recommenders only observe clicks. You observe a genuine three-stage funnel:

```
view → interested/going → attended → reviewed (with a rating)
```

That last step is **ground-truth satisfaction**, which most recsys teams never get. Optimizing
for clicks alone gives you clickbait; optimizing for going alone ignores discovery;
optimizing for review rating alone has too little data. Multi-task learns all of them jointly.

## 6.2 MMoE

The YouTube multitask paper's architecture: shared bottom layers, then Multi-gate
Mixture-of-Experts where each task has its own gate deciding which experts to draw on — so
tasks that conflict (engagement vs. satisfaction) can specialize instead of fighting.

```
Tasks:
  T1: P(click)              — engagement
  T2: P(mark interested)    — intent
  T3: P(mark going)         — commitment
  T4: E[review rating]      — satisfaction  (sparse; weight accordingly)

final_score = w1·P(click) + w2·P(interested) + w3·P(going) + w4·E[rating]
```

The `w` weights are a product decision, not a learned parameter — they encode what you want
the feed to be. Start with heavy weight on `going` (it's the actual business outcome) and use
`rating` as a tiebreaker.

## 6.3 Practical warnings

- Task correlation matters: if all four tasks are ~perfectly correlated, MMoE adds complexity
  for nothing. Check correlations before building.
- The review task is very sparse (most attended events aren't reviewed). Weight the loss or
  it'll be ignored.
- Attendance is self-reported and noisy — "going" ≠ went.

---

# PHASE 7 — Sequence, diversity, exploration (Months 12+)

## 7.1 Sequential models

**SASRec** (Kang & McAuley 2018) — Transformer with masked self-attention over the user's
interaction sequence. **BERT4Rec** (Sun et al. 2019) — bidirectional, Cloze objective.

Practical guidance:
- **Start with SASRec + full softmax cross-entropy.** BERT4Rec often edges out SASRec at
  default settings, but SASRec with full softmax reclaims the lead — and BERT4Rec has a
  well-documented replication problem (a review of 370 citing papers found most public
  implementations underperform, with the original's default config severely underfitting).
- **2–4 layers.** Deeper often fails to improve or diverges.
- Look at **TiSASRec** (time-interval-aware) and **SANST** (spatial, for next-POI) — these are
  much closer to your geo+temporal problem than the movie-rating literature.

**Honest caveat for your domain:** sequential models assume a repeatable item vocabulary. Your
items are one-and-only. Apply sequence modeling to the **artist/genre/venue** sequence, not the
event sequence — "what kind of shows does this person go to, in what order/rhythm" is learnable;
"what event comes next" is not.

## 7.2 Diversity: MMR → DPP

Your current cap (one event per artist, cross-section) is blunt. Better:

- **MMR** — greedy re-rank balancing relevance vs. similarity to already-selected items, one
  tunable λ. Easy to implement as a post-ranking pass. Do this first.
- **DPP** (Chen et al. 2018, fast greedy MAP inference) — models diversity across *multiple*
  dimensions simultaneously (genre, artist, venue, price, date), principled and state of the
  art. Bigger lift; do it only if MMR proves diversity is a real lever for you.

## 7.3 Calibration

Steck's *Calibrated Recommendations* (RecSys 2018): if a user's history is 70% indie / 30%
electronic, the feed should roughly reflect that mix, not collapse to 100% indie because indie
scores marginally higher. Your 6:16 rebalance was an ad-hoc fix for exactly this failure mode;
calibration is the principled version, applied as a re-ranking constraint.

## 7.4 Contextual bandits

**LinUCB** (Li et al., WWW 2010) — the canonical "personalized news recommendation under
uncertainty" paper, and a close analogue to your problem. Your current uniform randomization
explores *equally* regardless of confidence; a bandit explores *more* where it's uncertain and
*less* where it's confident. Strictly better use of the same exploration budget.

Particularly valuable for you because every new event starts at maximum uncertainty.

---

# Cross-cutting concerns

## Feedback loops — the thing that quietly ruins recommenders

Every model trains on data its predecessor generated. Left unchecked you get progressive
narrowing: the feed shows fewer artists, users engage with fewer artists, the model concludes
those are the only good artists. Defenses:

- The 2% random slice (3.4)
- Novelty + coverage as **guardrail metrics with auto-halt**, not just dashboards
- Periodic retraining from scratch, not incremental-forever
- Explicit exploration budget for new/long-tail events

## Cold start — three distinct problems, three answers

| Cold start type | Answer |
|---|---|
| **New event** (always) | Two-tower content features (Phase 4) — the structural fix |
| **New user** | Onboarding picks + streaming connect + popularity fallback; consider Collective Bayesian Poisson Factorization (Zhang & Wang, KDD 2015) which targets cold-start local event recommendation directly |
| **New city** | Popularity + venue reputation; degrade gracefully to trending |

## Latency budget

Your RPC already hit Postgres statement timeouts (57014) and needed a 8s→15s bump plus the
Following-pool rewrite (13.2s → 210ms). Any added model inference must fit in the same budget.
Two-tower + ANN is fast (<20ms); LTR over 2,500 candidates with LightGBM is ~5–15ms. The risk
is feature fetching, not inference — precompute aggressively.

## Where models live

Given your stack (Supabase/Postgres + Vercel + Expo), the pragmatic path:
- Feature store: Postgres tables + materialized views (you already do this)
- Training: offline Python (LightGBM → later PyTorch), scheduled
- Serving: model artifact loaded in a Vercel/Node function, or ONNX in a small service
- Embeddings: `pgvector` in the same Postgres — avoids a second datastore

Do not introduce Spark/Flink/Kubeflow at your stage. Everything above runs on a laptop and a
cron job until you're well past 100k users.

---

# If you only do four things

1. **Impression logging** (Phase 0) — this week. Everything else is gated on it.
2. **Time decay** (1.1) — biggest quality win per line of code in the entire document.
3. **Popularity/velocity** (1.2) — you have literally no popularity signal today.
4. **Fix `capture_review_music_data`'s `ON CONFLICT`** (1.4) — you may be silently dropping
   your strongest taste signal.

Those four are ~2 weeks of work and will likely beat six months of modeling on a broken
foundation.

---

# Reading list

**Architecture**
- Covington et al., *Deep Neural Networks for YouTube Recommendations* (RecSys 2016) — two-stage
- Yi et al., *Sampling-Bias-Corrected Neural Modeling for Large Corpus Item Recommendations* (RecSys 2019) — two-tower
- Yang et al., *Mixed Negative Sampling for Learning Two-tower Neural Networks* (WWW 2020)

**Ranking**
- Zhao et al., *Recommending What Video to Watch Next: A Multitask Ranking System* (RecSys 2019) — MMoE + shallow bias tower
- Burges, *From RankNet to LambdaRank to LambdaMART* (2010)
- Joachims et al., *Unbiased Learning-to-Rank with Biased Feedback* (WSDM 2017)

**Sequence**
- Kang & McAuley, *Self-Attentive Sequential Recommendation* (ICDM 2018)
- Sun et al., *BERT4Rec* (CIKM 2019) — read the replication critiques alongside it
- Li et al., *Time Interval Aware Self-Attention* (TiSASRec, WSDM 2020)

**Diversity / calibration / exploration**
- Steck, *Calibrated Recommendations* (RecSys 2018)
- Chen et al., *Fast Greedy MAP Inference for DPP* (NeurIPS 2018)
- Li et al., *A Contextual-Bandit Approach to Personalized News Article Recommendation* (WWW 2010)
- Carbonell & Goldstein, *MMR* (SIGIR 1998)

**Event-specific (read these early — closest to your actual problem)**
- Zhang & Wang, *Collective Bayesian Poisson Factorization for Cold-start Local Event Recommendation* (KDD 2015)
- Macedo et al., *Context-Aware Event Recommendation in Event-based Social Networks* (RecSys 2015)

**Production code**
- `github.com/twitter/the-algorithm` — SimClusters, GraphJet, real-graph, heavy ranker
- `github.com/tensorflow/recommenders` — two-tower reference implementations
- `github.com/microsoft/recommenders` — evaluation + baselines
