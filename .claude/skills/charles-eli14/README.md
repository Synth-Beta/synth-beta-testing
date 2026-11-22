# charles-eli14
<!-- text-only -->

Explains anything the way a great teacher would explain it to a sharp 14-year-old: the answer first, the real terms
kept and defined, and an analogy only where an idea is genuinely hard.

```bash
npx skills add LemonFace0309/charles-skills --skill charles-eli14
```

Add `-g` to install it for every project, or copy this folder into `~/.claude/skills/` (Claude Code) or
`~/.agents/skills/` (Codex).

## What it does

- Answers the question in its first sentence, then builds the detail in order, never pointing at something you
  haven't seen
- Keeps the real words (bold the first time, defined in the same sentence) instead of swapping in baby words, and
  spells out every abbreviation
- Uses one analogy at most, says where it breaks, and never talks down or announces what it's about to do

## Example

"Explain anti-aliasing like I'm 14", answered with the skill:

> **Anti-aliasing** is a trick that makes diagonal and curved edges on a screen look smooth instead of jagged.
>
> Your screen is a grid of **pixels**, tiny squares that each show one colour. A straight vertical line fits the grid
> fine. A diagonal line doesn't, because a square can't follow a slant. If each pixel has to be either fully black or
> fully white, the line comes out as a staircase. People call those steps "jaggies".
>
> Anti-aliasing fixes this by letting pixels be in between. Say a black diagonal line cuts across a white pixel and
> covers about 30% of it. Instead of rounding that pixel to white or black, the computer colours it 30% of the way to
> black, a light grey. Along the whole edge you get a mix of greys. Your eye blends them and reads one smooth line, so
> the steps are hard to see.
>
> …
>
> So, in one line: anti-aliasing smooths jagged edges by shading edge pixels in between the two colours, based on how
> much of each pixel the edge covers.

In the same test without the skill, the answer to "How does HTTPS keep my data private?" stacked three analogies:
passing notes, a padlock and an ID card.

## Try it

```text
/charles-eli14 how does HTTPS keep my data private?
/charles-eli14 what is an interest rate, really?
/charles-eli14 explain this error message: TypeError: cannot read properties of undefined
```

## Pairs with

[charles-learn-anything](../charles-learn-anything/) when a topic deserves a full lesson with demos and a voice.
