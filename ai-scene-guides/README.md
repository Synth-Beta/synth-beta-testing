# AI Scene Guides

Transparent, disclosed AI conversation starters for Synth genre rooms — grounded in JamBase and aggregate Reddit topic signals. **Not** human-impersonating bots.

## Trust rules

- Every message has `author_type = ai_scene_guide` and visible **AI Scene Guide** disclosure.
- No lived-experience claims, fake consumer accounts, Reddit usernames, or social-proof metrics.
- Production posting defaults **OFF** (`AI_SCENE_GUIDES_ENABLED=false`, DB `ai_scene_guides_settings.enabled=false`).
- Slack shadow mode has **no path** that inserts into Synth `messages`.

## Contextual seed (Take 5 — current)

One decision per generation transaction from simulated room state. Records **POST**, **REPLY**, and **SILENCE**. Do **not** run another 1,000-message prewritten batch.

Requirements enforced in `contextualSeed.ts` + `writingGuide.ts` (`RULE_VERSION=contextual-1.0`):

1. Distinct `generation_id` / `generated_at` per decision (no prewritten multi-turn graphs)
2. Personas bound 1:1 to `sender_slot` + display name
3. Replies store `parent_span` / `addressed_parent_span`; filler reactions fail
4. Exact duplicates and entity-normalized template families over 2% fail
5. Pilot cadence: 12m same-room gap, 3 starts/room-day, 6 AI/room/day, `America/New_York`
6. Grounding fields required: `source_field_path`, `cited_fact_ids`, `source_retrieved_at`
7. Human review still required before any “all gates passed” claim (`reviewer_decision`)

Admin: **Clear queue** → **Voice & strategy** (edit + preview) → **Contextual test (200 decisions)**.
Voice/strategy persist on `ai_scene_guides_settings.writing_strategy` so copy changes do not require a new deploy.

```bash
cd ai-scene-guides && npm test -- src/pipeline/contextualSeed.test.ts
```

## Modes

| Mode | Behavior |
|---|---|
| `fixture` | Deterministic fixtures, dry-run audits only |
| `shadow_slack` | Live or fixture pipeline → private Slack review only |
| `staff_approve` | Manual approve before Synth chat write |
| `production` | Gated room posting (requires env + DB enable) |

## Quick start

```bash
cd ai-scene-guides
npm install
cp .env.example .env

npm run seed -- --genre indie --count 75 --seed 42
npm run dry-run -- --fixture upcoming-indie
npm run dry-run -- --fixture upcoming-indie --simulate-human
npm test
```

Fixtures: `upcoming-indie`, `hiphop-setlist-complete`, `electronic-no-setlist`, `metal-humans-active`, `pop-stale-setlist`, `prompt-injection`.

## JamBase setlists

This project's JamBase event contract does **not** include setlists (`setlist: null` in sync). Live `JamBaseSourceAdapter.fetchRecentSetlists` always returns `[]`. Fixture setlists are labeled `dataSegment: fixture` for pipeline tests only.

## Slack shadow pilot

1. Create a private Slack app from [`../slack/synth-ai-shadow/manifest.json`](../slack/synth-ai-shadow/manifest.json).
2. Invite the bot to `#synth-ai-shadow-feed`, `#synth-ai-shadow-alerts`, `#synth-ai-shadow-daily`.
3. Set env vars from `.env.example` (`AI_SHADOW_*`).
4. Deploy Vercel routes under `api/slack/scene-guides/*`.
5. Run Day 0 smoke tests before starting the 7-day clock.

Commands: `/synth-shadow status|pause|resume|kill|sample <genre>|export`

```bash
AI_SCENE_GUIDES_MODE=shadow_slack npm run shadow -- --fixture upcoming-indie
# with credentials + --post to deliver
```

## Kill switch

- Env: `AI_SCENE_GUIDES_ENABLED=false`
- DB: `UPDATE ai_scene_guides_settings SET enabled = false WHERE id = 'global'`
- Slack: `/synth-shadow kill CONFIRM KILL`

## Mute

Users can mute AI guides per room (`ai_scene_guide_room_prefs.mute_ai_guides`). Publisher respects immediately.

## Rollout

1. Fixture-only local  
2. Seven-day Slack shadow  
3. Staff-only rooms (manual approve)  
4. Small genre pilot (1–2 msgs/day)  
5. Measured expansion  

Never auto-enable production after the pilot.
