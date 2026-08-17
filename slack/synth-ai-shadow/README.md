# Synth AI Shadow Slack app

Private staff app for the **AI Scene Guides** seven-day shadow pilot.

## Scopes (minimal)

- `chat:write` — post review cards
- `commands` — `/synth-shadow`
- `im:write` — App Home / DM acknowledgements

Do **not** request workspace-wide message history scopes. The pilot reviews generated AI output only.

## Install steps

1. Create a new Slack app → **From a manifest** → paste [`manifest.json`](./manifest.json).
2. Replace `JOIN.GETSYNTH.APP` with your Vercel host.
3. Install to the test workspace.
4. Copy **Bot User OAuth Token** → `AI_SHADOW_SLACK_BOT_TOKEN`.
5. Copy **Signing Secret** → `AI_SHADOW_SLACK_SIGNING_SECRET`.
6. Create private channels and invite the bot:
   - `#synth-ai-shadow-feed`
   - `#synth-ai-shadow-alerts`
   - `#synth-ai-shadow-daily`
7. Set channel IDs and reviewer Slack user IDs in env.
8. Use **separate** credentials for development vs the seven-day pilot.

## Endpoints

| Path | Purpose |
|---|---|
| `/api/slack/scene-guides/commands` | `/synth-shadow` |
| `/api/slack/scene-guides/interactions` | Buttons / modals |
| `/api/slack/scene-guides/events` | App Home opened |
| `/api/cron/ai-scene-guides-shadow` | Scheduled shadow runs |

## Uninstall

Remove the app from the workspace; revoke tokens; set `AI_SCENE_GUIDES_ENABLED=false`.
