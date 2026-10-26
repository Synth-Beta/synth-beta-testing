# Newsletter discovery and delivery

The Setlist now draws on saved listening and stronger review history, confines the latest review to its recap, and favors new artists. Song recommendations require actual recording titles. Upcoming shows are checked against the edition's Monday 10 a.m. Eastern send time, not its generation time. Drafts auto-generate Mondays at 9 a.m. Eastern; admin Create/Regenerate remains available.

Every eligible account gets a draft even without reviews, listening, or a saved location. Those readers receive two hand-edited listening picks, current sourced news when available, and an explicitly evergreen album feature when news is unavailable. No activity or location is invented. The evergreen library rotates weekly; it is a small initial collection that can be expanded in `supabase/functions/newsletter-send/editorial.ts`.

## Release for October 12, 2026

1. Deploy the updated repository to the existing Vercel project. Newsletter generation runs Mondays at 13:00 and 14:00 UTC; send runs Mondays at 14:00 and 15:00 UTC. Handlers only act in the 9 a.m. / 10 a.m. America/New_York windows. On October 12 (EDT) generation is 13:00 UTC and send is 14:00 UTC. The consolidated cron function's duration is 300 seconds to accommodate paced delivery of the current-sized edition.
2. In the existing Supabase project, verify that `20261007010000_create_newsletter_drafts.sql` and `20261007180000_fix_newsletter_regeneration.sql` have been applied, and deploy `newsletter-send` (including its new supporting modules). Do not re-run unrelated migrations blindly. `newsletter-unsubscribe` must also be deployed.
3. Verify the existing production bindings for `SUPABASE_URL` (or `VITE_SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `NEWSLETTER_UNSUBSCRIBE_SECRET`. Vercel and the Edge Function must use the same sender and unsubscribe signing settings. The sender must be verified in Resend. Enter credentials in the providers' secure settings, never in source or chat.
4. Open `https://getsynth.app/admin?tab=newsletter-proof` as the existing authorized reviewer. Select **2026-10-12**. Use **Create new edition** if empty, or **Regenerate selected edition** if it already has unsent drafts. Regeneration updates unsent drafts, clears approvals, and keeps sent rows.
5. Compare the stored draft count with the eligible account count, inspect examples with full history, listening only, and no data, then approve the exact drafts intended for delivery. Scheduled and manual generation never send or approve. The automatic Monday 10 a.m. Eastern send includes only those approved drafts. **Send N approved now** is an explicit immediate-send action, not a scheduling control.
6. Check Vercel cron results and Resend delivery records. `sent` counts provider acceptance, not inbox delivery. Provider failures return a non-success response; failed drafts are released for retry. Manual and scheduled delivery use the same provider idempotency key. Resend's idempotency window is finite; inspect provider records before retrying an ambiguous result after that window.

Installation, production deployment, database migration state, live recipient coverage, and actual delivery are separate checks. Local validation does not establish production readiness. This workspace has no production Supabase/Resend/Vercel credentials; no real emails or production drafts were created during validation.

## Validation

Use Node 24. From `apps/admin`:

```sh
node --import ./scripts/newsletter-test-hooks.mjs scripts/test-newsletter-edition.ts
node --import ./scripts/newsletter-test-hooks.mjs scripts/test-newsletter-regeneration.ts
node --import ./scripts/newsletter-test-hooks.mjs scripts/test-newsletter-discovery.ts
node --import ./scripts/newsletter-test-hooks.mjs scripts/test-newsletter-delivery.ts
```

The new coverage includes 135 empty accounts, Spotify and Apple Music recordings, recap isolation, full-history ranking, catalog and feed outages, future-news exclusion, weekly rotation, Eastern Monday DST windows, and the real cron handler with mocked Supabase/Brevo responses. The delivery tests cover authorization, approval/content hashes, account eligibility, paginated drafts/unsubscribes, subscription-query failures, provider failures, unsubscribe injection, and a stable retry key.

From the repository root, `npm run build:vercel` builds both applications. The newsletter modules also pass a focused TypeScript check. The full admin type check has pre-existing failures; comparison with the unchanged checkout found no new diagnostics.

## Sources and limits

Live news comes from the configured RSS feeds. Discovery recording lookups use the public iTunes catalog, are capped at 24 distinct artists per source load, require an exact artist match, and have bounded concurrency and request deadlines. Failed lookups retain the editorial fallback. The hand-edited evergreen entries carry album/recording references and named-song Spotify search links; they are not claimed as this week's releases or live-verified ticket listings.

Newsletter source loading requires outbound access to its existing news feeds and `itunes.apple.com`. The cloud workspace's network proxy rejected live source and GitHub API checks; the required domains have been added to its configuration draft for review. That draft update does not change production networking or prove live sources are reachable.

The sender still claims a draft using the existing `sent` status before contacting the provider. A process killed after that claim can require manual reconciliation with Resend. The duration and pacing changes support a modest edition, not an unlimited audience; a large rollout should use a durable queue/outbox and provider-aware batching.
