## Implementation report — AI Scene Guides

### Changed / added

- `supabase/migrations/20260806120000_ai_scene_guides.sql` — schema, settings kill switch, shadow tables, `messages` AI columns
- `ai-scene-guides/**` — package: fixtures, JamBase/Reddit adapters, seed, planner/generator/verifier/publisher, Slack shadow, Vitest
- `slack/synth-ai-shadow/**` — Slack app manifest + install docs
- `api/slack/scene-guides/{commands,interactions,events}.ts` — Slack endpoints
- `api/cron/ai-scene-guides-shadow.ts` — cron (fail-closed; no Synth chat writes)
- `src/components/chat/AiSceneGuideUi.tsx` + constants — web disclosure UI
- `src/services/aiSceneGuideMuteService.ts` — mute preference
- `src/components/UnifiedChatView.tsx` — AI badge, bubble, room notice, mute
- `mobile/src/components/chat/AiSceneGuideUi.tsx` + `mobile/app/chat/[id].tsx` — mobile disclosure
- `apps/admin/.../AiSceneGuidesAdminPanel.tsx` + Admin tab
- Root `package.json` scripts `ai-guides:*`; `vercel.json` cron

### Commands

```bash
npm run ai-guides:install
npm run ai-guides:seed -- --genre indie --count 75 --seed 42
npm run ai-guides:dry-run -- --fixture upcoming-indie
npm run ai-guides:test
```

### Credential-dependent next steps

1. Apply migration to Supabase.
2. Set JamBase / Reddit / OpenAI / Slack shadow env vars (see `ai-scene-guides/.env.example`).
3. Install Slack app from `slack/synth-ai-shadow/manifest.json`.
4. Keep `AI_SCENE_GUIDES_ENABLED=false` until shadow pilot GO.
5. Create one system sender user for Phase 4 production writes (not per-persona Auth users).

### Known limitations

- Live JamBase setlists disabled (`setlist: null` in project contract).
- Shadow review queue state is process-local until persisted to `shadow_reviews` via service role in a follow-up.
- OpenAI generation falls back to heuristic stub without `OPENAI_API_KEY`.
