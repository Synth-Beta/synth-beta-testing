# Synth Setlist — personalized newsletter revamp

Unzip at the ROOT of the real Synth repository. These are ONLY the 9 changed files. The folders already match the exact production paths.

Deploy Vercel/admin AND the Supabase newsletter-send Edge Function. Then REGENERATE and review draft emails in the Newsletter Proofreader before approving or sending. See docs/newsletter-release.md.

Changes: actionable local concert recommendations based on repeated artists and taste; two separate recording recommendations; no unrelated filler news; 28-day duplicate suppression through existing drafts; no repetitive review/history or saved-count sections; one phone screenshot from your Supabase email images; unsubscribe-safe templates.

No migrations; no live account access; no production emails were sent. Preview/focused TS checks passed, but check final app build and send a test email.
