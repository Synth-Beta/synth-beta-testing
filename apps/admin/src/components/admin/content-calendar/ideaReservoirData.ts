/**
 * Three-level content idea reservoir for the admin Content Calendar.
 *
 * Level 1 — umbrella / thought-leadership angles
 * Level 2 — distribution channel buckets
 * Level 3 — specific ideas (angle + channel + person + copy)
 */

export type ReservoirPerson =
  | 'Sam Loiterstein'
  | 'Tej Patel'
  | 'Lauren Pesce'
  | 'Theo Kagan'
  | 'Synth';

export type ReservoirChannel =
  | 'linkedin'
  | 'instagram'
  | 'tiktok'
  | 'substack';

export type ChannelBucketId = 'b2b_linkedin' | 'consumer_short' | 'long_form_substack';

export interface UmbrellaAngle {
  id: string;
  title: string;
  thesis: string;
  whyItMatters: string;
  audience: 'consumer' | 'b2b' | 'both';
  keywords: string[];
}

export interface ChannelBucket {
  id: ChannelBucketId;
  label: string;
  shortLabel: string;
  platforms: ReservoirChannel[];
  audience: string;
  job: string;
  formatNotes: string;
}

export interface ContentIdea {
  id: string;
  angleId: string;
  channel: ReservoirChannel;
  bucketId: ChannelBucketId;
  person: ReservoirPerson;
  title: string;
  hook: string;
  copy: string;
  cta: string;
  format: string;
  tags: string[];
}

export const CHANNEL_BUCKETS: ChannelBucket[] = [
  {
    id: 'b2b_linkedin',
    label: 'B2B — LinkedIn',
    shortLabel: 'LinkedIn',
    platforms: ['linkedin'],
    audience: 'Venues, promoters, campus partners, brands, talent, operators',
    job: 'Teach a live-music market or product lesson; open a partnership conversation',
    formatNotes: '120–240 words. One fact + implication. Founder or operator voice. No consumer memes.',
  },
  {
    id: 'consumer_short',
    label: 'Consumer short-form — Instagram / TikTok',
    shortLabel: 'IG / TikTok',
    platforms: ['instagram', 'tiktok'],
    audience: 'Concert-goers, students, transplants, scene-curious fans',
    job: 'Create recognition, feeling, or a saveable tip in one scroll',
    formatNotes: 'Hook in first line. 60–140 words (IG) or 15–45s script (TikTok). Specific > inspirational.',
  },
  {
    id: 'long_form_substack',
    label: 'Long-form — Substack',
    shortLabel: 'Substack',
    platforms: ['substack'],
    audience: 'Scene readers, SEO, partners who skim for seriousness',
    job: 'Argue a thesis with sources; leave the reader smarter about a room, night, or metro',
    formatNotes: '700–1,400 words outline + lede. Thesis, sections, sourcing. Not a padded caption.',
  },
];

export const UMBRELLA_ANGLES: UmbrellaAngle[] = [
  {
    id: 'letterboxd-for-live',
    title: 'Letterboxd for live music',
    thesis:
      'Streaming owns songs; ticketing owns seats; nothing durable owns the social memory of nights out. Synth is the public passport for live music.',
    whyItMatters: 'Gives a one-line category for press, App Store, and partner decks.',
    audience: 'both',
    keywords: ['passport', 'archive', 'identity', 'category'],
  },
  {
    id: 'solo-show-problem',
    title: 'The solo-show problem',
    thesis:
      'People miss great shows because coordination failed — not because taste failed. Companionship is part of discovery.',
    whyItMatters: 'Founding pain story; highest-empathy consumer hook.',
    audience: 'both',
    keywords: ['plus one', 'friends', 'flaked', 'alone'],
  },
  {
    id: 'scattered-live-stack',
    title: 'The scattered live stack',
    thesis:
      'Tickets, streams, camera rolls, group chats, and setlists never reconnect after the night. Synth stitches the journey.',
    whyItMatters: 'Problem narrative for LinkedIn and Substack explainers.',
    audience: 'both',
    keywords: ['fragmentation', 'journey', 'memory'],
  },
  {
    id: 'metro-first-dc',
    title: 'Metro-first: DC / DMV wedge',
    thesis:
      'National “music app” claims fail without local density. Win one metro’s rooms, reviews, and graphs — then clone.',
    whyItMatters: 'Sets geographic strategy for content and partnerships.',
    audience: 'both',
    keywords: ['DC', 'DMV', 'local', 'venues'],
  },
  {
    id: 'venue-as-product',
    title: 'The room is the product',
    thesis:
      'Capacity and ticket volume undersell what a venue sells: sound, ritual, staff, sightlines, and cultural memory.',
    whyItMatters: 'B2B empathy for rooms; consumer education about choosing rooms.',
    audience: 'both',
    keywords: ['venue', 'sound', 'room', '9:30'],
  },
  {
    id: 'taste-to-tonight',
    title: 'From taste graph to tonight',
    thesis:
      'Spotify knows what you stream. Synth should turn that into who is playing near you — and who else might go.',
    whyItMatters: 'Product differentiation vs pure social or pure listings.',
    audience: 'both',
    keywords: ['Spotify', 'Apple Music', 'taste', 'recommendations'],
  },
  {
    id: 'post-show-memory',
    title: 'Review while the memory is warm',
    thesis:
      'The best concert writing happens the next morning. Capture setlists, ratings, and friends before the night dissolves.',
    whyItMatters: 'Activation loop; content gold from real users later.',
    audience: 'consumer',
    keywords: ['review', 'setlist', 'passport stamp'],
  },
  {
    id: 'campus-density',
    title: 'Campus as density engine',
    thesis:
      'Colleges concentrate taste, free evenings, and social graphs. Ambassadors beat broad ads for early metros.',
    whyItMatters: 'GTM channel for DC schools and future cities.',
    audience: 'both',
    keywords: ['campus', 'ambassador', 'GWU', 'students'],
  },
  {
    id: 'partner-pipes',
    title: 'Partners as distribution pipes',
    thesis:
      'Venues, campus orgs, and local writers are not one-off sponsors — they are repeatable placement channels.',
    whyItMatters: 'Frames BD asks; LinkedIn-native.',
    audience: 'b2b',
    keywords: ['QR', 'email footer', 'co-marketing'],
  },
  {
    id: 'short-form-scene',
    title: 'Short-form scene literacy',
    thesis:
      'TikTok/Reels can teach room etiquette, transplant survival, and bill-reading — if every clip names a real place.',
    whyItMatters: 'Consumer top-of-funnel without becoming nightlife spam.',
    audience: 'consumer',
    keywords: ['TikTok', 'Reels', 'tips', 'etiquette'],
  },
  {
    id: 'trust-not-hype',
    title: 'Trust over hype',
    thesis:
      'Synth editorial should sound like a sharp fan with sources — never like a venue press release.',
    whyItMatters: 'Quality bar for Content Calendar drafts.',
    audience: 'both',
    keywords: ['editorial', 'evidence', 'voice'],
  },
  {
    id: 'live-renaissance',
    title: 'Live after streaming',
    thesis:
      'Streaming made catalogs infinite; live nights became the scarce, high-emotion layer. Identity migrated to rooms.',
    whyItMatters: 'Macro thought leadership for LinkedIn/Substack.',
    audience: 'both',
    keywords: ['streaming', 'scarcity', 'culture'],
  },
];

function idea(
  partial: Omit<ContentIdea, 'bucketId'> & { bucketId?: ChannelBucketId },
): ContentIdea {
  const bucketId =
    partial.bucketId ??
    (partial.channel === 'linkedin'
      ? 'b2b_linkedin'
      : partial.channel === 'substack'
        ? 'long_form_substack'
        : 'consumer_short');
  return { ...partial, bucketId };
}

/** Large pool of Level-3 ideas. */
export const CONTENT_IDEAS: ContentIdea[] = [
  // —— letterboxd-for-live ——
  idea({
    id: 'll-li-01',
    angleId: 'letterboxd-for-live',
    channel: 'linkedin',
    person: 'Sam Loiterstein',
    title: 'Why live music needed its Letterboxd',
    hook: 'We log films. We log runs. We barely log the nights that change us.',
    copy: `Letterboxd did not invent watching movies. It invented a public language for taste.

Live music never got that language. Tickets live in one app. Photos in another. Opinions in a group chat that scrolls away by Monday.

That is the gap Synth is building for: a passport of shows, people who share your taste, and a feed that cares about nights — not just tracks.

If you run a room, a campus org, or a brand touching live culture, the question is not “do people still go to shows?” They do. The question is whether their identity around those shows has a home.`,
    cta: 'Curious how metro-first passports could work with your room or campus? Message me.',
    format: 'Founder post',
    tags: ['category', 'passport'],
  }),
  idea({
    id: 'll-ig-01',
    angleId: 'letterboxd-for-live',
    channel: 'instagram',
    person: 'Lauren Pesce',
    title: 'Your camera roll is not a passport',
    hook: 'Be honest: can you name the last five shows you went to without scrolling Photos?',
    copy: `Your camera roll is full of blurry stage lights and one perfect chorus video you never watch again.

That is not a music identity. That is storage.

Synth is the passport for live music — the shows, the rooms, the people you went with. Discover what is on, connect with fans who actually go out, share the night while it is still warm.

Letterboxd energy. Concert reality.`,
    cta: 'Join at getsynth.app — start your passport.',
    format: 'Carousel caption',
    tags: ['passport', 'consumer'],
  }),
  idea({
    id: 'll-tt-01',
    angleId: 'letterboxd-for-live',
    channel: 'tiktok',
    person: 'Theo Kagan',
    title: 'POV: Letterboxd but for concerts',
    hook: 'POV you finally have somewhere to put your concert personality.',
    copy: `[0-3s] Text on screen: "Letterboxd… but for shows"
[3-12s] Quick cuts: ticket PDF → blurry video → empty group chat → forgotten setlist
[12-25s] Synth passport / review flow mock
[25-35s] "Discover. Connect. Share."
VO: "Streaming knows your playlist. Nobody knows your nights. Fix that."`,
    cta: 'Link in bio — Synth',
    format: '15–35s script',
    tags: ['hook', 'demo'],
  }),
  idea({
    id: 'll-ss-01',
    angleId: 'letterboxd-for-live',
    channel: 'substack',
    person: 'Sam Loiterstein',
    title: 'The missing social layer of live music',
    hook: 'A category essay: why ticketing and streaming left a hole shaped like identity.',
    copy: `## Thesis
Live music is culturally huge and product-wise fragmented. This essay maps the adjacent categories (tickets, streams, listings, feeds), names what each owns, and argues for a passport + companionship layer.

## Outline
1. What Letterboxd actually sold (language for taste, not movies)
2. The five places a single night currently lives
3. Why “another listings app” fails the identity test
4. Metro-first proof: density before national vanity
5. What Synth ships toward Discover / Connect / Share
6. What we will not become (ticket marketplace)

## Sources to pull
- Public Synth positioning
- DC venue examples
- Streaming vs live scarcity argument`,
    cta: 'Subscribe for DC scene essays + product notes.',
    format: 'Long-form outline + lede brief',
    tags: ['essay', 'category'],
  }),

  // —— solo-show-problem ——
  idea({
    id: 'ss-li-01',
    angleId: 'solo-show-problem',
    channel: 'linkedin',
    person: 'Sam Loiterstein',
    title: 'Missed shows are a coordination failure',
    hook: 'Most “I wish I went” stories are calendar failures, not taste failures.',
    copy: `Synth started because amazing concerts slipped by when nobody was free to go.

That is not a niche anecdote. It is the default state of adult social life: taste is personal; logistics are collective; group chats are bad operating systems.

Products that only show who is playing miss half the job. The other half is making it easier to go — with someone, or confidently alone with a community around the night.

For venues: empty seats are sometimes empty coordination. For campuses: the students who care already exist; they need a graph. For brands: the emotion is in the night, not the ad unit.`,
    cta: 'If you are filling rooms or campus calendars in DC, I want the conversation.',
    format: 'Founder narrative',
    tags: ['origin', 'b2b'],
  }),
  idea({
    id: 'ss-ig-01',
    angleId: 'solo-show-problem',
    channel: 'instagram',
    person: 'Lauren Pesce',
    title: 'When the group chat goes silent',
    hook: 'The show is Saturday. Three people liked the message. Nobody committed.',
    copy: `You know the feeling.

Someone drops a link. Everyone reacts. Nobody buys. By Thursday the thread is dead and you are deciding whether going alone feels weird.

It should not feel weird. And finding someone who actually wants that bill should not require another app circus.

Synth: discover the show, connect with people who share the taste, share the night after.

Going just got easier.`,
    cta: 'Download Synth — find your people for the next one.',
    format: 'Single image / Story set',
    tags: ['empathy', 'cta'],
  }),
  idea({
    id: 'ss-tt-01',
    angleId: 'solo-show-problem',
    channel: 'tiktok',
    person: 'Theo Kagan',
    title: 'Types of group-chat concert energy',
    hook: 'The four people in every concert group chat.',
    copy: `[Skit]
1. The linker (drops Ticketmaster, disappears)
2. The reactor (🔥🔥🔥, never buys)
3. The maybe (asks "who's driving" at 9pm)
4. You (actually wanted to go)

Punchline: stop letting the chat decide your music life. Synth is for people who go.`,
    cta: 'Follow for DC show energy + Synth',
    format: 'Skit 20–40s',
    tags: ['humor', 'relatable'],
  }),
  idea({
    id: 'ss-ig-02',
    angleId: 'solo-show-problem',
    channel: 'instagram',
    person: 'Synth',
    title: 'Solo is allowed',
    hook: 'Permission slip for sitting alone at the rail.',
    copy: `Solo show etiquette nobody taught you:

• Arrive when you want
• Claim the spot that feels right
• Talk to the person next to you only if it is natural
• Log the night so it is not just a story you tell yourself

Synth will not invent courage for you. It will make the logistics and the memory less lonely.`,
    cta: 'Stamp it in Synth after.',
    format: 'Carousel checklist',
    tags: ['tips', 'solo'],
  }),
  idea({
    id: 'ss-ss-01',
    angleId: 'solo-show-problem',
    channel: 'substack',
    person: 'Sam Loiterstein',
    title: 'Why adults miss concerts they wanted',
    hook: 'A reported essay on coordination, loneliness, and product design.',
    copy: `## Thesis
Wanting the show is common; assembling the night is hard. Group chats fail as planning tools. Products that ignore companionship underserve the real job.

## Sections
- Anatomy of a missed show (timeline from announcement → night)
- What ticketing UX optimizes for vs what fans need
- Solo attendance stigma vs reality in DC rooms
- How Synth approaches Connect without becoming a dating app
- Design principles: low pressure, taste-first matching, post-show memory

## Reporting to include
- Anonymized user stories (with permission)
- Venue operator quote on no-shows / last-minute sales`,
    cta: 'Reply with your worst missed-show story.',
    format: 'Essay brief',
    tags: ['reported', 'product'],
  }),

  // —— scattered-live-stack ——
  idea({
    id: 'sc-li-01',
    angleId: 'scattered-live-stack',
    channel: 'linkedin',
    person: 'Tej Patel',
    title: 'Five apps, one night, zero archive',
    hook: 'A systems view of why live music feels “solved” and still feels broken.',
    copy: `On a single concert night a fan might touch:

1. A ticketing app
2. A streaming app
3. Maps / transit
4. Instagram or TikTok
5. A group chat
6. A camera roll

None of those systems are wrong. None of them own the narrative of the night.

As engineers we often ship another vertical. Synth’s bet is horizontal: identity, social graph, and memory across the live journey — with privacy as a constraint, not a slogan.

That is a product architecture problem as much as a marketing one.`,
    cta: 'Building in social + music infra? Happy to compare notes.',
    format: 'CTO systems post',
    tags: ['architecture', 'privacy'],
  }),
  idea({
    id: 'sc-ig-01',
    angleId: 'scattered-live-stack',
    channel: 'instagram',
    person: 'Lauren Pesce',
    title: 'Where did the night go?',
    hook: 'Tickets → streams → chats → camera roll → gone.',
    copy: `Shows live in ticketing apps.
Songs live in streaming.
Memories live in camera rolls.
Opinions live in group chats.
Setlists live… somewhere.

After the night ends, none of it connects.

Synth covers the whole live journey: track shows, review while it is fresh, discover what is next, find people to go with.`,
    cta: 'Discover. Connect. Share.',
    format: 'Motion graphic caption',
    tags: ['problem', 'brand'],
  }),
  idea({
    id: 'sc-tt-01',
    angleId: 'scattered-live-stack',
    channel: 'tiktok',
    person: 'Theo Kagan',
    title: 'Green screen: my concert night tech stack',
    hook: 'Rating the apps I open before one show.',
    copy: `Green screen list with funny scores:
- Ticketmaster: 2/10 vibes, 10/10 stress
- Spotify: knows the album, not the room
- Group chat: unread trauma
- Photos: 47 near-identical clips
- Synth: the one that keeps the night`,
    cta: 'Comment your worst concert app.',
    format: 'Green screen 30s',
    tags: ['humor', 'stack'],
  }),
  idea({
    id: 'sc-ss-01',
    angleId: 'scattered-live-stack',
    channel: 'substack',
    person: 'Tej Patel',
    title: 'The live music stack is a integration problem',
    hook: 'Long-form map of data domains fans already generate.',
    copy: `## Thesis
Fans already produce rich live-music data; products silo it. Synth’s domain model (events, venues, reviews, graph, passport, preference signals) is an integration bet.

## Outline
- Domain map (catalog, social proof, graph, messaging, passport)
- Why scraping listings is not a moat
- Privacy boundaries agents and marketers must respect
- What “connected night” means in shipping terms`,
    cta: 'For operators: what data do you wish fans brought to your door?',
    format: 'Technical-product essay',
    tags: ['data', 'moat'],
  }),

  // —— metro-first-dc ——
  idea({
    id: 'dc-li-01',
    angleId: 'metro-first-dc',
    channel: 'linkedin',
    person: 'Sam Loiterstein',
    title: 'Why we are obsessed with one metro',
    hook: 'National launch energy is cheap. Local density is not.',
    copy: `Consumer social products love to announce cities like airline routes.

Live music does not work that way. A feed without local rooms, upcoming bills, and people who actually go out is a brochure.

Synth’s wedge is DC / DMV: enough venues to make editorial concrete, enough students and transplants to need a map, enough mid-size rooms that taste still matters.

If you book, promote, or write about this metro, we want to be useful to your audience first — then talk distribution.`,
    cta: 'DC venues & campus partners: let’s compare calendars.',
    format: 'GTM post',
    tags: ['DC', 'density'],
  }),
  idea({
    id: 'dc-ig-01',
    angleId: 'metro-first-dc',
    channel: 'instagram',
    person: 'Synth',
    title: 'This week in DC rooms',
    hook: 'Three bills worth leaving the house for — with why.',
    copy: `DC / DMV weekly cut (template):

1. [Artist] at [Venue] — why the room fits the bill
2. [Artist] at [Venue] — who this is for
3. [Underplay / jazz / DIY] — the one transplants miss

Save this. Bring someone. Stamp it after.

Want this as a recurring series? Follow Synth.`,
    cta: 'Open Synth for full listings near you.',
    format: 'Weekly carousel template',
    tags: ['calendar', 'local'],
  }),
  idea({
    id: 'dc-tt-01',
    angleId: 'metro-first-dc',
    channel: 'tiktok',
    person: 'Theo Kagan',
    title: 'DC venue starter pack',
    hook: 'If you just moved to DC and only know The Anthem…',
    copy: `Fast tour:
- Big room energy vs small room magic
- Jazz / DIY / club nights as different sports
- "Your first month should include one room you had to look up"

End on Synth as the map + people layer.`,
    cta: 'Duet with your go-to DC room.',
    format: 'Talking head + B-roll',
    tags: ['transplant', 'venues'],
  }),
  idea({
    id: 'dc-ss-01',
    angleId: 'metro-first-dc',
    channel: 'substack',
    person: 'Sam Loiterstein',
    title: 'A field guide to building Synth in DC first',
    hook: 'Playbook essay for metro expansion.',
    copy: `## Thesis
Metro-first is not a marketing slogan; it is a density requirement for social live products.

## Sections
- Venue ecology of DMV (tiers of rooms)
- College nodes and transient audiences
- Editorial as trust-building (venue essays)
- Partner pipes: door QR, campus, writers
- Metrics that matter locally (returning reviewers, multi-venue users)
- What we copy to city #2 vs what must be rebuilt`,
    cta: 'City operators: tell us which metro has the density.',
    format: 'Playbook',
    tags: ['gtm', 'expansion'],
  }),
  idea({
    id: 'dc-ig-02',
    angleId: 'metro-first-dc',
    channel: 'instagram',
    person: 'Lauren Pesce',
    title: 'Transplant survival: first three DC shows',
    hook: 'Do not let your first month be only rooftop bars.',
    copy: `New to DC?

1. One legendary mid-size room
2. One genre you pretend you “don’t listen to”
3. One show you found because a person — not an ad — cared

Synth helps with all three: listings, people, passport.`,
    cta: 'Share this with a transplant.',
    format: 'Carousel',
    tags: ['transplant', 'onboarding'],
  }),

  // —— venue-as-product ——
  idea({
    id: 'vn-li-01',
    angleId: 'venue-as-product',
    channel: 'linkedin',
    person: 'Sam Loiterstein',
    title: 'Capacity is not the product',
    hook: 'Rooms sell rituals. Spreadsheets sell capacity.',
    copy: `When operators describe a venue, the first number is often capacity.

Fans describe sound, sightlines, staff, neighborhood, and the feeling of knowing the room’s history.

Those are product attributes. They are also why editorial about rooms outperforms generic “support live music” posts.

Synth’s Content Calendar treats venues as subjects worth research — sources, history, recurring fan themes — because discovery without room literacy is just another calendar.`,
    cta: 'Venue partners: we will feature rooms with evidence, not fluff.',
    format: 'Operator insight',
    tags: ['venues', 'editorial'],
  }),
  idea({
    id: 'vn-ig-01',
    angleId: 'venue-as-product',
    channel: 'instagram',
    person: 'Synth',
    title: 'How to read a room before you buy',
    hook: 'Three checks that save a mediocre night.',
    copy: `Before you buy:

1. Standing vs seated reality (not the marketing copy)
2. Where the sound actually hits in that room
3. What kind of bill this room usually books well

Then look who else in your taste world is going.

Rooms have personalities. Treat them like it.`,
    cta: 'Browse DC venues on Synth.',
    format: 'Tips carousel',
    tags: ['education', 'venues'],
  }),
  idea({
    id: 'vn-tt-01',
    angleId: 'venue-as-product',
    channel: 'tiktok',
    person: 'Theo Kagan',
    title: 'Things your favorite venue will not put on the flyer',
    hook: 'The unofficial manual.',
    copy: `Rapid tips (customize per venue when filmed):
- Line timing
- Coat check reality
- Best rail vs best mix position
- Neighborhood exit strategy

Close: "We research rooms so you do not learn the hard way."`,
    cta: 'Comment a DC venue for a deep dive.',
    format: 'Tip dump 30s',
    tags: ['tips', 'local'],
  }),
  idea({
    id: 'vn-ss-01',
    angleId: 'venue-as-product',
    channel: 'substack',
    person: 'Sam Loiterstein',
    title: 'Venue deep-dive template (DC)',
    hook: 'Reusable long-form structure for editorial automation + humans.',
    copy: `## Thesis
A great venue essay makes a newcomer competent and a regular feel seen.

## Required sections
1. Opening scene (specific night or detail)
2. Origin / address history (Tier-1 sourced)
3. What the room optimizes for (sound, intimacy, scale)
4. Who thrills here vs who mismatches
5. Fan themes (only with methodology)
6. Practical notes (transit, age policy if sourced)
7. What is on next — without becoming a press release

## QA
No "vibrant hub" language. Every claim sourced.`,
    cta: 'Venues: send corrections; we prefer accuracy to myth.',
    format: 'Editorial template',
    tags: ['template', 'research'],
  }),
  idea({
    id: 'vn-li-02',
    angleId: 'venue-as-product',
    channel: 'linkedin',
    person: 'Theo Kagan',
    title: 'What soft distribution looks like for rooms',
    hook: 'Door QR and email footers beat one Instagram shoutout.',
    copy: `Partnerships that move users are boring on paper:

- A QR at will-call
- A line in the week-of email
- A monthly Story that is actually useful

They are powerful because they repeat.

Synth’s offer to independent rooms: we help newcomers understand why your room matters; you give us a durable placement. Vanity collabs optional.`,
    cta: 'DM if you want a sample asset kit for your room.',
    format: 'Partnerships post',
    tags: ['BD', 'QR'],
  }),

  // —— taste-to-tonight ——
  idea({
    id: 'tt-li-01',
    angleId: 'taste-to-tonight',
    channel: 'linkedin',
    person: 'Tej Patel',
    title: 'Listening graphs are not going graphs',
    hook: 'Spotify solved taste. Tonight still needs logistics and locality.',
    copy: `Streaming preference signals are incredible — and incomplete for live.

Knowing you stream an artist does not mean:
- they are playing within range
- the room fits
- you have someone to go with
- you will remember the night

Synth syncs Spotify / Apple Music as input to live discovery, then adds venue context, social graph, and passport. The product is the night, not the playlist.`,
    cta: 'Data folks in music: how do you bridge catalog taste → physical attendance?',
    format: 'Product thesis',
    tags: ['streaming', 'ML'],
  }),
  idea({
    id: 'tt-ig-01',
    angleId: 'taste-to-tonight',
    channel: 'instagram',
    person: 'Lauren Pesce',
    title: 'Your top artists → nearby shows',
    hook: 'Connect streaming. See what is actually playable this month.',
    copy: `If your Wrapped was a personality test, your next month of shows should not be a scavenger hunt.

Connect Spotify or Apple Music in Synth. We use taste as a signal for discovery — then you still choose the night, the room, and the people.`,
    cta: 'Sync taste in onboarding.',
    format: 'Product demo stills',
    tags: ['onboarding', 'spotify'],
  }),
  idea({
    id: 'tt-tt-01',
    angleId: 'taste-to-tonight',
    channel: 'tiktok',
    person: 'Theo Kagan',
    title: 'I let my Spotify pick my weekend',
    hook: 'Experiment format.',
    copy: `Open Synth after sync → show 3 recommended upcoming local bills → pick one → film night-of B-roll → stamp passport next day.

Caption energy: "Streaming said this. DC said show up."`,
    cta: 'Duet your result.',
    format: 'Vlog experiment',
    tags: ['ugc', 'demo'],
  }),
  idea({
    id: 'tt-ss-01',
    angleId: 'taste-to-tonight',
    channel: 'substack',
    person: 'Tej Patel',
    title: 'Preference signals without creepy social',
    hook: 'How Synth thinks about personalization boundaries.',
    copy: `## Thesis
Live recommendations need taste + locality + social context — with hard lines on what never ships.

## Outline
- Signal types (streaming, reviews, graph, attendance)
- What we optimize (relevant nights, not maximal screen time)
- Privacy posture for agents and marketers
- Why “people like you also went” needs careful UX`,
    cta: 'Read next: metro density essay.',
    format: 'Product ethics essay',
    tags: ['privacy', 'recs'],
  }),

  // —— post-show-memory ——
  idea({
    id: 'ps-ig-01',
    angleId: 'post-show-memory',
    channel: 'instagram',
    person: 'Lauren Pesce',
    title: 'Morning-after review ritual',
    hook: 'Write it before the setlist leaves your head.',
    copy: `Best time to review a show: before brunch opinions take over.

In Synth:
- rating
- what hit / what missed
- setlist notes
- tag who you went with
- stamp the passport

Future you will thank present you.`,
    cta: 'Open your passport.',
    format: 'Ritual carousel',
    tags: ['habit', 'reviews'],
  }),
  idea({
    id: 'ps-tt-01',
    angleId: 'post-show-memory',
    channel: 'tiktok',
    person: 'Theo Kagan',
    title: 'Rating last night’s show in public',
    hook: 'Unhinged honesty, structured.',
    copy: `Film: walking home / metro / next morning coffee.
On-screen prompts: opener / production / crowd / song of the night / would go again.
End with Synth review submit screen.`,
    cta: 'Duet your rating.',
    format: 'Rating template',
    tags: ['ugc', 'review'],
  }),
  idea({
    id: 'ps-ss-01',
    angleId: 'post-show-memory',
    channel: 'substack',
    person: 'Lauren Pesce',
    title: 'Why concert reviews die in group chats',
    hook: 'UX essay on memory decay.',
    copy: `## Thesis
Ephemeral chat is the wrong medium for cultural memory. Structured reviews + media + setlists create compounding scene knowledge.

## Sections
- Memory decay curve after a show
- What Letterboxd got right about friction
- Designing Synth reviews for speed without emptiness
- How reviews feed discovery ethically`,
    cta: 'Send us a review you are proud of — with permission to teach from it.',
    format: 'Design essay',
    tags: ['ux', 'memory'],
  }),
  idea({
    id: 'ps-li-01',
    angleId: 'post-show-memory',
    channel: 'linkedin',
    person: 'Lauren Pesce',
    title: 'Habit loops for cultural products',
    hook: 'Passport stamps are not gamification cosplay — they are memory UX.',
    copy: `Cultural apps win when logging feels like identity, not chores.

For live music, the valuable moment is immediately post-show: emotion is high, details are fresh, social tags are easy.

Synth’s passport and review flow are built around that window. If you are designing consumer habits in media or events, the lesson is timing — not badges for badges’ sake.`,
    cta: 'Product folks: what habit window do you design for?',
    format: 'CPO insight',
    tags: ['product', 'habits'],
  }),

  // —— campus-density ——
  idea({
    id: 'ca-li-01',
    angleId: 'campus-density',
    channel: 'linkedin',
    person: 'Theo Kagan',
    title: 'Ambassadors before ads',
    hook: 'Early social graphs are recruited, not purchased.',
    copy: `In a metro launch, paid social can buy installs that never meet each other.

Campus ambassadors buy something rarer: nights where five people who already share context open the same app.

Synth’s DC motion prioritizes schools, radio, and orgs that already aggregate taste. The ask is simple — weekly utility for their members — not a logo on a flyer nobody reads.`,
    cta: 'Campus programmers in DMV: I want to send you a kit.',
    format: 'Ops / GTM',
    tags: ['campus', 'growth'],
  }),
  idea({
    id: 'ca-ig-01',
    angleId: 'campus-density',
    channel: 'instagram',
    person: 'Theo Kagan',
    title: 'Campus night: who’s actually going',
    hook: 'Stop screenshotting Stories to plan.',
    copy: `Student workflow:

1. See what is on this week near campus
2. Find classmates / friends already interested
3. Go
4. Stamp + review so the next week is easier

Synth is built for that loop — especially in DC.`,
    cta: 'Ask your org lead about Synth campus access.',
    format: 'Student-facing',
    tags: ['students'],
  }),
  idea({
    id: 'ca-tt-01',
    angleId: 'campus-density',
    channel: 'tiktok',
    person: 'Theo Kagan',
    title: 'Day in the life: campus show runner',
    hook: 'POV you are the friend who always knows the bill.',
    copy: `Follow an ambassador:
- morning scroll of DC listings
- group chat triage
- night-of B-roll
- morning review

Position Synth as the stack that replaces five screenshots.`,
    cta: 'Want the ambassador brief? Link in bio.',
    format: 'Day-in-life',
    tags: ['ambassador'],
  }),
  idea({
    id: 'ca-ss-01',
    angleId: 'campus-density',
    channel: 'substack',
    person: 'Theo Kagan',
    title: 'How to launch a metro through campuses',
    hook: 'Tactical playbook.',
    copy: `## Thesis
Campuses are density amplifiers when you give organizers utility, not swag.

## Playbook
- Map orgs (radio, programming boards, genre clubs)
- Offer: weekly roundup + QR + exclusive chat seed
- Measure: multi-account nights, reviews within 48h
- Avoid: one-off tabling without content follow-through`,
    cta: 'Share with a student programmer.',
    format: 'Playbook',
    tags: ['gtm'],
  }),

  // —— partner-pipes ——
  idea({
    id: 'pp-li-01',
    angleId: 'partner-pipes',
    channel: 'linkedin',
    person: 'Sam Loiterstein',
    title: 'Distribution > announcements',
    hook: 'If the partnership only produces one post, it was PR, not distribution.',
    copy: `We evaluate partners as pipes:

- Can this placement repeat monthly?
- Does it reach people already close to live music decisions?
- Can we attribute joins without creepy tracking theater?

Venues, campus orgs, and local writers clear that bar more often than broad lifestyle shoutouts.

Synth will trade real editorial and product usefulness for durable placement. That is the deal.`,
    cta: 'If you control a pipe in DC live culture, let’s design the repeatable version.',
    format: 'BD thesis',
    tags: ['partnerships'],
  }),
  idea({
    id: 'pp-li-02',
    angleId: 'partner-pipes',
    channel: 'linkedin',
    person: 'Theo Kagan',
    title: 'Sample venue partner kit (what we send)',
    hook: 'Show the artifact, then ask.',
    copy: `Our first message to a room rarely starts with a deck.

It starts with:
1. A draft IG carousel about their next bills
2. A short venue explainer outline with sourced facts
3. A mock door QR + email footer line

Partners say yes to usefulness they can see. Synth’s niche brief and Content Calendar exist to industrialize that usefulness without sounding like a press release.`,
    cta: 'Need a kit for your room? Comment or DM.',
    format: 'Tactical BD',
    tags: ['kit', 'sales'],
  }),
  idea({
    id: 'pp-ss-01',
    angleId: 'partner-pipes',
    channel: 'substack',
    person: 'Sam Loiterstein',
    title: 'A taxonomy of live-music distribution partners',
    hook: 'Who amplifies, who converts, who only vanity-likes.',
    copy: `## Thesis
Not all “music partners” are distribution.

## Taxonomy
- Venues & promoters
- Campus & radio
- Local writers / Substacks
- Artists & managers
- Brands & tourism
- Complementary apps

For each: offer, ask, content motion, anti-pattern.`,
    cta: 'Forward to your partnerships lead.',
    format: 'Strategy essay',
    tags: ['taxonomy'],
  }),
  idea({
    id: 'pp-ig-01',
    angleId: 'partner-pipes',
    channel: 'instagram',
    person: 'Synth',
    title: 'Thank-you post that still helps fans',
    hook: 'Partner shout without empty vibes.',
    copy: `Template:
"This week we’re highlighting [Venue] — not because they posted about us, but because [specific room fact].

Upcoming: [Show 1], [Show 2].

Find the bills + people on Synth. Support the room by showing up."`,
    cta: 'Tag the venue.',
    format: 'Partner spotlight',
    tags: ['collab'],
  }),

  // —— short-form-scene ——
  idea({
    id: 'sf-tt-01',
    angleId: 'short-form-scene',
    channel: 'tiktok',
    person: 'Theo Kagan',
    title: 'How to read a lineup like a local',
    hook: 'Opener / support / headliner decoding.',
    copy: `Teach:
- Why support bills matter in small rooms
- When to arrive
- How genre tags lie on flyers

Always name a real DC example.`,
    cta: 'Save for your next ticket buy.',
    format: 'Educational',
    tags: ['literacy'],
  }),
  idea({
    id: 'sf-ig-01',
    angleId: 'short-form-scene',
    channel: 'instagram',
    person: 'Lauren Pesce',
    title: 'Scene myths we are retiring',
    hook: 'Myth vs reality cards.',
    copy: `Myths:
- "Going alone is weird" → rooms are full of solos
- "If it’s not on IG it is not real" → DIY still matters
- "Big room = better night" → mismatch kills vibes

Synth exists so taste and rooms can meet without the myths.`,
    cta: 'Which myth wasted your money?',
    format: 'Myth cards',
    tags: ['myths'],
  }),
  idea({
    id: 'sf-tt-02',
    angleId: 'short-form-scene',
    channel: 'tiktok',
    person: 'Lauren Pesce',
    title: 'What to wear is not the hard part',
    hook: 'The hard part is picking the room.',
    copy: `Comedic flip of fashion TikTok → decision framework for venue choice based on bill intimacy, not outfit.

End on Synth discover filters / vibe selection.`,
    cta: 'Follow for DC decision frameworks.',
    format: 'Comedy + tip',
    tags: ['humor'],
  }),
  idea({
    id: 'sf-ig-02',
    angleId: 'short-form-scene',
    channel: 'instagram',
    person: 'Synth',
    title: 'Saveable: doors / soundcheck / encore timing',
    hook: 'Generic timing guide — localize when possible.',
    copy: `A practical timing carousel for common DC room patterns (note variances). Position as “start here, verify on the event page.”

CTA into Synth event detail.`,
    cta: 'Verify on the event page in Synth.',
    format: 'Utility carousel',
    tags: ['utility'],
  }),
  idea({
    id: 'sf-ss-01',
    angleId: 'short-form-scene',
    channel: 'substack',
    person: 'Lauren Pesce',
    title: 'What short-form owes the scene',
    hook: 'A craft essay for Synth’s IG/TikTok standard.',
    copy: `## Thesis
Short-form fails scenes when it extracts vibes and erases places. Synth’s standard: every clip should make a viewer more competent in a real metro.

## Rules
- Name the room when you can
- Prefer tips over thirst
- No fake crowds
- Product appears after value`,
    cta: 'Use as briefing for creators.',
    format: 'Craft guide',
    tags: ['standards'],
  }),

  // —— trust-not-hype ——
  idea({
    id: 'tr-li-01',
    angleId: 'trust-not-hype',
    channel: 'linkedin',
    person: 'Sam Loiterstein',
    title: 'We banned “vibrant hub” from drafts',
    hook: 'Editorial quality is a growth strategy.',
    copy: `Empty praise is easy to generate and impossible to trust.

Synth’s editorial system requires evidence objects, claim ledgers, and platform-native jobs. If a sentence could describe any venue in America, it does not ship.

That discipline matters for consumers and for partners. Rooms can tell when you actually did the reading.`,
    cta: 'Our training guide is internal — happy to share principles with operator-marketers.',
    format: 'Quality bar',
    tags: ['editorial', 'qa'],
  }),
  idea({
    id: 'tr-ss-01',
    angleId: 'trust-not-hype',
    channel: 'substack',
    person: 'Sam Loiterstein',
    title: 'How Synth turns research into copy',
    hook: 'Behind-the-scenes of the Content Calendar.',
    copy: `## Thesis
Automation without standards produces sludge. Here is how research → brief → platform drafts → human approve works for DC subjects.

## Sections
- Source tiers
- Sentiment rules (when numbers stay internal)
- Platform jobs (IG / LinkedIn / Substack / Reddit)
- Rejection criteria
- What humans still must do`,
    cta: 'Operators: this is why our venue features take longer — and read better.',
    format: 'Process essay',
    tags: ['process'],
  }),
  idea({
    id: 'tr-ig-01',
    angleId: 'trust-not-hype',
    channel: 'instagram',
    person: 'Synth',
    title: 'One specific fact > ten adjectives',
    hook: 'Before/after caption rewrite.',
    copy: `Before: "Iconic venue with a vibrant community and unforgettable nights."

After: "[Specific opening date / room detail / sourced fan theme]."

We publish the after. Follow for DC rooms treated like they matter.`,
    cta: 'Send a venue you want researched.',
    format: 'Rewrite demo',
    tags: ['voice'],
  }),
  idea({
    id: 'tr-tt-01',
    angleId: 'trust-not-hype',
    channel: 'tiktok',
    person: 'Theo Kagan',
    title: 'Roasting AI concert captions',
    hook: 'Read bad caption → rewrite live.',
    copy: `Show a generic AI venue blurb, buzz every banned phrase, rewrite with one concrete fact + one human question.

Soft Synth endcard.`,
    cta: 'Duet your worst venue bio.',
    format: 'Roast / teach',
    tags: ['voice', 'humor'],
  }),

  // —— live-renaissance ——
  idea({
    id: 'lr-li-01',
    angleId: 'live-renaissance',
    channel: 'linkedin',
    person: 'Sam Loiterstein',
    title: 'Streaming won catalog. Live won meaning.',
    hook: 'Macro take for music-tech and culture operators.',
    copy: `Infinite catalogs made listening easy and nights scarce.

The products that win the next decade in music culture will not only recommend songs — they will help people show up, show together, and remember.

That is the renaissance Synth is building around: live as identity infrastructure.`,
    cta: 'Agree / disagree — especially if you work venue-side.',
    format: 'Thought leadership',
    tags: ['macro'],
  }),
  idea({
    id: 'lr-ss-01',
    angleId: 'live-renaissance',
    channel: 'substack',
    person: 'Sam Loiterstein',
    title: 'Live music after the playlist era',
    hook: 'Long-form cultural argument.',
    copy: `## Thesis
Playlists flattened discovery of songs; live scenes re-localized identity. Products must follow attention back to rooms.

## Sections
- What streaming optimized
- What fans still cannot do well in software
- Evidence from metro scenes (DC case)
- Product implications for Synth
- Partnership implications for rooms and campuses`,
    cta: 'Subscribe for the metro essays that follow.',
    format: 'Manifesto-length',
    tags: ['culture'],
  }),
  idea({
    id: 'lr-ig-01',
    angleId: 'live-renaissance',
    channel: 'instagram',
    person: 'Lauren Pesce',
    title: 'Playlist energy vs room energy',
    hook: 'Split imagery.',
    copy: `Left: headphones, infinite scroll, private taste.
Right: room, sweat, strangers who become references.

Both matter. Only one needs a passport.

Synth is for the nights.`,
    cta: 'Stamp your next one.',
    format: 'Visual essay',
    tags: ['brand'],
  }),
  idea({
    id: 'lr-tt-01',
    angleId: 'live-renaissance',
    channel: 'tiktok',
    person: 'Theo Kagan',
    title: 'Things that only happen live',
    hook: 'Listicle with B-roll.',
    copy: `Examples:
- The stranger who knew every deep cut
- The opener that becomes your new artist
- The photo that is ugly and perfect
- The metro ride debate

CTA: log it or lose it → Synth`,
    cta: 'Stitch with your live-only moment.',
    format: 'Listicle',
    tags: ['emotion'],
  }),

  // Extra volume across angles for a "LARGE" pool
  idea({
    id: 'll-li-02',
    angleId: 'letterboxd-for-live',
    channel: 'linkedin',
    person: 'Lauren Pesce',
    title: 'Designing identity without turning concerts into clout',
    hook: 'Passport UX that rewards memory, not performance.',
    copy: `Social products drift toward performance. Live music identity should drift toward memory and taste literacy.

That shows up in small choices: review prompts, how friends are tagged, what the feed celebrates.

Synth’s design goal is pride in nights attended — not a leaderboard of who looked busiest.`,
    cta: 'Designers in consumer social: what guardrails do you use?',
    format: 'Design leadership',
    tags: ['ux'],
  }),
  idea({
    id: 'ss-li-02',
    angleId: 'solo-show-problem',
    channel: 'linkedin',
    person: 'Lauren Pesce',
    title: 'Companionship features without dating-app residue',
    hook: 'Taste-first connection is a product constraint.',
    copy: `“Find someone to go with” can slide into the wrong category fast.

Constraints we care about:
- taste and event context first
- low-pressure group and chat patterns
- safety and report paths
- no obligation to match strangers for its own sake

The job is fewer missed shows — not a new swipe mechanic.`,
    cta: 'Campus safety + student life leads: we want your critique.',
    format: 'Product constraint',
    tags: ['safety', 'connect'],
  }),
  idea({
    id: 'dc-li-02',
    angleId: 'metro-first-dc',
    channel: 'linkedin',
    person: 'Tej Patel',
    title: 'Event data quality as a trust product',
    hook: 'Wrong door times destroy consumer trust faster than missing features.',
    copy: `In live discovery, accuracy is UX.

Synth invests in catalog pipelines (JamBase and others), venue/event joins, and editorial research because a beautiful app with wrong nights is worse than a plain calendar that is right.

Partners feel this too: if we feature your room, the facts should be yours.`,
    cta: 'Data providers / venues: accuracy partnerships > logo swaps.',
    format: 'Infra trust',
    tags: ['data'],
  }),
  idea({
    id: 'vn-ig-02',
    angleId: 'venue-as-product',
    channel: 'instagram',
    person: 'Synth',
    title: 'Room of the week',
    hook: 'One DC room, three facts, one upcoming bill.',
    copy: `Template:
• Fact 1 (history, sourced)
• Fact 2 (what the room optimizes)
• Fact 3 (practical)
• Next bill worth catching

No adjectives without evidence.`,
    cta: 'Full essay on Substack when we go deep.',
    format: 'Weekly series',
    tags: ['series'],
  }),
  idea({
    id: 'vn-tt-02',
    angleId: 'venue-as-product',
    channel: 'tiktok',
    person: 'Theo Kagan',
    title: 'Ranking DC rooms for first-dates vs friends vs alone',
    hook: 'Controversial on purpose, specific on facts.',
    copy: `Rank 5 rooms across contexts. Disclaim taste. Invite duet arguments. Soft Synth CTA for listings.`,
    cta: 'Duel me with your ranking.',
    format: 'Ranking',
    tags: ['engagement'],
  }),
  idea({
    id: 'tt-ig-02',
    angleId: 'taste-to-tonight',
    channel: 'instagram',
    person: 'Synth',
    title: 'Taste mismatch stories',
    hook: 'When your playlist and your city disagree.',
    copy: `Sometimes your top artist is not touring. Sometimes a local bill is a better night than a stadium stream favorite.

Discovery should handle both without shaming either.`,
    cta: 'Open upcoming near you.',
    format: 'Relatable single',
    tags: ['discovery'],
  }),
  idea({
    id: 'ps-ig-02',
    angleId: 'post-show-memory',
    channel: 'instagram',
    person: 'Synth',
    title: 'Tag the friend who got you to go',
    hook: 'Social proof that is actually gratitude.',
    copy: `Reviews with friend tags turn private nights into shared history.

Do it while the jokes are still funny.`,
    cta: 'Tag them in Synth.',
    format: 'UGC prompt',
    tags: ['friends'],
  }),
  idea({
    id: 'ca-ig-02',
    angleId: 'campus-density',
    channel: 'instagram',
    person: 'Theo Kagan',
    title: 'Org toolkit preview',
    hook: 'What ambassadors actually get.',
    copy: `Preview assets:
- weekly story templates
- QR for join
- “who’s going” norms
- post-show review challenge

Utility first.`,
    cta: 'DM “CAMPUS” for the kit outline.',
    format: 'Recruiting',
    tags: ['ambassador'],
  }),
  idea({
    id: 'pp-li-03',
    angleId: 'partner-pipes',
    channel: 'linkedin',
    person: 'Tej Patel',
    title: 'Attribution without creepy theater',
    hook: 'How we think about measuring partner pipes.',
    copy: `We prefer coarse, consensual measurement:
- unique invite codes / QR campaigns
- metro-qualified joins
- return visits to partner events

We do not need to pretend we can track every Story view into a seat. Partners care about rooms filling and fans returning.`,
    cta: 'Partnerships leads: what reporting do you actually read?',
    format: 'Measurement',
    tags: ['metrics'],
  }),
  idea({
    id: 'sf-ig-03',
    angleId: 'short-form-scene',
    channel: 'instagram',
    person: 'Lauren Pesce',
    title: 'Etiquette: phone lights vs presence',
    hook: 'Not a lecture — a choice.',
    copy: `Film the chorus if you want. Also put the phone down for one song you love.

Passport the night either way.`,
    cta: 'What is your phone rule?',
    format: 'Discussion',
    tags: ['etiquette'],
  }),
  idea({
    id: 'tr-li-02',
    angleId: 'trust-not-hype',
    channel: 'linkedin',
    person: 'Tej Patel',
    title: 'Human approve is a feature',
    hook: 'Why Synth keeps a human in the Content Calendar loop.',
    copy: `We generate drafts. We do not autopublish vibes.

Pending review exists because platforms punish sludge and scenes punish inaccuracy. Automation scales research and first drafts; editors protect trust.

That is the operating model behind getsynth.app/admin Content Calendar.`,
    cta: 'Building AI editorial tools? Compare notes on QA gates.',
    format: 'Ops AI',
    tags: ['ai', 'qa'],
  }),
  idea({
    id: 'lr-li-02',
    angleId: 'live-renaissance',
    channel: 'linkedin',
    person: 'Theo Kagan',
    title: 'Tourism boards keep forgetting live music',
    hook: 'Visitor products undersell rooms.',
    copy: `City guides sell museums and brunch. Visitors still ask locals where to see something real at night.

A live discovery layer — accurate, social, metro-specific — is tourism infrastructure. Synth wants those conversations in DC and beyond.`,
    cta: 'Culture / tourism partners: let’s talk guides that include rooms.',
    format: 'Partner wedge',
    tags: ['tourism'],
  }),
  idea({
    id: 'll-tt-02',
    angleId: 'letterboxd-for-live',
    channel: 'tiktok',
    person: 'Lauren Pesce',
    title: 'Showing my concert personality like a Letterboxd profile',
    hook: 'Aesthetic template.',
    copy: `Recreate Letterboxd-profile energy with show posters / passport UI / top 4 nights. Soft product end.`,
    cta: 'Make yours.',
    format: 'Aesthetic trend',
    tags: ['trend'],
  }),
  idea({
    id: 'ss-tt-02',
    angleId: 'solo-show-problem',
    channel: 'tiktok',
    person: 'Sam Loiterstein',
    title: 'Founder: why we built Synth',
    hook: '30s origin.',
    copy: `Talking head: missed shows → wished for a platform → Discover Connect Share. End on DC focus.`,
    cta: 'Follow the build.',
    format: 'Founder face',
    tags: ['origin'],
  }),
  idea({
    id: 'dc-ss-02',
    angleId: 'metro-first-dc',
    channel: 'substack',
    person: 'Lauren Pesce',
    title: 'A transplant’s map of DC listening',
    hook: 'Narrative long-form with product soft mentions.',
    copy: `## Thesis
Arriving in DC without a room map wastes months. Here is a human path through rooms and communities — and how software should help.

## Include
- First-month itinerary
- Mistakes
- People/orgs that helped
- Where Synth fits without taking over the story`,
    cta: 'Transplants: reply with your first great DC show.',
    format: 'Narrative',
    tags: ['transplant'],
  }),
  idea({
    id: 'vn-ss-02',
    angleId: 'venue-as-product',
    channel: 'substack',
    person: 'Sam Loiterstein',
    title: 'Case study: researching a DC room end-to-end',
    hook: 'Annotated example using Content Calendar research.',
    copy: `## Thesis
Show the claim ledger publicly (sanitized) so readers see how trust is built.

## Include
- Sources table
- Rejected hype lines
- Platform-native final drafts (IG / LI / Substack summaries)`,
    cta: 'Venues: request a research pass.',
    format: 'Case study',
    tags: ['case study'],
  }),
  idea({
    id: 'tt-li-02',
    angleId: 'taste-to-tonight',
    channel: 'linkedin',
    person: 'Sam Loiterstein',
    title: 'Onboarding that ends in a night, not a profile',
    hook: 'Activation metric: upcoming show saved or attended intent.',
    copy: `Pretty profiles are vanity. For Synth, early success looks like: city chosen, taste synced, at least one upcoming night that feels real.

Everything in onboarding should serve that outcome — including streaming sync.`,
    cta: 'Consumer GTM folks: what is your “first value” event?',
    format: 'Activation',
    tags: ['activation'],
  }),
  idea({
    id: 'ps-tt-02',
    angleId: 'post-show-memory',
    channel: 'tiktok',
    person: 'Lauren Pesce',
    title: 'Setlist memory challenge',
    hook: 'Write the setlist from memory before you Google it.',
    copy: `Film the struggle → check official setlist → log in Synth with corrections. Fun + habit.`,
    cta: 'Challenge a friend.',
    format: 'Challenge',
    tags: ['setlist'],
  }),
  idea({
    id: 'ca-li-02',
    angleId: 'campus-density',
    channel: 'linkedin',
    person: 'Sam Loiterstein',
    title: 'Why student graphs compound faster',
    hook: 'Shared schedules + shared venues = faster trust.',
    copy: `Off-campus adult graphs are sparse. Campus graphs share geography, evenings, and reference points.

That is why Synth treats campus as infrastructure for metro density — not as a side quest.`,
    cta: 'University partners in DMV: open to a pilot?',
    format: 'Strategy',
    tags: ['campus'],
  }),
  idea({
    id: 'pp-ss-02',
    angleId: 'partner-pipes',
    channel: 'substack',
    person: 'Theo Kagan',
    title: 'Email footer lines that do not embarrass venues',
    hook: 'Copy kit for partners.',
    copy: `## Thesis
Partner copy should sound like the venue, not like our pitch deck.

## Include
- 10 footer variants
- Story scripts
- Door sign microcopy
- What we never ask venues to say`,
    cta: 'Steal this kit.',
    format: 'Copy deck',
    tags: ['copy'],
  }),
  idea({
    id: 'sf-tt-03',
    angleId: 'short-form-scene',
    channel: 'tiktok',
    person: 'Theo Kagan',
    title: 'DIY vs club vs theater — pick your sport',
    hook: 'Taxonomy for newcomers.',
    copy: `Explain attendance expectations across room types with DC examples. CTA to discover filters.`,
    cta: 'Which sport are you?',
    format: 'Taxonomy',
    tags: ['education'],
  }),
  idea({
    id: 'tr-ig-02',
    angleId: 'trust-not-hype',
    channel: 'instagram',
    person: 'Synth',
    title: 'Sources or it does not ship',
    hook: 'Brand promise for editorial.',
    copy: `If we cannot point to a source, we do not publish the claim.

That is how we treat DC rooms — and how we want to treat every metro next.`,
    cta: 'Read the long process note on Substack.',
    format: 'Brand principle',
    tags: ['trust'],
  }),
  idea({
    id: 'lr-ig-02',
    angleId: 'live-renaissance',
    channel: 'instagram',
    person: 'Sam Loiterstein',
    title: 'Founder note: nights > metrics theater',
    hook: 'Short sincere caption.',
    copy: `We will share learnings. We will not invent vanity metrics.

If you are here, you probably care about nights. So do we.

Discover. Connect. Share.`,
    cta: 'join.getsynth.app',
    format: 'Founder note',
    tags: ['brand'],
  }),
  idea({
    id: 'll-ss-02',
    angleId: 'letterboxd-for-live',
    channel: 'substack',
    person: 'Lauren Pesce',
    title: 'What to steal from Letterboxd (and what not to)',
    hook: 'Product teardown for builders.',
    copy: `## Steal
- Public taste language
- Logging as identity
- Social without forcing chat

## Do not steal
- Film-release cadence assumptions
- Desktop-first habits
- Ignoring locality

## Synth adaptations for live`,
    cta: 'Builders: reply with your favorite cultural logbook.',
    format: 'Teardown',
    tags: ['product'],
  }),
  idea({
    id: 'sc-ig-02',
    angleId: 'scattered-live-stack',
    channel: 'instagram',
    person: 'Tej Patel',
    title: 'Privacy-conscious social for music fans',
    hook: 'One principle, plain language.',
    copy: `Connect with people around shows without turning your entire listening history into a billboard.

Taste signals should help you find nights — not expose you by default.`,
    cta: 'Read how we think about signals on Substack.',
    format: 'Principle',
    tags: ['privacy'],
  }),
  idea({
    id: 'dc-tt-02',
    angleId: 'metro-first-dc',
    channel: 'tiktok',
    person: 'Theo Kagan',
    title: 'DC show this week — should you go?',
    hook: 'Decision framework live.',
    copy: `Pick a real upcoming bill. Score: taste fit / room fit / friend availability / recovery cost. Show Synth page. Decide on camera.`,
    cta: 'Duet your score.',
    format: 'Decision',
    tags: ['weekly'],
  }),
  idea({
    id: 'vn-li-03',
    angleId: 'venue-as-product',
    channel: 'linkedin',
    person: 'Sam Loiterstein',
    title: 'Why independents should care about fan passports',
    hook: 'Repeat attendance is an identity loop.',
    copy: `When fans can see their history with your room, they narrate loyalty to themselves.

That is cheaper than reacquiring them with ads every calendar drop.

Synth passports make those histories legible — for fans first, for rooms as a side effect.`,
    cta: 'Independent venues: want a passport-friendly collab?',
    format: 'Retention angle',
    tags: ['retention'],
  }),
  idea({
    id: 'tt-ss-02',
    angleId: 'taste-to-tonight',
    channel: 'substack',
    person: 'Sam Loiterstein',
    title: 'The last mile of music recommendations',
    hook: 'From track → ticket → companion → memory.',
    copy: `## Thesis
Recsys ends too early. The last mile is human and local.

## Map the mile
Streaming → awareness → ticket → logistics → companionship → attendance → memory → next discovery

Where Synth sits on that map.`,
    cta: 'Product people: where does your funnel stop?',
    format: 'Strategy',
    tags: ['recs'],
  }),
  idea({
    id: 'ps-ss-02',
    angleId: 'post-show-memory',
    channel: 'substack',
    person: 'Theo Kagan',
    title: 'Collecting setlists without killing the vibe',
    hook: 'Ops + culture note.',
    copy: `## Thesis
Setlists are communal knowledge. Capture UX must be fast, optional, and respectful of rooms that discourage phones.

## Include
- In-app patterns
- When not to film
- How reviews reference setlists`,
    cta: 'Photographers + fans: send your norms.',
    format: 'Norms essay',
    tags: ['setlist', 'culture'],
  }),
  idea({
    id: 'ca-tt-02',
    angleId: 'campus-density',
    channel: 'tiktok',
    person: 'Theo Kagan',
    title: 'Club meeting → show night pipeline',
    hook: 'For org leaders.',
    copy: `Show a 15s pipeline: meeting agenda → Synth roundup → who’s going → review challenge. Recruit ambassadors.`,
    cta: 'Org leaders comment your school.',
    format: 'Recruit',
    tags: ['campus'],
  }),
  idea({
    id: 'pp-ig-02',
    angleId: 'partner-pipes',
    channel: 'instagram',
    person: 'Synth',
    title: 'Writer collab CTA',
    hook: 'Local music writers welcome.',
    copy: `If you write about DC rooms with sources and opinions, we want distribution partnerships — swaps, co-bylines, research access — not vague “exposure.”`,
    cta: 'DM “WRITER”.',
    format: 'Recruit',
    tags: ['media'],
  }),
  idea({
    id: 'sf-li-01',
    angleId: 'short-form-scene',
    channel: 'linkedin',
    person: 'Lauren Pesce',
    title: 'Short-form as scene literacy, not nightlife spam',
    hook: 'A creative standard for music brands.',
    copy: `Most brand TikTok in music sells vibes and erases places.

Synth’s creative rule: a stranger should leave more competent about a real metro. That standard makes better fans and better partners.`,
    cta: 'Creative leads at venues: steal the rule.',
    format: 'Creative ops',
    tags: ['creative'],
  }),
  idea({
    id: 'tr-ss-02',
    angleId: 'trust-not-hype',
    channel: 'substack',
    person: 'Tej Patel',
    title: 'Banned phrases and why they fail',
    hook: 'Public excerpt from editorial training.',
    copy: `## Thesis
Weak language hides missing evidence.

## List
- vibrant ecosystem, cornerstone, iconic (unsourced), music lovers, share your thoughts…

## Rewrite patterns
Show before/after with DC examples.`,
    cta: 'Editors: fork this list for your newsroom.',
    format: 'Style excerpt',
    tags: ['voice'],
  }),
  idea({
    id: 'lr-ss-02',
    angleId: 'live-renaissance',
    channel: 'substack',
    person: 'Tej Patel',
    title: 'Scarcity returns to music — physically',
    hook: 'Econ + culture hybrid essay.',
    copy: `## Thesis
Digital abundance pushed meaning into scarce physical nights. Software that ignores scarcity will feel thin.

## Sections
- Attention economics
- Room capacity as cultural scarcity
- Implications for Synth graph design`,
    cta: 'Economists + bookers: argue with me.',
    format: 'Hybrid essay',
    tags: ['economics'],
  }),
  idea({
    id: 'll-ig-02',
    angleId: 'letterboxd-for-live',
    channel: 'instagram',
    person: 'Sam Loiterstein',
    title: 'App Store line, explained',
    hook: 'What “Letterboxd for live music” means in practice.',
    copy: `Not: we cloned a movie app.
Yes: public taste, logging, social proof, discovery — rebuilt for nights, rooms, and people.

That is the category we are claiming.`,
    cta: 'Try the passport.',
    format: 'Explain',
    tags: ['category'],
  }),
  idea({
    id: 'ss-ig-03',
    angleId: 'solo-show-problem',
    channel: 'instagram',
    person: 'Theo Kagan',
    title: 'Bring-a-friend scripts that are not awkward',
    hook: 'Copy-paste messages.',
    copy: `Three texts that work:
1. "This bill is weird in a good way — you in?"
2. "Going anyway; join if free"
3. "Synth says people with our taste are looking at this one"

Normalize the ask.`,
    cta: 'Screenshot your best invite.',
    format: 'Utility',
    tags: ['scripts'],
  }),
  idea({
    id: 'dc-ig-03',
    angleId: 'metro-first-dc',
    channel: 'instagram',
    person: 'Synth',
    title: 'Neighborhood to room map',
    hook: 'U Street / Navy Yard / etc. starter.',
    copy: `Carousel: neighborhood → representative rooms → transit note → “verify bills on Synth.”

Local specificity is the brand.`,
    cta: 'Save for visitors.',
    format: 'Map carousel',
    tags: ['local'],
  }),
];

export function ideasForAngle(angleId: string): ContentIdea[] {
  return CONTENT_IDEAS.filter((i) => i.angleId === angleId);
}

export function ideasForBucket(bucketId: ChannelBucketId): ContentIdea[] {
  return CONTENT_IDEAS.filter((i) => i.bucketId === bucketId);
}

export function ideasForAngleAndBucket(
  angleId: string,
  bucketId: ChannelBucketId,
): ContentIdea[] {
  return CONTENT_IDEAS.filter((i) => i.angleId === angleId && i.bucketId === bucketId);
}

export function getAngle(id: string): UmbrellaAngle | undefined {
  return UMBRELLA_ANGLES.find((a) => a.id === id);
}

export function getBucket(id: ChannelBucketId): ChannelBucket | undefined {
  return CHANNEL_BUCKETS.find((b) => b.id === id);
}

export function channelLabel(channel: ReservoirChannel): string {
  switch (channel) {
    case 'linkedin':
      return 'LinkedIn';
    case 'instagram':
      return 'Instagram';
    case 'tiktok':
      return 'TikTok';
    case 'substack':
      return 'Substack';
    default:
      return channel;
  }
}
