---
name: Synth Mobile port fallback
description: Expo dev script PORT env var handling — bare $PORT crashes when unset.
---

The Expo artifact's dev script uses `--port $PORT`. When PORT is not injected (e.g. workflow system doesn't always set it), this crashes with "option requires argument: --port".

**Fix:** Use `${PORT:-8081}` instead of `$PORT` in the dev script in package.json.

**Why:** Replit workflow system sometimes doesn't inject PORT into the pnpm exec child process environment.

**How to apply:** Any time the Expo mobile artifact's dev script is modified, ensure the port arg uses the fallback form.
