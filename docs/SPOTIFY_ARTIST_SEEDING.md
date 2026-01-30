# Phase One: Spotify Artist Seeding

Seeds the `artists` table with popular artists from the Spotify API so users can select them for reviews (including past events) without consuming JamBase API quota.

## Scope

- **Artists only** — no venue seeding (Spotify does not provide a venue catalog).
- **Does not touch** JamBase sync, genre/personalization feed, or frontend Spotify OAuth.

## Environment Variables (server-only)

Add these to `.env.local` (do **not** commit secrets; do **not** use `VITE_` prefix or expose in frontend):

| Variable | Required | Description |
|----------|----------|-------------|
| `SPOTIFY_CLIENT_ID` | Yes | From [Spotify Dashboard](https://developer.spotify.com/dashboard). Same app as OAuth is fine. |
| `SPOTIFY_CLIENT_SECRET` | Yes | From Spotify Dashboard. **Server-only** — never in frontend. |
| `SUPABASE_URL` | Yes | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_KEY`) | Yes | Service role key so the script can insert into `artists` and `external_entity_ids`. |

## How to Run

From the project root:

```bash
node scripts/seed-artists-from-spotify.mjs [--limit=N] [--genres=rock,indie,pop]
```

- **`--limit=N`** — Cap the number of new artists to insert (default: 500). Use e.g. `--limit=10` for a quick test, or `--limit=10000` for a larger seed.
- **`--genres=rock,indie,pop`** — Comma-separated genre/keywords for playlist search (default: rock, indie, pop, hip-hop, electronic).

Examples:

```bash
# Test run: insert at most 10 artists
node scripts/seed-artists-from-spotify.mjs --limit=10

# Seed up to 2000 artists with default genres
node scripts/seed-artists-from-spotify.mjs --limit=2000

# Custom genres
node scripts/seed-artists-from-spotify.mjs --limit=500 --genres=jazz,blues,soul
```

## Behavior

1. Loads env from `.env.local` (e.g. via dotenv).
2. Gets a Spotify access token via **Client Credentials** (no user login).
3. Discovers artist IDs by searching playlists by genre/keyword and extracting artist IDs from playlist tracks.
4. Queries `external_entity_ids` (source=`spotify`, entity_type=`artist`) to skip artists already seeded.
5. Fetches artist details from Spotify (Get Several Artists, up to 50 per request).
6. Inserts into `artists` with synthetic IDs: `jambase_artist_id = spotify-{id}`, `identifier = spotify:{id}` (no collision with JamBase numeric IDs).
7. Inserts into `external_entity_ids`: `entity_type=artist`, `source=spotify`, `external_id={spotify_id}`.
8. **Optional:** If the genre pipeline is applied (`sync_artist_genres` RPC exists), calls it so `artists_genres` is populated for feed/personalization. If the RPC is missing, the script skips this step and only stores `artists.genres` (when the column exists).

Idempotent: re-running with the same data skips artists already present in `external_entity_ids`. Rate limiting: respects Spotify 429 and `Retry-After`; adds small delays between batch requests. **Credentials:** Use server-only `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` (do not use `VITE_` or expose in frontend).

## Verification

1. Run with `--limit=10` and confirm 10 new rows in `artists` with `jambase_artist_id` like `spotify-...` and matching rows in `external_entity_ids` (source=spotify).
2. Run again with the same limit and confirm no duplicate artists (same Spotify ID not inserted twice).
3. Confirm JamBase sync (if run) does not update or delete these rows.
4. In the app, open a review flow and confirm a Spotify-seeded artist can be found and selected.
