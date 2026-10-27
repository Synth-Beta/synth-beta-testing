# Share Previews + Taller Share Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Branded link-preview posters for shared events and reviews, a fixed review preview, and a taller share sheet (web + mobile) that always offers external sharing.

**Architecture:** Pure copy helpers (`api/_lib/shareCopy.ts`) and Supabase fetchers (`api/_lib/shareData.ts`) are shared by the existing crawler page `api/share.ts` and a new edge endpoint `api/og.ts` that renders a 1200x630 PNG with `@vercel/og`. Share-sheet changes are style/visibility edits to the three existing modals.

**Tech Stack:** Vercel serverless (Node + Edge), `@vercel/og`, `@supabase/supabase-js`, node:test via `--experimental-strip-types`, React (web), React Native/Expo (mobile).

**Spec:** `docs/superpowers/specs/2026-10-21-share-previews-design.md`

## Global Constraints

- Never commit or push; the user does all git commits. "Commit" steps below mean: stop, leave the change staged-ready, report the files.
- Poster size 1200x630 PNG. Cache header exactly: `public, s-maxage=86400, stale-while-revalidate=604800`.
- No pure white or black: text `#FFFDFA`, background `#0E0E0E`. Accent pink `#CC2486` only for the Synth wordmark dot.
- Bubble copy: event title `<Artist> at <Venue>`, description `<Sat, Nov 8> · <City, ST> · on Synth`; review title `<Reviewer> rated <Artist> <stars>`, description `<Venue> · <date>`.
- Reviews table columns: `rating`, `review_text`, `user_id`; reviewer name from `users.name` by `users.user_id`. Never `overall_rating` or `profiles`.
- Bad/unknown ids: `/api/og` returns the default poster (HTTP 200), never an error.
- Share-sheet layout and tile design stay unchanged; only height, wrapping and footer visibility change.

## Review Focus

- Review with no `review_text`, no rating, or rating with a half star (4.5): title shows `★★★★½`, no stray `undefined`/`NaN`. Pinned in Task 1 tests.
- Very long artist/venue names and quotes: poster text clamps, no overflow off the image. Quote truncated to 90 chars + `…` (Task 1 test); poster uses `lineClamp`/ellipsis (Task 3 manual check).
- Event with no photo (`event_media_url` and `images` empty): poster uses the brand background, not a broken image (Task 3).
- Late-night shows: `event_date` is UTC, so a 9pm Saturday show in Denver (`03:00Z` Sunday) would read "Sun". `formatShowDate` defaults to `America/New_York` (events carry no venue timezone), which keeps US evening shows on the right day except very late West Coast shows; Task 1 test pins the timezone parameter. Today's `formatDate` uses server UTC, so this is strictly better.
- Accented names (e.g. `Sigur Rós`): the default font renders them; endpoint returns 200 (Task 3 Step 3 check).
- Mobile keyboard open on a 90% sheet: Send and message box stay visible above the keyboard (Task 4 manual check).

---

### Task 1: Pure share copy helpers

**Files:**
- Create: `api/_lib/shareCopy.ts`
- Test: `api/_lib/shareCopy.test.ts`
- Modify: `package.json` `test` script: add `"api/_lib/shareCopy.test.ts"` to the globs.

**Interfaces:**
- Produces:
  - `starRating(score: number): string` — 0–5 in 0.5 steps → `★`/`½`/`☆`, always 5 symbols wide counting `½` as one (e.g. `4.5 → "★★★★½"`, `3 → "★★★☆☆"`).
  - `truncateQuote(text: string | null | undefined, max = 90): string` — trims, collapses whitespace, cuts at a word boundary ≤ max and appends `…`; empty input → `''`.
  - `formatShowDate(iso: string | null | undefined, timeZone = 'America/New_York'): string` — `Sat, Nov 8` (`en-US`, weekday short, month short, day numeric, given `timeZone`); invalid → `''`. Default is US Eastern because nearly all shows are US evenings, where UTC rolls the date forward.
  - `eventBubble(e: { artist?: string; venue?: string; city?: string; state?: string; date?: string | null; title?: string | null }): { title: string; description: string }`
  - `reviewBubble(r: { reviewer?: string; artist?: string; venue?: string; date?: string | null; rating?: number | null; title?: string | null }): { title: string; description: string }`

- [ ] **Step 1: Write failing tests** in `api/_lib/shareCopy.test.ts` (node:test + `assert/strict`, import `./shareCopy.ts`):
  - `starRating(4.5) === '★★★★½'`, `starRating(3) === '★★★☆☆'`, `starRating(0) === '☆☆☆☆☆'`, `starRating(7) === '★★★★★'`.
  - `truncateQuote('  a   b  ') === 'a b'`; a 200-char sentence returns length ≤ 91 and ends with `…`; `truncateQuote(null) === ''`.
  - `formatShowDate('2026-11-08T20:00:00Z') === 'Sun, Nov 8'`; `formatShowDate('2026-11-08T03:00:00Z', 'America/Denver') === 'Sat, Nov 7'`; `formatShowDate('nope') === ''`.
  - `eventBubble({ artist: 'Goose', venue: 'Red Rocks', city: 'Morrison', state: 'CO', date: '2026-11-08T20:00:00Z' })` → `{ title: 'Goose at Red Rocks', description: 'Sun, Nov 8 · Morrison, CO · on Synth' }`.
  - `eventBubble({ title: 'Some Show' })` → `{ title: 'Some Show', description: 'on Synth' }`.
  - `reviewBubble({ reviewer: 'Tej', artist: 'Goose', venue: 'Red Rocks', date: '2026-11-08T20:00:00Z', rating: 4.5 })` → `{ title: 'Tej rated Goose ★★★★½', description: 'Red Rocks · Sun, Nov 8' }`.
  - `reviewBubble({ artist: 'Goose' })` → `{ title: "Someone's review of Goose", description: '' }` (no rating, no reviewer).

- [ ] **Step 2: Run** `npm test` — Expected: shareCopy tests FAIL (module not found).

- [ ] **Step 3: Implement** the five exports in `api/_lib/shareCopy.ts`. No imports (pure, edge- and node-safe). Missing parts are dropped from joins, never rendered as `undefined`.

- [ ] **Step 4: Run** `npm test` — Expected: all pass, including existing seo/auth/shared tests.

- [ ] **Step 5: Stop for user commit** (`api/_lib/shareCopy.ts`, `api/_lib/shareCopy.test.ts`, `package.json`).

---

### Task 2: Shared fetchers + fixed review query + og:image in `api/share.ts`

**Files:**
- Create: `api/_lib/shareData.ts`
- Modify: `api/share.ts` (remove local `getSupabaseServerConfig`, `UUID_PATTERN`/`isValidShareUuid`, `fetchEvent`, `fetchReview`, `fetchArtist`, `fetchVenue`, `pickImage`, `starRating`, `formatDate`; import from the libs; set og image; use bubble copy)

**Interfaces:**
- Consumes: Task 1 `eventBubble`, `reviewBubble`, `starRating`, `formatShowDate`.
- Produces (`api/_lib/shareData.ts`):
  - `getShareSupabase(): SupabaseClient | null` — service-role client from `SUPABASE_URL`/`VITE_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (same env order as today), `{ auth: { persistSession: false } }`.
  - `isValidShareUuid(v: string | undefined | null): v is string` — moved as-is.
  - `pickEventImage(row: Record<string, unknown>): string` — moved `pickImage` logic.
  - `type ShareEvent = { id: string; title: string | null; date: string | null; image: string; artist: string; venue: string; city: string; state: string }`
  - `type ShareReview = { id: string; rating: number | null; text: string; reviewer: string; event: ShareEvent | null }`
  - `fetchShareEvent(sb, id): Promise<ShareEvent | null>` — same select as today's `fetchEvent`, flattened.
  - `fetchShareReview(sb, id): Promise<ShareReview | null>` — selects `id, rating, review_text, user_id, events ( id, title, event_date, event_media_url, images, artists ( name ), venues ( name, city, state ) )`; then `users.select('name').eq('user_id', user_id).maybeSingle()`; reviewer `name || 'Someone'`.
  - `fetchArtist`, `fetchVenue` moved unchanged (exported).
  - `ogImageUrl(base: string, kind: 'event' | 'review', id: string): string` → `${base}/api/og?${kind}=${encodeURIComponent(id)}`.

- [ ] **Step 1: Verify schema** before coding: in the Supabase SQL editor (user runs it) `select column_name from information_schema.columns where table_name='reviews' and column_name in ('rating','review_text','user_id','overall_rating');` and the same for `users` `('user_id','name')`. Expected: `rating, review_text, user_id` and `user_id, name` present. If different, update the Global Constraints line and the select before continuing.

- [ ] **Step 2: Create `api/_lib/shareData.ts`** with the exports above. Import only `@supabase/supabase-js` (no workspace packages — the existing comment in `api/share.ts` explains `@synth/shared` crashes Vercel bundling).

- [ ] **Step 3: Rewire `api/share.ts`:** event and review branches use `fetchShareEvent`/`fetchShareReview`, `eventBubble`/`reviewBubble` for `ogTitle`/`ogDescription`, and `ogImage: ogImageUrl(BASE_URL, kind, id)`. `heroImage` stays the raw photo. Review sublines keep `by <reviewer>`; add the quote line `"<truncateQuote(text)>"` when non-empty. Artist/venue branches unchanged except imports.

- [ ] **Step 4: Typecheck:** `npx tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 --skipLibCheck api/share.ts api/_lib/shareData.ts api/_lib/shareCopy.ts` — Expected: no errors. `npm test` still passes.

- [ ] **Step 5: Stop for user commit** (`api/_lib/shareData.ts`, `api/share.ts`).

---

### Task 3: `/api/og` poster endpoint + default image

**Files:**
- Create: `api/og.ts`
- Create: `public/og-default.png` (generated in Step 5)
- Modify: `package.json` dependencies: add `@vercel/og` (latest 0.x at install time)

**Interfaces:**
- Consumes: Task 2 `getShareSupabase`, `isValidShareUuid`, `fetchShareEvent`, `fetchShareReview`; Task 1 `formatShowDate`, `starRating`, `truncateQuote`.
- Produces: `GET /api/og?event=<uuid>` | `?review=<uuid>` | (none) → `image/png` 1200x630.

- [ ] **Step 1: Install:** `npm install @vercel/og` — Expected: added to `dependencies`.

- [ ] **Step 2: Implement `api/og.ts`** as an Edge function: `export const config = { runtime: 'edge' }`, `export default async function handler(req: Request): Promise<Response>`. Build elements with `React.createElement` (file is `.ts`; no JSX) and return `new ImageResponse(element, { width: 1200, height: 630, headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } })`. Any thrown error or invalid/unknown id → render the default poster (status 200).
  Layouts (all text `#FFFDFA`, lines clamped with `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` or `lineClamp: 2` for the artist):
  - **Base:** background `#0E0E0E` with radial pink glow `rgba(204,36,134,0.35)` top-right; if a photo exists, it covers the canvas (`objectFit: cover`) under a bottom fade `linear-gradient(to top, rgba(14,14,14,0.95) 0%, rgba(14,14,14,0.2) 60%, transparent)`. Wordmark bottom-right: `synth` 34px bold + 10px `#CC2486` dot.
  - **Event:** bottom-left block, padding 64px: artist 76px/800 (lineClamp 2), then `formatShowDate(date) · venue` 34px/500 at 85% opacity.
  - **Review:** same base; stars line `starRating(rating)` 48px in `#FCDC5F`; artist 64px/800 (lineClamp 1); quote `“truncateQuote(text, 90)”` 32px italic (omit if empty); `by <reviewer> · <venue>` 28px at 80% opacity.
  - **Default:** base without photo, centered `synth` 120px/800 + tagline `Find shows. Go with friends.` 36px.

- [ ] **Step 3: Local render check:** `npx vercel dev` (or a preview deploy if `vercel dev` is not set up), then open `/api/og?event=<real upcoming event id>`, `/api/og?review=<real review id>`, `/api/og?event=not-a-uuid`, `/api/og`. Expected: four PNGs, correct layouts, the bad id shows the default poster, response header `cache-control` matches the constraint. Also open one event whose artist has no image (pick from `events` where `event_media_url is null`) — brand background, no broken image. Check a long-name artist (e.g. one with 30+ chars) clamps.

- [ ] **Step 4: Typecheck** `api/og.ts` with the Task 2 tsc command (add the file). Expected: no errors.

- [ ] **Step 5: Generate the fallback:** save the `/api/og` (no params) PNG as `public/og-default.png` (`curl -o public/og-default.png <host>/api/og`). Expected: 1200x630 file present.

- [ ] **Step 6: Crawler check on preview deploy:** `curl -s -A facebookexternalhit "<preview>/share?event=<id>" | grep -E 'og:(title|description|image)'` and the same for `?review=<id>`. Expected: image URL `<base>/api/og?event=…`/`?review=…`, titles per the bubble constraint. Then paste both preview links into iMessage and WhatsApp (user) and confirm the poster shows.

- [ ] **Step 7: Stop for user commit** (`api/og.ts`, `public/og-default.png`, `package.json`, `package-lock.json`).

---

### Task 4: Mobile share sheet — taller, external sharing always available

**Files:**
- Modify: `mobile/src/components/share/ShareToChatModal.tsx` (render ~lines 293–360; styles `sheet` ~395, `list` ~453)

**Interfaces:** none new.

- [ ] **Step 1: Styles:** `sheet`: replace `maxHeight: '85%'`/`minHeight: 300` with `height: '90%'`. `list`: replace `flexGrow: 0, maxHeight: 280` with `flex: 1`. The empty/loading `centered` views get `flex: 1` so the footer stays at the bottom.

- [ ] **Step 2: Footer visibility:** split the footer so the `externalRow` (Share externally, Copy link) renders whenever `!loading`, and the message input + Send render only when `targets.length > 0`. The empty-state copy changes from `No chats or friends yet.\nStart a conversation first.` to `No chats or friends yet.\nShare the link instead 👇`.

- [ ] **Step 3: Typecheck:** `cd mobile && npx tsc --noEmit` — Expected: no new errors (the 3 existing `app/_layout.tsx` errors are pre-existing).

- [ ] **Step 4: Device check (user, Expo Go / dev build):** open share from a home event card with an account that has 0 targets (external row visible), ~3 targets, and 30+ targets (list scrolls, footer pinned). Focus search and message: Send stays above the keyboard.

- [ ] **Step 5: Stop for user commit** (`mobile/src/components/share/ShareToChatModal.tsx`).

---

### Task 5: Web share modals — taller, chats wrap into a grid

**Files:**
- Modify: `src/components/share/UniversalShareModal.tsx` (dialog style ~line 341; chat/friend row ~lines 500–700)
- Modify: `src/components/reviews/ReviewShareModal.tsx` (dialog style ~line 308; equivalent row)

**Interfaces:** none new.

- [ ] **Step 1: Dialog height:** in both files replace `maxHeight: '85vh'` with `height: '90vh'` (keep `display: flex; flexDirection: column`). The scrolling body gets `flex: 1; minHeight: 0; overflowY: 'auto'`; the external-share/footer block stays outside it so it is pinned.

- [ ] **Step 2: Grid:** each horizontal target row (`overflowX: 'auto'` containers of 64px tiles) becomes `display: 'flex', flexWrap: 'wrap', gap` unchanged, `overflowX` removed. Tile markup and sizes unchanged.

- [ ] **Step 3: External row gate:** confirm the Copy link / Text Message / More buttons render when the user has no friends or chats (search both files for conditions wrapping the "External Share Options" block, e.g. `friends.length`, `showInternalChatSection`). Remove any such condition so they always render.

- [ ] **Step 4: Typecheck:** `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "UniversalShareModal|ReviewShareModal"` — Expected: no output.

- [ ] **Step 5: Browser check (`npm run dev`):** open Share on an event and on a review at 375px and desktop widths with an account with 0, a few, and many chats. Expected: sheet opens tall, all chats visible in wrapped rows, list scrolls inside, external buttons always visible.

- [ ] **Step 6: Run `graphify update .`**, then stop for user commit (`src/components/share/UniversalShareModal.tsx`, `src/components/reviews/ReviewShareModal.tsx`).
