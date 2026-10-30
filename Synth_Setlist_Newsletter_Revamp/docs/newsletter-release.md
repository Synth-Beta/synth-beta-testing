# The Synth Setlist — recommendation-first update (Oct 29, 2026)

## What changed

The weekly issue is now a **discovery email**, not a recap of the reader's account.

- Rank actual upcoming concerts within the existing 75-mile saved-location check, prioritizing repeated live artists, followed/listened artists, then matching genres and saved dates. Never substitute a far-away city when location is unknown.
- Mention concert history **only as a reason for a recommendation** (for example, "You've logged 3 Goose shows. Here's another chance to see them"). No recurring "latest review", "22 nights", or "85 saved shows" cards.
- If no safe nearby ticket/event link exists, **omit the concert cards** instead of inventing a nearby show or ticket availability. Still produce two listening recommendations.
- Use up to one real, sourced recording from a nearby relevant event artist (when an eligible recording exists) plus curated editorial songs. Unverified ticket links are never sent as tickets.
- Show news only if it genuinely matches an artist, a high-confidence genre headline, or a specifically supported local scene. No unrelated news just to fill space.
- Read source URLs and track picks from the previous 28 days' `newsletter_drafts.sources` JSON and avoid repeats where enough alternatives exist. This uses the existing database schema.
- Show a fan connection card only when another account really has a public five-star review of the same artist. Otherwise omit the entire card.
- Replace the repetitive black "After the encore" marketing closer with a single smaller app preview containing the already-hosted Upcoming Shows phone screenshot.
- Preserve unsubscribe placeholders and teach the Edge Function to replace them without depending on the old inline CSS string.

## Files to deploy

Copy files from this archive onto the **matching paths in the Synth repository**. These are not the same paths as the original CHAT_NEWS handoff folders.

- `apps/admin/src/lib/newsletterEdition/{compose,render,types,gather}.ts`
- `supabase/functions/newsletter-send/{index,queries,news}.ts`
- `api/_lib/newsletterSource.ts`

**Deploy the Vercel/admin app and Supabase `newsletter-send` Edge Function** so the admin loader, scheduled generator and live draft source agree. No migration is needed for the past-issue repeat filter.

## Screenshot

The new renderer uses the supplied, signed Supabase Storage URL for `email-pictures/upcoming_shows.png`, linking the screenshot back to `https://join.getsynth.app/`. For best long-term reliability, host that asset at a **permanent public read-only URL** and replace `PHONE_IMAGE` in `render.ts` before release; private signed URLs can stop working if signing keys or access rules change. Specific in-app deep links are not claimed until actual routes are confirmed.

## Validation before sending

1. Merge the files, type-check/build the full repo, deploy the Edge Function and Vercel app.
2. Generate/regenerate an **unsent** edition in `/admin?tab=newsletter-proof`. Regeneration may clear prior approvals; reapprove the exact new content.
3. Preview at least: repeat-show artist with nearby date; repeat-show artist with no date; accounts with no location; no reviews; streaming-only accounts; accounts with a recent prior issue.
4. Confirm only genuinely relevant news appears, all sources point to valid content, image loads in Gmail/Apple Mail, ticket notices are accurate, and mobile layout fits.
5. Send a TEST EMAIL and verify the unsubscribe URL is a real individualized link (not the literal `{{unsubscribe_url}}`). Verify delivery provider is Brevo in your live settings.
6. Approve/send only after review. These files do not send email just by being copied.

## Local test results

Focused TypeScript checks and representative unit-level fixture cases passed for local repeat-artist shows, no location, no local ticket links, news filtering, source rotation, and HTML escaping. This archive does **not** include the rest of the live repo, production credentials, actual subscriber data, or end-to-end email delivery tests; therefore deployment and deliverability have not been verified here.
