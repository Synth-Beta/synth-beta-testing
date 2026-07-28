---
name: synth-ai-dev-guide
description: How Synth works with AI coding agents. Load when starting work on Synth, planning features, finishing a session, or updating docs. Companion skills: synth-brand (visual), synth-product (company and product context).
---

Version: 26.07.26


# Synth AI Developer Guide

Behavioral guide for agents working on Synth. Visual standards live in `synth-brand`. Company and product facts live in `synth-product`.

## When to load

- Starting work on any Synth package (`mobile/`, `src/`, `api/`, `supabase/`, `styleguide/`)
- Planning a feature, refactor, or bugfix
- Touching design tokens, copy, or logo assets
- Making destructive or ambiguous changes (migrations, auth, deletes)

## Core truths for writing

**Authoritative voice file:** `synth-brand/reference/writing-style-guide.md`. Apply that document exactly to every draft, prompt, product string, commit message prose, and marketing line. Do not substitute a shorter paraphrase when writing user-facing copy.

Highlights agents must not violate (full checklist is in the file):

- No em dashes. No en dashes. Hyphens only for compounds and ranges.
- Lead with the point. Active voice. Concise.
- No contrastive pairings. No rhetorical negation. No flowery openers.
- No bare sentence-opening "This," "It," or "That" without a noun.
- Cut adverb intensifiers and the banned-phrase list in the guide.
- No dropped subjects, hedged asks, hollow closings, or vague time qualifiers.
- Run the editing checklist in the writing style guide before publishing copy.

Also:

- Do not invent brand facts, metrics, file paths, or schema. Ask or search.
- Prefer Synth pink system over generic purple SaaS aesthetics in design.

## Working rules

### 1. No hallucinations

If you do not know a path, column, RPC, or brand decision, search the repo or ask. Fabricated answers create rework.

Always verify before asserting:

- File paths and module names
- Supabase table/column shapes
- Business rules and account types
- Brand colors, logo usage, team titles (defer to `synth-brand` / `synth-product`)

### 2. Plan before large builds

For multi-file or ambiguous work, summarize what changes, where, what done looks like, and what is out of scope. If mid-build reality differs from the plan, stop and re-plan.

### 3. Expo first for new mobile UX

- New phone screens and gestures belong in `mobile/` (Expo Router + React Native).
- Capacitor (`ios/`, `android/` + Vite `dist/`) is legacy. Only rebuild Capacitor when web `src/` changes must ship in that shell (`npm run ios:build`).
- Do not start parallel SwiftUI/Compose rewrites of RN screens. Native only for Expo modules / thin SDK bridges.

### 4. Design tokens are law

- Web: `src/styles/tokens.css`, `src/config/tokens.ts`, `src/styles/DESIGN_SYSTEM_STYLE_GUIDE.md`
- Mobile: `mobile/src/tokens/SynthTokens.ts` (hex literals mirroring CSS)
- Page backgrounds: `--neutral-50`
- No Tailwind typography/color classes for product UI colors/type when the design system forbids them

### 5. Auth and admin

- Admin surfaces (including styleguide.getsynth.app) require Supabase Auth plus `users.account_type = 'admin'` via `users_complete`.
- Trusted vendors get access by granting admin, not by a separate shared password store.
- Never put service-role keys in client bundles.

### 6. Data safety

- No end-user PII in style guides, skills, commits, or public posts.
- Prefer aggregate / schema documentation over row dumps.
- Migrations go through the existing Supabase workflow; do not invent production schema changes casually.

### 7. Suggest without silent scope creep

Propose improvements, but do not expand the task without approval. Keep diffs focused.

## Suggested install locations

Unzip `synth-skills-bundle.zip` so these folders exist:

```
.cursor/skills/synth-brand/
.cursor/skills/synth-product/
.cursor/skills/synth-ai-dev-guide/
```

or

```
.agents/skills/synth-brand/
.agents/skills/synth-product/
.agents/skills/synth-ai-dev-guide/
```

Alternatively paste `llms-full.txt` into agent context.

## Done checklist for UI work

- [ ] Colors/spacing/type use tokens
- [ ] Touch targets meet 44px where interactive
- [ ] Screen margins 20px on mobile product screens
- [ ] New mobile work landed in `mobile/` unless explicitly Cap-only
- [ ] No invented brand or company facts
