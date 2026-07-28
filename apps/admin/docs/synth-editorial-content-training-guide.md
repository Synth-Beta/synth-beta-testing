# Synth Editorial Content Training Guide

## From research evidence to publishable platform copy

**Version:** 1.0  
**Scope:** Instagram, LinkedIn, Substack, and Reddit  
**Primary use:** Prompting, few-shot examples, model evaluation, editor training, and QA for Synth's DC editorial automation

---

## 1. The standard

Good Synth content does four things:

1. **Tells the reader something specific.**
2. **Shows where the information came from.**
3. **Adapts the same research to the actual behavior of each platform.**
4. **Sounds like a music fan with editorial judgment, not a database describing its own output.**

The current drafts do not meet that standard. They summarize internal retrieval activity instead of turning evidence into a useful story.

> Bad: "Recent sentiment analysis shows 62 positive signals from various platforms."

This is not a publishable claim. It does not say:

- What counts as a signal
- How many total signals were reviewed
- Which platforms were included
- What date range was measured
- How duplicate or promotional posts were handled
- Whether the result reflects reviews, comments, likes, event listings, or news mentions
- Whether the classification was manually checked

If the system cannot answer those questions, the number belongs in an internal research dashboard, not in public copy.

> Better internal finding: "The research run collected 84 unique venue mentions from January 1 through June 30, 2026. Sixty-two were classified as positive after duplicates and first-party promotional posts were removed. The most common positive themes were sound quality, staff, and sightlines."

> Better public sentence: "Across recent fan discussions reviewed by Synth, people most often praised the room's sound and staff."

The public sentence is only allowed if the underlying research record contains the date range, denominator, source list, methodology, and representative evidence.

---

## 2. What is wrong with the current copy

| Problem | Current pattern | Why it fails | Required correction |
| --- | --- | --- | --- |
| Internal metadata presented as insight | "62 positive signals" | The reader cannot interpret or verify it | Translate a validated pattern into plain language or omit it |
| Generic praise | "one of the most significant venues" | It could describe almost any established venue | Prove significance with a concrete fact, scene, or consequence |
| Empty abstraction | "cultivated a vibrant ecosystem" | No person, action, or evidence appears | Name what the venue did and why it matters |
| Repeated thesis | "key player," "cornerstone," "vital hub" | Four platforms receive the same generic claim | Give each platform a distinct editorial job |
| Unearned conclusion | "fans are eager for more live music opportunities" | Positive venue mentions do not prove unmet demand | State only what the evidence directly supports |
| Engagement bait | "Share your thoughts and experiences!" | The question is broad and gives readers no reason to answer | Ask one specific, answerable question |
| Forced promotion | "Join us on Synth" | The post gives too little value before asking for action | Use a natural CTA that matches the reader's next step |
| Missing title strategy | Blank title fields | The post has no framing or click reason | Generate a platform-appropriate title when the field is public |
| Hashtag stuffing | Seven broad Instagram tags | Broad tags add noise and weaken positioning | Use zero to four specific tags only when relevant |
| False platform adaptation | Same paragraph at different lengths | Shortening is not adaptation | Change the angle, form, and CTA for each platform |

### Language that should trigger an automatic rewrite

Unless the phrase is supported by precise evidence, reject or replace:

- iconic venue
- vibrant ecosystem
- cornerstone of the scene
- key player
- vital hub
- artists and fans alike
- strong community engagement
- influence remains strong
- continues to evolve
- enduring appeal
- renowned artists
- memorable experiences
- underscores its role
- it's clear that
- stay tuned
- support local venues
- share your thoughts
- music lovers

These phrases are not always grammatically wrong. They are editorially weak because they hide the absence of a real point.

---

## 3. Research must produce evidence, not a summary blob

### 3.1 Source hierarchy

Use the strongest available source for each kind of claim.

| Tier | Source type | Best for | Examples |
| --- | --- | --- | --- |
| 1 | First-party canonical | Dates, doors, age policy, lineup, address, ticket status, venue history | Venue calendar, artist site, ticketing page, Synth event record |
| 2 | Public records and institutional sources | Permits, transit, neighborhood facts, preservation, public programming | WMATA, DC government, tourism board |
| 3 | Reputable reporting | Context, change over time, interviews, controversy, cultural significance | Local news, music press, trade press |
| 4 | Specialist editorial sources | Scene knowledge, genre context, recommendations, reviews | DC music publications, jazz calendars, concert reviewers |
| 5 | Community sources | Experience, recurring complaints, rituals, tips, emotional language | Reddit, Synth reviews, public forum discussions |
| 6 | Discovery-only sources | Leads that must be verified elsewhere | Search snippets, scraped aggregators, unsourced reposts |

**Rule:** A lower-tier source may add texture, but it should not override a higher-tier source on a factual conflict.

### 3.2 Required evidence object

Every usable research item should be normalized before generation:

```json
{
  "subject_id": "venue_930_club",
  "claim": "The original 9:30 Club opened on May 31, 1980.",
  "claim_type": "historical_fact",
  "source_name": "9:30 Club",
  "source_url": "https://www.930.com/history/",
  "source_tier": 1,
  "published_at": null,
  "fetched_at": "2026-07-27T22:00:00Z",
  "excerpt": "The 9:30 Club first opened its doors May 31, 1980...",
  "is_first_party": true,
  "is_promotional": false,
  "freshness": "evergreen",
  "confidence": 0.99,
  "corroborated_by": [
    "https://washington.org/visit-dc/930-club-history-washington-dc"
  ],
  "allowed_uses": ["instagram", "linkedin", "substack", "reddit"]
}
```

The generation model should receive evidence objects or a claim ledger, not raw scraped pages.

### 3.3 Claim ledger

Before writing, create a compact ledger:

| ID | Claim | Type | Best source | Confidence | Freshness | Public use |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | The club opened on May 31, 1980 | History | First-party history | High | Evergreen | Yes |
| C2 | Its original room was at 930 F Street and held about 200 people | History | First-party history | High | Evergreen | Yes |
| C3 | The first show featured the Lounge Lizards and local group Tiny Desk Unit | History | Washington.org | High | Evergreen | Yes |
| C4 | The venue is now at 815 V Street NW | Current fact | Official venue site | High | Check quarterly | Yes |
| C5 | The Hall of Records has more than 9,000 albums tied to documented headliners | Venue feature | Official Hall of Records | High | Check yearly | Yes |
| C6 | Recent fans frequently praise sound quality | Sentiment | Synth plus Reddit sample | Unknown until validated | Time-bound | Only with complete method |

The writer may use C1 through C5. C6 must be omitted unless the research run includes a denominator, date range, deduplication, representative snippets, and a confidence score.

### 3.4 Sentiment is a supporting input, not the story

The research run should store:

```json
{
  "query": "\"9:30 Club\" AND (sound OR staff OR sightlines OR line OR crowd)",
  "window_start": "2026-01-01",
  "window_end": "2026-06-30",
  "sources": ["reddit", "synth_user_reviews"],
  "raw_mentions": 117,
  "unique_mentions": 84,
  "positive": 62,
  "neutral": 13,
  "negative": 9,
  "excluded_first_party_posts": 18,
  "excluded_duplicates": 15,
  "classification_method": "model plus editor spot-check",
  "spot_check_sample": 20,
  "spot_check_agreement": 0.9,
  "top_positive_themes": ["sound", "staff", "sightlines"],
  "top_negative_themes": ["lines", "parking"],
  "limitations": [
    "Self-selected public comments are not representative of all attendees",
    "Reddit and Synth audiences may differ from the full venue audience"
  ]
}
```

#### Public-use rules for sentiment

- Never publish a positive count without the total count.
- Never call mentions "community engagement" unless they measure actual engagement.
- Never imply market demand from positive sentiment alone.
- Never combine likes, reviews, event listings, and news articles into one number.
- Never quote a community user without a stable public URL and a policy-compliant excerpt.
- Prefer themes over percentages when the sample is small or non-representative.
- If the sample has fewer than 30 unique community-authored mentions, describe it as anecdotal.
- If sources disagree, say so or choose a different angle.

### 3.5 Corroboration rules

Use at least:

- One Tier 1 source for dates, lineups, venue rules, ticket status, and location
- Two independent sources for claims of historical importance, records, rankings, or controversy
- Three community examples from at least two authors before calling something a recurring fan theme

Do not use a second article that merely copies the first as independent corroboration.

### 3.6 Freshness rules

| Claim | Maximum age before recheck |
| --- | --- |
| Event date, door time, ticket status, lineup | At generation and again before publishing |
| Venue address, transit, age policy, accessibility | 30 days |
| Current ownership, capacity, operating status | 90 days |
| Recent news or community trend | Must include an explicit date window |
| Historical opening date | Evergreen unless disputed |
| Awards and superlatives | Verify the award, year, category, and awarding body every use |

### 3.7 Separate fact, observation, and inference

The model must label these internally:

- **Fact:** "The original club opened in 1980."
- **Observation:** "The venue's own archive displays more than 9,000 albums."
- **Inference:** "The archive turns the room's booking history into something fans can physically browse."

Facts need citations. Observations need a clear source. Inferences are allowed when they follow directly from evidence and are written as interpretation, not certainty.

---

## 4. The Synth editorial voice

### Voice in one sentence

Write like a well-informed concert friend who noticed one telling detail, checked it, and knows why it matters.

### Required qualities

- **Specific:** Use names, dates, places, scenes, and consequences.
- **Warm:** Sound interested, not institutional.
- **Locally literate:** Understand DC neighborhoods, venues, genres, and fan habits without performing insider status.
- **Useful:** Help someone discover, decide, remember, or contribute.
- **Honest:** State uncertainty and omit unsupported claims.
- **Economical:** Lead with the point and remove throat-clearing.

### House mechanics

- Do not use em dashes or en dashes.
- Use contractions when they sound natural.
- Prefer active voice.
- Use numerals for dates, times, prices, and quantities.
- Write "Washington, DC" or "DC," not "Washington's live music landscape."
- Do not call every venue iconic.
- Do not describe retrieved material as "signals" in public copy.
- Do not mention the research process unless transparency is relevant.
- Do not add a Synth CTA by default. Earn it.
- Do not claim that a venue "supports local artists" unless the lineup data demonstrates it.

### Good opening patterns

- **Contradiction:** "The 9:30 Club became a DC institution by refusing to feel like one."
- **Specific fact:** "The 9:30 Club started as a 200-person room at 930 F Street."
- **Useful decision:** "If you are choosing one DC room for a first concert, start with how close you want to feel to the stage."
- **Timely change:** "Three new dates just changed the best week to see live music in DC."
- **Human question:** "Which 9:30 Club show changed what you thought a small room could sound like?"

### Weak opening patterns

- "In today's evolving music landscape..."
- "The 9:30 Club stands as..."
- "Recent research indicates..."
- "Music has always brought people together..."
- "Washington, DC is known for..."

---

## 5. One research bundle, four different editorial jobs

These are Synth house targets, not platform character limits.

| Medium | Reader mindset | Editorial job | Best evidence | House length | CTA style |
| --- | --- | --- | --- | --- | --- |
| Instagram | Scanning a visual feed | Create recognition, feeling, or a saveable fact | One strong detail plus visual proof | 60 to 140 words | One easy question or discovery action |
| LinkedIn | Looking for professional insight | Explain what the subject teaches the music business or local economy | One fact plus one implication | 120 to 240 words | Invite informed perspective |
| Substack | Choosing to spend time | Deliver an argued, sourced story with context | Three to seven claims from mixed source tiers | 700 to 1,400 words | Read, reply, or explore a related collection |
| Reddit | Evaluating usefulness and authenticity | Start a community-specific exchange or provide practical value | Local detail, transparent purpose, real question | 120 to 350 words | Specific discussion question |

**Do not cross-post identical copy.** Cross-platform consistency means the facts and brand values agree. It does not mean the words are the same.

---

## 6. Instagram

### 6.1 What good looks like

A good Synth Instagram caption:

1. Works with the image rather than narrating it.
2. Opens with a line that makes sense before the "more" fold.
3. Focuses on one detail or feeling.
4. Uses short paragraphs that are easy to scan.
5. Includes a concrete, answerable prompt only when conversation adds value.
6. Uses zero to four relevant hashtags.
7. Includes accurate alt text for the image.

Instagram provides tools for custom alt text and automatic captions, so accessibility should be part of the publishing record, not an afterthought. See [Instagram's accessibility guidance](https://about.instagram.com/blog/tips-and-tricks/advancing-accessibility-on-instagram).

### 6.2 Research selection

Choose:

- One visually demonstrable fact
- One human consequence
- One optional current action

Do not choose:

- A research count
- A general venue biography
- Four historical dates
- A paragraph of business analysis

### 6.3 Caption anatomy

```text
[Specific hook]

[One or two sentences of verified context]

[Why this detail matters or what it helps the reader notice]

[One specific question or action]

[Zero to four focused hashtags]
```

### 6.4 Finished 9:30 Club sample

**Internal title:** A room that remembers  
**Caption:**

> Before it became a DC institution, the 9:30 Club was a 200-person room at 930 F Street.
>
> It opened on May 31, 1980 with the Lounge Lizards and local new wave group Tiny Desk Unit. Today, the club's Hall of Records holds more than 9,000 albums connected to artists who have headlined the venue.
>
> That is a lot of DC music history in one room. What was your first show there?
>
> #930Club #DCMusic #WashingtonDC

**Suggested visual:** A licensed exterior image, an original photo of the Hall of Records, or an approved historical image with source credit.

**Alt text:** "Rows of album covers in the 9:30 Club Hall of Records in Washington, DC."

**Evidence used:**

- [9:30 Club history](https://www.930.com/history/)
- [Meet Me at 9:30 from Washington.org](https://washington.org/visit-dc/930-club-history-washington-dc)
- [Official 9:30 Club Hall of Records](https://thehallofrecords.930.com/)

### 6.5 Why this works

- The opening replaces "iconic" with a contrast the reader can picture.
- The caption uses two related facts instead of an unexplained score.
- The final question asks for a specific memory, not generic "thoughts."
- The Hall of Records gives the post a natural visual.
- Synth is not forced into the caption. The account identity already supplies the brand.

### 6.6 Reject examples

Reject:

> The 9:30 Club continues to be a cornerstone of the DC live music scene. With 62 signals across various platforms, its influence remains strong.

Reason: generic thesis, opaque metric, no visual relationship, no reader value.

Reject:

> Who loves the 9:30 Club? Let us know below! 🎵🔥🙌

Reason: empty engagement bait, no research value, interchangeable with any venue.

---

## 7. LinkedIn

### 7.1 What good looks like

A good Synth LinkedIn post does not pretend that venue praise is business insight. It identifies an operational, cultural, product, labor, audience, or market lesson and supports it with evidence.

LinkedIn recommends that AI-assisted drafts contain enough detail and be reviewed by the author, who retains responsibility for the final post. See [LinkedIn's AI writing guidance](https://www.linkedin.com/help/linkedin/answer/a1517763).

### 7.2 Strong LinkedIn angles for Synth

- What a venue's programming teaches about audience development
- How a room balances legacy with discovery
- Why venue data cannot be reduced to ticket sales
- What recurring fan feedback suggests about the live experience
- How neighborhood, transit, capacity, and calendar density affect discovery
- A concrete product lesson Synth learned while researching the subject

Avoid:

- Empty celebration
- Corporate congratulations without news
- Unverified market claims
- Calling a venue a "key player"
- Treating likes or positive comments as evidence of economic impact

### 7.3 Post anatomy

```text
[One-sentence business or cultural insight]

[Specific evidence]

[Interpretation: what this reveals]

[Connection to Synth's work, if genuinely relevant]

[One informed question]
```

### 7.4 Finished 9:30 Club sample

**Internal title:** Cultural memory is part of the venue product  
**Post:**

> A music venue's value is not captured by capacity or ticket volume alone.
>
> The original 9:30 Club opened in 1980 as a roughly 200-person room at 930 F Street. Its current Hall of Records now holds more than 9,000 albums tied to artists who have headlined the club.
>
> That archive does more than celebrate a legacy. It makes decades of programming visible to the next person walking into the room. The venue experience begins before the first note and continues after the last one.
>
> This is a useful product lesson for Synth: discovery gets stronger when an event is connected to the people, places, and memories around it.
>
> What venue does the best job of making its history part of the present-day experience?

**Evidence used:**

- [9:30 Club history](https://www.930.com/history/)
- [Official 9:30 Club Hall of Records](https://thehallofrecords.930.com/)

### 7.5 Why this works

- It gives a professional audience a real proposition.
- The facts support the interpretation without pretending to prove more than they do.
- Synth appears as a relevant product lesson, not an ad.
- The question invites examples from people with venue, music, design, or community experience.

### 7.6 LinkedIn quality check

Approve only if the post can answer:

- What is the insight?
- Which fact supports it?
- Why would a music, media, product, venue, or local-business professional care?
- Is Synth's role relevant to the point?
- Does the closing question require expertise or experience, rather than applause?

---

## 8. Substack

### 8.1 What good looks like

Substack is where Synth should make the complete editorial argument. A newsletter post needs a clear thesis, reporting, structure, interpretation, and a reason to keep reading.

Substack itself encourages repeatable formats using titles, images, headings, and lightweight promotional prompts. See [Substack's guide to consistent formats](https://on.substack.com/p/posting-consistently-formats-style).

### 8.2 Recommended Synth Substack formats

| Format | Reader promise | Typical evidence |
| --- | --- | --- |
| Venue File | Understand one room and why it matters now | History, current calendar, community themes, practical details |
| Weekend Thread | Know what is worth considering this weekend | Canonical event facts, editorial selection, logistics |
| Scene Shift | Understand a change in DC music | Reporting, new openings, closures, booking patterns, interviews |
| Before You Go | Make a better show decision | Lineup, genre, setlist patterns, venue policies, transit |
| After the Show | Place one performance in context | Original observation, artist history, community response |
| Data Note | Learn one defensible pattern in Synth's event data | Defined dataset, method, limitations, interpretation |

### 8.3 Venue File structure

```text
Subject line: [Specific promise, not generic praise]
Preview text: [One additional fact or tension]

# [Headline]

[Opening that states the point and creates curiosity]

## [Historical or contextual section]
[Two to four sourced paragraphs]

## [What the detail means now]
[Interpretation, current relevance, or useful decision]

## [Community or practical section]
[Validated themes, logistics, or reader contribution]

[Natural Synth CTA]

Sources:
- [Descriptive source title](URL)
```

### 8.4 Finished 9:30 Club sample

**Subject line:** The 9:30 Club is a working memory of DC music  
**Preview text:** It started as a 200-person room. Its archive now holds more than 9,000 albums.

# The 9:30 Club is not a monument

The most interesting thing about the 9:30 Club is not that it has lasted since 1980. It is that the venue keeps its history in the same room as the next show.

That history can be counted in album covers. The club's Hall of Records contains more than 9,000 albums connected to artists who have headlined the venue. The display is not a complete account of DC music, and the venue is still looking for missing records, but it makes one idea tangible: a concert calendar becomes cultural memory one night at a time.

## A name that started as an address

The original 9:30 Club opened on May 31, 1980 at 930 F Street NW. The room held about 200 people, and the venue's own history does not romanticize it. There were obstructed views, rats, and a smell that became part of its lore.

The first show featured the Lounge Lizards with local new wave group Tiny Desk Unit. That local opener matters. Before "9:30 Club" became shorthand for a DC institution, it was a small room where a touring act and a local band could share a bill.

The club's official history names artists including R.E.M., Fugazi, Bad Brains, Public Enemy, Nirvana, and Red Hot Chili Peppers among the acts that passed through the original room. A list like that can make history feel inevitable. It was not. Each name first appeared as a booking decision, a ticket someone bought, and a show someone decided was worth leaving home to see.

## The archive is part of the experience

The current club operates at 815 V Street NW. Inside, the Hall of Records organizes albums chronologically by the date each artist headlined the venue. Instead of reducing the past to a framed anniversary poster, the installation gives visitors thousands of entry points.

You might recognize an artist you saw years ago. You might notice how long a band had been working before you discovered it. You might find a name you have never heard and leave with something new to play.

That last possibility is why the archive matters to Synth. Concert discovery is often treated as a recommendation problem: match a listener to an artist, then show the ticket link. But the decision to attend a show is also social and contextual. People want to know who else cares, what the room feels like, where an artist fits, and what memories already surround the place.

A useful concert platform should not flatten all of that into an event card.

## What the data cannot say by itself

Synth's research tools can collect event listings, venue facts, reviews, public discussion, and local coverage. They can help an editor notice repeated themes. They cannot turn an unexplained count into community truth.

For example, saying that a venue has "62 positive signals" sounds precise but tells the reader almost nothing. Were there 62 positive comments out of 65, or out of 6,200? Were the posts written this month or over a decade? Were they original fan accounts, first-party promotions, or duplicate listings?

Good editorial work keeps that uncertainty visible. If the sample is strong, name the window, sources, denominator, and themes. If it is weak, use it as a reporting lead. If it cannot be checked, leave it out.

The 9:30 Club does not need inflated language to sound important. A 200-person room opened in 1980. More than four decades of shows followed. Now thousands of albums line the wall, while a new bill takes the stage.

That is the story.

**What was your first 9:30 Club show, and what detail do you still remember?** Reply to this email or add the memory to Synth. We are building a venue history from the people who were actually in the room.

### Sources

- [9:30 Club: History](https://www.930.com/history/)
- [Washington.org: Meet Me at 9:30](https://washington.org/visit-dc/930-club-history-washington-dc)
- [Official 9:30 Club Hall of Records](https://thehallofrecords.930.com/)
- [9:30 Club: Current venue information and listings](https://www.930.com/)

### 8.5 Why this works

- The headline makes an argument instead of announcing significance.
- The lead gives the reader a reason to continue.
- Historical facts, interpretation, and Synth's product perspective are clearly separated.
- The internal "62 signals" problem becomes a useful editorial principle, not a public boast.
- The CTA asks readers to contribute something precise and relevant to Synth.
- Sources are visible and descriptive.

### 8.6 Substack rejection criteria

Reject the post if:

- It could be reduced to three generic paragraphs without losing information.
- It has no thesis beyond "this venue is important."
- Every paragraph says the same thing.
- It contains no first-party source.
- It cites a sentiment number without method.
- It ends with "stay tuned."
- The Synth CTA is unrelated to the article's reader promise.

---

## 9. Reddit

### 9.1 What good looks like

Reddit is a community, not a distribution endpoint. The post must be useful in the target subreddit even if nobody clicks a Synth link.

Reddit states that every community may define and enforce its own rules. It also notes that some communities ban promotion while others use a version of a 10 percent self-promotion guideline. Review the target community every time. See [Reddit's explanation of community rules](https://support.reddithelp.com/hc/en-us/articles/360043503951-What-are-Reddit-s-rules) and [Reddit's guidance on promotional spam](https://support.reddithelp.com/hc/en-us/articles/28012014962580-How-do-I-keep-spam-out-of-my-community).

### 9.2 Pre-publish gate

Before drafting:

```json
{
  "target_forum": "r/washingtondc",
  "rules_checked_at": "2026-07-27T22:00:00Z",
  "self_promotion_allowed": true,
  "link_allowed": false,
  "required_flair": "Discussion",
  "title_rules": "No editorialized title for link posts",
  "account_disclosure_required": true
}
```

If rules were not checked recently, do not schedule the post.

### 9.3 Strong Reddit post types

- A narrow discussion question with useful context
- A practical show or venue guide
- A transparent research request
- A sourced local history detail
- A correction or update that helps the community
- A weekly list written for that specific subreddit

Avoid:

- Brand voice
- Marketing adjectives
- Hashtags
- Generic "what do you think?" prompts
- A link whose only purpose is traffic
- Pretending to be an unaffiliated fan

### 9.4 Finished 9:30 Club sample

**Title:** What was the first 9:30 Club show you remember clearly?

**Body:**

> I help build Synth, a concert discovery and music community app, and I am researching how DC fans remember local venues. I am posting this without a link because I would rather learn from the discussion than turn it into a promo.
>
> One detail that stood out: the original 9:30 Club opened at 930 F Street in 1980 as a roughly 200-person room. The club's current Hall of Records now has more than 9,000 albums tied to artists who have headlined there.
>
> If you have been, what was your first show there, and what is one detail you still remember? It could be the crowd, staff, sound, a weird moment between songs, or something about the room itself.
>
> I may summarize recurring themes for a DC venue guide. If I quote anyone, I will ask first.

**Target forum:** `r/washingtondc`, only after current rule review  
**Flair:** Discussion, if available and appropriate  
**Hashtags:** None  
**Link:** None in the initial post

### 9.5 Why this works

- The affiliation is disclosed immediately.
- The post provides researched context before asking for help.
- The question is narrow enough to produce detailed answers.
- The post does not require a click.
- The author explains how responses may be used and promises consent before quotation.

### 9.6 A Reddit post is not approved merely because it is accurate

It must also be:

- Appropriate to the specific subreddit
- Written in the community's normal register
- Non-duplicative
- Transparent about affiliation
- Worth reading without a link
- Posted by an account with genuine participation, not a feed of promotions

---

## 10. Platform-specific transformation example

The following shows how one evidence bundle becomes four distinct outputs.

### Shared evidence

```json
{
  "subject": "9:30 Club",
  "verified_claims": [
    {
      "id": "C1",
      "text": "Opened May 31, 1980",
      "source": "https://www.930.com/history/"
    },
    {
      "id": "C2",
      "text": "Original room at 930 F Street held about 200 people",
      "source": "https://www.930.com/history/"
    },
    {
      "id": "C3",
      "text": "First show featured the Lounge Lizards and Tiny Desk Unit",
      "source": "https://washington.org/visit-dc/930-club-history-washington-dc"
    },
    {
      "id": "C4",
      "text": "Hall of Records contains more than 9,000 albums",
      "source": "https://thehallofrecords.930.com/"
    }
  ],
  "unusable_claims": [
    {
      "text": "62 positive signals prove strong community engagement",
      "reason": "No denominator, date range, source breakdown, method, or direct logical support"
    }
  ]
}
```

### Transformation map

| Medium | Chosen angle | Claims used | Interpretation | CTA |
| --- | --- | --- | --- | --- |
| Instagram | Small room to visible archive | C1, C2, C3, C4 | The venue makes history visually present | Share first show |
| LinkedIn | Cultural memory is part of the product | C1, C2, C4 | Venue value exceeds capacity and ticket volume | Name a venue that does this well |
| Substack | The venue is a working memory, not a monument | C1, C2, C3, C4 | Discovery needs context and memory | Contribute a precise memory |
| Reddit | Community oral history | C1, C2, C4 | Fans hold details an official history cannot | Share one remembered detail |

This table is the model's target behavior. Repeating all four facts on all four platforms is not required. Selecting the right facts is part of writing.

---

## 11. Model generation contract

### 11.1 Input

The generator should receive:

```json
{
  "subject": {},
  "canonical_facts": [],
  "claim_ledger": [],
  "sentiment_summary": null,
  "source_status": [],
  "platform": "instagram | linkedin | substack | reddit",
  "length": "short | standard | long",
  "target_forum": null,
  "target_forum_rules": null,
  "editorial_goal": "discover | decide | understand | discuss | remember",
  "brand_context": {
    "product": "Synth",
    "description": "A concert discovery and music community platform",
    "cta_allowed": true
  }
}
```

### 11.2 Output

```json
{
  "platform": "instagram",
  "title": "Internal title or public title where appropriate",
  "body": "Final post copy",
  "hashtags": ["930Club", "DCMusic", "WashingtonDC"],
  "target_forum": null,
  "cta": "What was your first show there?",
  "alt_text": "Rows of album covers in the 9:30 Club Hall of Records.",
  "claims_used": ["C1", "C2", "C3", "C4"],
  "source_urls": [
    "https://www.930.com/history/",
    "https://washington.org/visit-dc/930-club-history-washington-dc",
    "https://thehallofrecords.930.com/"
  ],
  "editor_notes": [
    "Confirm image rights",
    "No sentiment claim used because methodology was incomplete"
  ],
  "risk_flags": []
}
```

### 11.3 Required model behavior

1. Select an editorial goal.
2. Choose one angle.
3. Select only the claims needed for that angle.
4. Draft in the platform's native form.
5. Map every factual sentence to a claim ID.
6. Remove any factual sentence that cannot be mapped.
7. Check the CTA against the reader's next logical action.
8. Run the language and platform lint checks.
9. Return source URLs and editor notes outside the public body.

### 11.4 Generation prompt

```text
You are Synth's DC music editor. Turn the supplied claim ledger into one
platform-native draft.

Accuracy:
- Use only claims marked public_use=true.
- Every factual sentence must map to one or more claim IDs.
- Never expose retrieval counts, confidence scores, or "signals" in public copy.
- A sentiment claim requires a date window, denominator, sources, deduplication
  method, limitations, and representative themes.
- Do not infer demand, economic impact, artist support, or community consensus
  from positive mentions.
- Prefer first-party sources for dates, times, policies, lineups, and addresses.
- If evidence is weak, omit the claim. Do not hedge a fabricated claim.

Voice:
- Lead with the point.
- Be specific, warm, locally literate, and concise.
- Sound like an informed concert friend, not a tourism board or analytics tool.
- Do not use em dashes or en dashes.
- Avoid generic phrases such as iconic venue, vibrant ecosystem, cornerstone,
  key player, vital hub, strong community engagement, artists and fans alike,
  enduring appeal, and stay tuned.
- Do not add a Synth CTA unless it follows naturally from the post.

Platform:
- Instagram: one visual idea, 60 to 140 words, zero to four focused hashtags,
  one optional specific question, and alt text.
- LinkedIn: one professional or cultural insight, evidence, implication, and one
  informed question in 120 to 240 words.
- Substack: a clear thesis, descriptive headline, preview text, sections,
  explicit sourcing, and 700 to 1,400 words.
- Reddit: obey the supplied forum rules, disclose Synth affiliation, provide
  value without a click, use no hashtags, and ask one specific question.

Return JSON with title, body, hashtags, target_forum, cta, alt_text,
claims_used, source_urls, editor_notes, and risk_flags.
```

---

## 12. Training examples: bad to good

### 12.1 Generic significance

**Bad**

> The 9:30 Club stands as one of the most significant venues in Washington, DC.

**Good**

> The 9:30 Club started as a 200-person room at 930 F Street. Its Hall of Records now holds more than 9,000 albums connected to past headliners.

**Lesson:** Replace the adjective with evidence that lets the reader reach the conclusion.

### 12.2 Invalid inference

**Bad**

> Strong community signals suggest that fans are eager for more live music opportunities.

**Good**

> In the validated sample, fans most often mentioned sound, staff, and sightlines. The sample describes what commenters valued about the venue. It does not measure unmet demand for more shows.

**Lesson:** State what the data measures and refuse the leap it cannot support.

### 12.3 Empty community language

**Bad**

> Artists and fans alike rely on this venue to connect, discover, and share their love for music.

**Good**

> A touring act and a local band shared the club's first bill in 1980. That pairing gives the venue's history a more useful starting point than "legendary."

**Lesson:** Replace a universal claim about unnamed groups with one documented interaction.

### 12.4 Forced CTA

**Bad**

> Join us on Synth to discover more about the music scene in DC and connect with fellow fans.

**Good for Instagram**

> What was your first show there?

**Good for LinkedIn**

> What venue makes its history part of the present-day experience?

**Good for Substack**

> Reply with your first 9:30 Club show and one detail you still remember.

**Good for Reddit**

> What was your first show there, and what is one detail you still remember?

**Lesson:** The CTA should complete the editorial idea, not interrupt it.

---

## 13. Automated lint and QA

### 13.1 Hard fail

Reject the draft automatically if:

- It uses a factual claim not present in `claims_used`.
- A claim ID does not exist in the ledger.
- It publishes a sentiment count without a denominator and date window.
- It says "signals" in the public body.
- It uses an em dash or en dash.
- It names an event date, door time, price, lineup, or ticket status that was not refreshed during the current run.
- A Reddit draft lacks a recent community-rules record.
- A Reddit post promotes Synth without disclosing affiliation.
- An Instagram post requires an image but no rights or source status is recorded.
- A source URL is a search results page.

### 13.2 Soft warning

Flag for editor review if:

- The post uses more than two adjectives in one sentence.
- The first sentence exceeds 25 words.
- The same claim appears in more than two paragraphs.
- Instagram has more than four hashtags.
- LinkedIn has no identifiable professional or cultural implication.
- Substack has fewer than three sources or no Tier 1 source.
- Reddit includes a link.
- The CTA contains "join," "download," "sign up," or "learn more."
- The copy uses any phrase from the automatic rewrite list.

### 13.3 Suggested implementation checks

```text
for every sentence classified as factual:
  require at least one claim_id
  require claim.public_use == true
  require claim.confidence >= platform_threshold

if sentiment appears:
  require unique_mentions
  require total_mentions
  require window_start and window_end
  require sources.length >= 1
  require limitations.length >= 1

if platform == "reddit":
  require target_forum
  require rules_checked_at within 7 days
  require affiliation_disclosure

if platform == "instagram":
  require visual_asset or visual_brief
  require alt_text
```

---

## 14. Editorial scorecard

Score each draft out of 100.

| Dimension | Points | Full-credit standard |
| --- | ---: | --- |
| Accuracy and claim traceability | 25 | Every fact maps to a usable claim and current facts are fresh |
| Specificity | 15 | Concrete names, dates, details, or consequences replace generic praise |
| Editorial angle | 15 | One clear point organizes the entire post |
| Platform fit | 15 | Form, length, CTA, and register match the medium |
| Reader value | 10 | The reader learns, decides, remembers, or can contribute |
| Voice | 10 | Warm, informed, concise, and free of institutional filler |
| Sourcing and transparency | 5 | Sources are visible where appropriate and limitations are honest |
| CTA quality | 5 | The next action follows naturally from the post |

### Approval threshold

- **90 to 100:** Publishable after factual refresh
- **80 to 89:** Light edit
- **70 to 79:** Structural rewrite
- **Below 70:** Reject and regenerate from the claim ledger
- **Any hard fail:** Reject regardless of score

---

## 15. Human review checklist

### Research

- [ ] Did we use the strongest source for every important claim?
- [ ] Are event details current as of the publishing check?
- [ ] Did we remove duplicate, copied, and first-party promotional material from sentiment?
- [ ] Can an editor see the source, excerpt, timestamp, and claim mapping?
- [ ] Did we record contradictions and limitations?

### Writing

- [ ] Does the first sentence contain the point?
- [ ] Is there one angle, not a list of facts?
- [ ] Could any sentence describe a different venue unchanged?
- [ ] Did we replace superlatives with evidence?
- [ ] Is the interpretation proportional to the evidence?
- [ ] Did we remove "signals" and other internal research vocabulary?
- [ ] Is the Synth mention earned?

### Platform

- [ ] Instagram: Does the caption work with a specific visual and include alt text?
- [ ] LinkedIn: Is there a genuine professional or cultural insight?
- [ ] Substack: Does the piece have a thesis, structure, and visible sourcing?
- [ ] Reddit: Were current community rules checked, and is affiliation transparent?

### Final

- [ ] Are all links direct and working?
- [ ] Are image rights and credits recorded?
- [ ] Are names, dates, addresses, and numbers correct?
- [ ] Is the scheduled time appropriate to the audience?
- [ ] Has a human approved the post?

---

## 16. Recommended training-record format

For supervised examples or evaluation sets, keep research, reasoning labels, output, and critique separate.

```json
{
  "record_id": "venue_930_club_instagram_v1",
  "input": {
    "platform": "instagram",
    "editorial_goal": "remember",
    "claim_ledger": ["C1", "C2", "C3", "C4"],
    "visual_brief": "Hall of Records interior",
    "brand_context": "Synth"
  },
  "target": {
    "title": "A room that remembers",
    "body": "Before it became a DC institution...",
    "hashtags": ["930Club", "DCMusic", "WashingtonDC"],
    "alt_text": "Rows of album covers..."
  },
  "claim_mapping": {
    "sentence_1": ["C1", "C2"],
    "sentence_2": ["C1", "C3"],
    "sentence_3": ["C4"]
  },
  "negative_target": {
    "body": "The 9:30 Club continues to be a cornerstone..."
  },
  "critique": [
    "Negative target exposes an undefined signal count",
    "Negative target has no visual idea",
    "Target uses specific evidence and a memory prompt"
  ],
  "score": 95
}
```

### Dataset balance

Include:

- Strong and weak research bundles
- Contradictory sources
- Events with changed times or canceled dates
- Venues with little community discussion
- Positive, mixed, and negative community themes
- Posts where no Synth CTA is appropriate
- Reddit communities that disallow promotion
- Subjects where the correct model behavior is "insufficient evidence"

The model must learn that omission and escalation are successful outcomes.

---

## 17. Definition of done

A draft is done when:

1. The research run produces a source-status report and claim ledger.
2. The writer selects one defensible angle.
3. Every factual sentence is traceable.
4. The format is native to the target platform.
5. The post gives the reader something concrete.
6. Sentiment is either methodologically complete or absent.
7. The CTA follows from the story.
8. Platform-specific safety, rights, and community checks pass.
9. A human editor can approve without reconstructing the research.
10. The final copy sounds written because someone noticed something worth saying.

That is what "good" looks like for Synth.

