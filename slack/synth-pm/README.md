# Synth PM (Slack)

Classic Slack app (same pattern as **Signup Alerts** and **#alerts** ops) — not Slack next-gen CLI.

Vercel routes talk to Supabase (`pm_*` tables). Slash commands + interactivity create the org todo repository.

## Commands

| Command | What it does |
|---|---|
| `/task assign @person "Title" [#project] [due:YYYY-MM-DD]` | Create + assign |
| `/task status T-XXXX <todo\|active\|in_progress\|blocked\|stalled\|complete>` | Update state |
| `/task mine` | Your open tasks |
| `/task org` | Full org open list |
| `/task list [@person\|#project]` | Filtered list |
| `/task sub T-XXXX "Sub-task"` | Sub-task |
| `/task project create\|list` | Projects |
| `/notes` | Modal or paste → LLM proposes tasks → Confirm |

## Setup

### 1. Apply SQL

Run in Supabase SQL editor:

`supabase/migrations/20260729120000_slack_pm.sql`

### 2. Create classic Slack app

1. [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From an app manifest**
2. Paste `slack/synth-pm/manifest.json` (or create from scratch and copy URLs/scopes from it)
3. **Install to Workspace**
4. Copy **Bot User OAuth Token** (`xoxb-…`)
5. **Basic Information** → copy **Signing Secret**

### 3. Push env to Vercel

```bash
export SLACK_PM_BOT_TOKEN='xoxb-…'
export SLACK_PM_SIGNING_SECRET='…'
# optional — meeting notes extraction (falls back to heuristic without it)
export OPENAI_API_KEY='…'

npm run slack:setup-pm -- --write-env-local --push-vercel
vercel --prod
```

### 4. Smoke test

In Slack:

```text
/task project create "Launch"
/task assign @you "Wire Synth PM" #Launch
/task mine
/notes
```

## Env vars

| Variable | Required |
|---|---|
| `SLACK_PM_BOT_TOKEN` | yes |
| `SLACK_PM_SIGNING_SECRET` | yes |
| `SUPABASE_URL` | yes (already on Vercel) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes (already on Vercel) |
| `OPENAI_API_KEY` | recommended for `/notes` |
| `OPENAI_PM_MODEL` | optional (default `gpt-4o-mini`) |

## Why not Incoming Webhooks only?

Signup + ops alerts only *post* to Slack. PM needs slash commands, modals, and buttons — still a **classic** Slack app, just with bot token + interactivity (your workspace isn’t on Slack’s next-gen Deno platform).
