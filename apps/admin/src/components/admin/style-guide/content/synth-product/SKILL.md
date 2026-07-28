---
name: synth-product
description: Synth company context, mission, team, product surfaces, and data model overview for agents. Load when writing copy, planning features, onboarding new tooling, or answering questions about what Synth is. For visual tokens see synth-brand. For agent working rules see synth-ai-dev-guide.
---

Version: 26.07.26


# Synth Product & Company Context

**Live guide:** [styleguide.getsynth.app](https://styleguide.getsynth.app) (admin-gated).

Sources compiled for this skill: getsynth.app, LinkedIn company page `getsynthapp`, Synth git history / design system docs, and Supabase product schema overview (no end-user PII).

## What Synth Is

Synth is a live music discovery and community platform. Fans find concerts, connect with peers who share their taste, review shows, and keep a passport of their live music life.

Public framing used in launch posts: **the Letterboxd for live music**.

Marketing line: **Discover, Connect, Share.** Going to shows just got easier.

Voice for all copy: follow `synth-brand/reference/writing-style-guide.md` exactly.

Homepages: [getsynth.app](https://getsynth.app/), web app entry [join.getsynth.app](https://join.getsynth.app/), App Store distribution.

## Mission

Music is better when shared. Synth was born from missing amazing concerts because no one was free to go. The team is building the platform they wished existed: safe, friendly concert experiences and real community around live music.

## Vision

A world where every music lover can find their people and every show sparks lasting connections powered by community.

## Problem Narrative (from public LinkedIn)

Live music is everywhere, but the experience is scattered:

- Shows live in ticketing apps
- Songs live in streaming services
- Memories live in camera rolls
- Opinions live in group chats
- Setlists live online

After the night ends, none of it connects. Synth covers the whole live event journey: track shows, review while the memory is fresh, discover live music across the world, and find people to go with so shows do not have to be solo.

## History

1. Early product / repo identity as PlusOne (event crew): discover local events and find people to attend with.
2. Expanded and rebranded as Synth: social concert discovery, personalized feed, passport, chats, streaming taste.
3. 2026 public messaging: App Store availability; web release at join.getsynth.app for browser access.
4. Engineering direction: Expo React Native under `mobile/` is the primary store app; root Capacitor iOS/Android WebView is legacy maintenance.

## Team (public)

| Person | Role | Notes |
|--------|------|-------|
| Sam Loiterstein | Co-Founder & CEO | Product leadership; community and concert experience |
| Tej Patel | Co-Founder & CTO | Engineering; privacy-conscious platforms |
| Lauren Pesce | CPO / Frontend & UX | Product strategy, UX, frontend; joined via LinkedIn portfolio path |
| Theo Kagan | Operations | Listed on company LinkedIn; building Synth |

Company LinkedIn: Social Networking Platforms, privately held, ~2-10 employees, alias `synth`, homepage getsynth.app.

## Product Surfaces

| Surface | Job to be done |
|---------|----------------|
| Discover | Artists, venues, events; location and vibe selection |
| Home / Feed | Personalized feed (v5), friend activity, recommendations |
| Passport | Stamps, timeline, achievements, bucket list, travel map |
| Reviews | Concert reviews, media, setlists, friend tags |
| Chat | DMs, groups, genre chats, verified entity chats |
| Onboarding | Profile, scene/city, artists, genres, streaming |
| Streaming | Spotify / Apple Music sync into preference signals |
| Notifications | In-app + push (Expo tokens) |
| Admin | Internal tools for `account_type = admin` |

## Platform Map (repo)

- `mobile/`: Expo Router app (primary native UX, EAS store path)
- `src/` + Vite: web app / legacy Capacitor bundle source
- `packages/synth-shared/`: shared business logic
- `supabase/`: migrations, functions, SQL ops packs
- `api/`: Vercel serverless (cron, share, Spotify sync, push webhook)
- `styleguide/`: this style guide site and downloadable skills

## Data Model Overview (for agents)

Confirm columns in migrations before writing SQL. Do not invent schema. Never export end-user PII into public artifacts.

Core domains:

- **Identity:** `users`, `users_complete` view (`account_type`: user | creator | business | admin)
- **Catalog:** `events`, `artists`, `venues`, genres / entity media
- **Social proof:** `reviews`, friend tags, likes/comments where present
- **Social graph:** friendships, celebrations, similar users
- **Messaging:** `chats`, `chat_participants`, `messages` (encryption where enabled)
- **Passport:** passport identity / timeline / achievements / bucket list tables
- **Personalization:** `user_preference_signals`, feed cache, cluster affinity
- **Ops:** push device tokens, notifications, admin_actions, moderation flags
- **Ingest:** JamBase sync state, Ticketmaster / Shotgun scripts, Spotify artist linking

Admin access for internal tools (including this style guide) uses the same Supabase Auth session and requires `users.account_type = 'admin'`.

## Goals (product)

- Make going to shows easier and less solo
- Connect fans through shared taste and shared nights
- Capture live history in a passport worth returning to
- Personalize discovery around live taste and friends
- Ship native-quality mobile (Expo) with accessible web entry

## Facts Agents Must Not Invent

- Exact MAU, revenue, fundraising, or private metrics unless provided in-session
- Extra founders or titles beyond the table above
- Non-pink primary brand colors
- Capacitor as the primary store path (Expo under `mobile/` is primary; Capacitor is legacy)
