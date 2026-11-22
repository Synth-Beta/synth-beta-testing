# charles-unreasonable-craft
<!-- text-only -->

Holds a new site, page, app screen or redesign to the bar of an Awwwards Site of the Day and an Apple Design Award.

```bash
npx skills add LemonFace0309/charles-skills --skill charles-unreasonable-craft
```

Add `-g` to install it for every project, or copy this folder into `~/.claude/skills/` (Claude Code) or
`~/.agents/skills/` (Codex).

## What it does

- Renders three or more directions side by side before picking one
- Designs from one system and generates its own assets
- Checks every page and animation frame by frame at every screen size, then has a fresh critic score the result

## Try it

```text
/charles-unreasonable-craft a landing page for my ceramics studio
/charles-unreasonable-craft redesign the onboarding screens of my iOS app
```

## Needs

Node 18+, ffmpeg and Google Chrome for its capture scripts, and Xcode for iOS apps. It expects Josh Puckett's
interface-craft skill next to it. Generated assets use whichever API keys you have (fal, OpenAI, Gemini, ElevenLabs,
Replicate).

## Pairs with

[charles-polish](../charles-polish/) for a pass on a screen that's already built, and
[charles-hero-mockups](../../drops/charles-hero-mockups/) to try art directions as images before building.
