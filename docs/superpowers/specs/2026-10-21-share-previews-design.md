# Share previews + taller share sheet — design

Date: 2026-10-21
Status: approved 2026-10-21

## Goal

Make Synth links look good when pasted into iMessage, WhatsApp, Discord and other
chats, so people spread the word. Secondary: make the in-app share sheet taller so a
user can see all their group chats and friends without scrolling a tiny box.

Success: a pasted event or review link shows a branded Synth poster with the key
details; the share sheet shows the full list of chats at a glance.

## Out of scope

- Instagram Stories share images.
- Group-chat "who's interested / going" feature (separate design later).
- Any new buttons or sections in the share sheet. Layout stays as it is.

## Part 1: branded link preview (events and reviews)

### Today

- `api/share.ts` serves OG tags to crawlers. `og:image` is the raw event photo, no
  branding.
- Review previews likely fail: `fetchReview` selects `reviews.overall_rating` and a
  `profiles` relation. The app reads `reviews.rating` and the `users` table, so the
  query errors, `data` is null, and the crawler is redirected to the SPA (generic tags).
- `FALLBACK_IMAGE` points at `/og-default.png`, which is not in `public/`.

### Change

1. **New endpoint `api/og.tsx`** using `@vercel/og` (new dependency), returning a
   1200x630 PNG.
   - `GET /api/og?event=<uuid>`: artist photo full-bleed with a dark bottom fade;
     artist name (large, bold); `Sat, Nov 8 · Red Rocks`; small Synth wordmark
     bottom-right.
   - `GET /api/og?review=<uuid>`: same base; star rating; one-line quote from the
     review (truncated, ~90 chars); `by <reviewer name>`.
   - Missing photo: brand background (near-black `#0E0E0E` with the pink glow used
     on the web home background) instead of a photo.
   - Validate the uuid the same way `api/share.ts` does (`isValidShareUuid`); bad or
     unknown ids return the default image, never an error page.
   - Cache: `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800`.
   - Colors follow the no-pure-white/black rule: off-white `#FFFDFA` text on
     near-black.
2. **`api/share.ts`** sets `og:image` / `twitter:image` to
   `${BASE_URL}/api/og?event=<id>` or `?review=<id>`. The hero image on the HTML
   landing page keeps using the raw photo.
3. **Bubble text** (`og:title` / `og:description`):
   - Event: title `Goose at Red Rocks`, description `Sat, Nov 8 · Morrison, CO · on Synth`.
   - Review: title `<Reviewer> rated <Artist> ★★★★½`, description `<Venue> · <date>`.
4. **Fix the review query**: select `rating`, `review_text`, `user_id`; look up the
   reviewer's `name` from `users` by `user_id`. Verify column names against the live
   schema before shipping.
5. **Add `public/og-default.png`** (1200x630, Synth brand) as the fallback. It can be
   produced once from the `/api/og` default render and checked in.
6. The OG endpoint shares the event/review fetch logic with `api/share.ts`: move the
   fetchers into `api/_lib/shareData.ts` and import them from both.

### Testing

- Unit-free check: hit `/api/og?event=<real id>`, `?review=<real id>`, a bad id and
  a photo-less event on a preview deploy; eyeball the PNGs.
- Paste preview-deploy share links into iMessage, WhatsApp and Discord.
- Validate tags with a crawler UA:
  `curl -A facebookexternalhit "<preview>/share?review=<id>"` shows the `/api/og`
  image URL and the new title.

## Part 2: taller share sheet (layout unchanged)

### Mobile — `mobile/src/components/share/ShareToChatModal.tsx`

- `sheet`: fixed height ~90% of the screen (instead of `maxHeight: '85%'`), so it
  opens tall even with few chats.
- `list`: remove `maxHeight: 280`; `flex: 1` so the chat/friend list fills the sheet
  and scrolls inside it. Footer (external buttons, message, Send) stays pinned at
  the bottom.

### Web — `src/components/share/UniversalShareModal.tsx`, `src/components/reviews/ReviewShareModal.tsx`

- Dialog: `height: 90vh` (instead of `maxHeight: 85vh`).
- Chats/friends: the horizontal scroll row wraps into a grid of the same avatar tiles
  (`flex-wrap`), inside a vertically scrolling area, so every group chat is visible.
  Tile design is unchanged. Footer stays pinned.

### Testing

- Mobile: open share with 0, 3 and 30+ targets; list scrolls, footer always visible,
  keyboard (search and message) does not hide Send.
- Web: same three cases at phone width (375px) and desktop.

## Bug fix (in scope): external sharing for users with no chats

- Mobile: when a user has no chats or friends, the footer is not rendered, so a
  brand-new user cannot Share externally or Copy link. Render the external row
  (Share externally, Copy link) whenever the sheet is loaded, regardless of
  `targets.length`. The message box and Send stay hidden when there are no targets.
- Check the web modals for the same gate and remove it if present.
