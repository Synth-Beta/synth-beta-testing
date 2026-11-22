# charles-design-tips

![All 20 tips as cards, each a small app screen before its fix (top, the flaw marked in red) and after it (bottom, the fix marked in green), from a left-aligned paragraph and slimmer buttons to an empty state with a New project button and a bigger Get started button](examples/tips.jpg)

Makes your screens look designed instead of thrown together: 20 practical design tips, as steps your agent follows
whenever it builds or reviews a screen.

```bash
npx skills add LemonFace0309/charles-skills --skill charles-design-tips
```

Add `-g` to install it for every project, or copy this folder into `~/.claude/skills/` (Claude Code) or
`~/.agents/skills/` (Codex).

## What it does

- Sets the type: long text left-aligned, body text regular, headlines tighter than body, mixed sizes on one baseline
- Measures the spacing and colour: buttons sized from their text, more room above headings, blue-tinted greys,
  layered shadows, calmer colours in dark mode
- Fixes the words and the dead ends: labels above fields, sentence case, buttons that say what they do, and a next
  step in every empty state

Ask it to review instead and you get a table of fixes, worst first.

## Try it

```text
/charles-design-tips the signup form
/charles-design-tips review the settings screen and give me a table of fixes
```

## Needs

Nothing beyond your agent.

## Pairs with

[charles-polish](../../design/charles-polish/) for the details people feel, like hit areas, focus and layout shift,
[charles-unslop](../../design/charles-unslop/) first if the screen still looks AI-made,
[charles-color-analysis](../../design/charles-color-analysis/) when the colours themselves are the problem, and
[charles-design-laws](../charles-design-laws/) for what belongs on the screen and how it's grouped, and
[charles-ux-animation](../charles-ux-animation/) for how it moves and responds.

## Credits

Twelve of the tips (1–4, 6, 9, 10, 12, 13, 15, 18 and 20) are from Dan Liu's threads
[10 practical tips for improving your text layout](https://x.com/danliu/status/1576997489529344001) and
[10 practical tips for choosing colors](https://x.com/danliu/status/1579536039139758080). #20 is his tip on marketing
pages, which I aimed at the main button. The other eight (5, 7, 8, 11, 14, 16, 17 and 19) are Emil Kowalski's design
rules from [aiforui.dev](https://aiforui.dev).
