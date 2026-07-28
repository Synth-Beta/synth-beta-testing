# Content Calendar / DC Editorial Automation

Admin tab on `getsynth.app/admin` (before Social Media) for researching DC venues and upcoming events, drafting multi-platform copy, and approving before publish.

## Flow

1. **Run DC research** → `editorial-research` (Vercel API; Supabase edge kept in sync)
   - Loads upcoming rows from `events` joined to `artists` + `venues` (not `jambase_events`)
   - Also pulls DC venues from `venues` by geo / upcoming count
   - Caps: **8 events + 5 venues**; enrich only the **top 5** subjects
   - Shared TypeScript source registry (`lib/editorial-sources` / `supabase/functions/_shared/editorial-sources`)
   - Adapters: JamBase, Ticketmaster, IMP, Union Stage, Black Cat, Songbyrd, The Wharf, DC Music Live, CapitalBop, District Fray, Washington.org, Reddit, Bluesky, Google Places, setlist.fm, MusicBrainz, Washingtonian, Axios DC, DC Music Review, WTOP, plus DMV venue website discovery from `venues.url`
   - Modes: API / RSS / JSON-LD / permitted HTML; timeouts, rate limits, cache, `Promise.allSettled`, soft failures
   - Normalized signals: source, URL, title, excerpt, published_at, fetched_at, subject, signal_type, sentiment, confidence
   - Dedupe by canonical URL + content hash; short excerpts only → `editorial_source_snippets`
   - Per-source status + result counts stored on `editorial_runs.source_status` and shown in admin

2. **Generate drafts** → `editorial-generate`
   - Converts research snippets into a **cited claim ledger** (public_use gated)
   - Writes **platform-native** Instagram, LinkedIn, Substack, and Reddit drafts using
     `docs/synth-editorial-content-training-guide.md` rules and examples in each prompt
   - Hard-fail lint rejects signals language, dashes, unsupported claims, incomplete sentiment
   - Rubric score stored in `editorial_meta` with source URLs and editor notes for review
   - Requires `OPENAI_API_KEY`
   - Every post stays in `pending_review` until explicitly approved
   - Voice: informed concert friend, not analytics copy

3. **Edit / Approve** in the admin UI
   - Never auto-posts without approve (or explicit Publish now)

4. **Publish**
   - Instagram: Graph Content Publishing via `content-calendar-publish` (existing Meta env vars)
   - LinkedIn / Substack / Reddit: copy + mark published manually until platform keys exist
   - **Publish due IG** button (or cron) publishes approved/scheduled Instagram posts that are due

## Env-gated API keys (Vercel + Supabase secrets)

| Secret | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | Yes (generate) | Draft + synthesis |
| `OPENAI_MODEL` | No (default `gpt-4o-mini`) | Model override |
| `JAMBASE_API_KEY` or `VITE_JAMBASE_API_KEY` | No | JamBase listings |
| `TICKETMASTER_API_KEY` | No | Ticketmaster Discovery |
| `SETLIST_FM_API_KEY` or `VITE_SETLIST_FM_API_KEY` | No | setlist.fm |
| `GOOGLE_PLACES_API_KEY` | No | Venue ratings / site |
| `BLUESKY_HANDLE` / `BLUESKY_APP_PASSWORD` | No | Bluesky (public search still tried) |
| `NEWS_API_KEY` | No | Optional news enrichment |
| `INSTAGRAM_USER_ID` / `INSTAGRAM_ACCESS_TOKEN` | Yes (IG publish) | Same as analytics |
| `SYNTH_BRAND_IMAGE_URL` | No | IG image fallback |
| `CONTENT_CALENDAR_CRON_SECRET` | No | Auth for due-post cron invokes |

Adapters soft-skip when keys are missing (status `disabled` / empty). See `synth-editorial-api/.env.example`.

## Deploy

```bash
# Apply signal schema migration
# supabase/migrations/20260727180000_editorial_source_signals.sql

# Vercel API (production path for admin UI)
cd synth-editorial-api && vercel --prod

# Optional: Supabase edge parity
supabase functions deploy editorial-research --project-ref glpiolbrafqikqhnseto
supabase functions deploy editorial-generate --project-ref glpiolbrafqikqhnseto
supabase functions deploy content-calendar-publish --project-ref glpiolbrafqikqhnseto
```

## Tables

- `editorial_runs` (includes `source_status` JSONB)
- `editorial_subjects`
- `editorial_source_snippets` (canonical_url, content_hash, signal_type, confidence, sentiment, …)
- `content_calendar_posts`

Admin RLS: `users.account_type = 'admin'`.

## Production runtime (current)

- **https://synth-editorial-api.vercel.app**
- `/api/editorial-research`, `/api/editorial-generate`, `/api/content-calendar-publish`
- Optional override: `VITE_EDITORIAL_API_URL`
