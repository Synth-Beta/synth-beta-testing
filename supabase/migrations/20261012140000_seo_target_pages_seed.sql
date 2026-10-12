-- Published guide / brand / comparison pages for every seeded seo_target_queries row.
-- Idempotent: re-run safe via ON CONFLICT (page_type, slug).

CREATE OR REPLACE FUNCTION public.seo_seed_target_page(
  p_query text,
  p_slug text,
  p_title text,
  p_meta text,
  p_summary text,
  p_body_md text,
  p_faq jsonb DEFAULT '[]'::jsonb,
  p_keywords text[] DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_id uuid;
  v_type text;
BEGIN
  SELECT id, page_type INTO v_target_id, v_type
  FROM public.seo_target_queries
  WHERE query = p_query
  LIMIT 1;
  IF v_target_id IS NULL THEN
    RAISE NOTICE 'seo_seed_target_page: no target for %', p_query;
    RETURN;
  END IF;

  INSERT INTO public.seo_content (
    target_query_id, page_type, slug, title, meta_description, summary, body_md, faq, keywords,
    status, model, published_at, updated_at
  ) VALUES (
    v_target_id, v_type, p_slug, p_title, p_meta, p_summary, p_body_md, p_faq, p_keywords,
    'published', 'seed-v1', now(), now()
  )
  ON CONFLICT (page_type, slug) DO UPDATE SET
    target_query_id = EXCLUDED.target_query_id,
    title = EXCLUDED.title,
    meta_description = EXCLUDED.meta_description,
    summary = EXCLUDED.summary,
    body_md = EXCLUDED.body_md,
    faq = EXCLUDED.faq,
    keywords = EXCLUDED.keywords,
    status = 'published',
    model = EXCLUDED.model,
    published_at = coalesce(public.seo_content.published_at, now()),
    updated_at = now();
END;
$$;

SELECT public.seo_seed_target_page(
  'how to find people to go to concerts with',
  'how-to-find-people-to-go-to-concerts-with',
  'How to Find People to Go to Concerts With',
  'Find concert buddies before show night: mark the show, see who else is going, and message on Synth. Works best in Washington, DC.',
  'The fastest way to find people to go to concerts with is to pick a show, say you are going, and connect with others who marked the same event. Synth shows upcoming concerts near you and who else is interested or going.',
  E'## Start with a show you would actually attend\n\nPick one concert you are excited about—not a random Tuesday open mic unless that is your thing. When you have a specific date, venue, and artist, it is much easier to start a conversation than with a vague "anyone like live music?" post.\n\n## See who else is going\n\nOn Synth, open the event and mark **interested** or **going**. You will see other members who did the same. That list is your shortlist of potential concert buddies: you already share at least one artist and one night out.\n\n## Message before the show\n\nSend a simple note: which show, where you are thinking of meeting (venue doors, nearby bar), and whether you already have a ticket. Keep plans in the app until you have met in person.\n\n## Use your taste, not just the calendar\n\nConnect Spotify or Apple Music on Synth so recommendations and matches skew toward people who listen like you do—not only people who happen to live nearby.\n\n## If you are in DC\n\nSynth''s deepest listings are in Washington, DC right now. Browse what is on this week:\n\n{{events window=weekend limit=6}}\n\n## After the show\n\nLeave a short review on Synth. It helps the next person deciding whether to go alone, and it keeps your show history useful for future plans.',
  '[{"q":"Do I need to know someone first?","a":"No. Most people on Synth start as strangers who picked the same show. You only need a shared event to break the ice."},{"q":"What if nobody has marked the show yet?","a":"Be the first. Early markers show up to others browsing the event, especially for smaller rooms and weeknight shows."},{"q":"Is Synth only for dating?","a":"No. Synth is for anyone who wants company at live music—friends, concert buddies, or meeting new people with similar taste."}]'::jsonb,
  ARRAY['concert buddy', 'find people for concerts', 'going to concerts alone', 'concert app']
);

SELECT public.seo_seed_target_page(
  'going to a concert alone in DC',
  'going-to-a-concert-alone-in-dc',
  'Going to a Concert Alone in DC',
  'Going solo to a DC show is normal. Here is how to plan the night, pick the right venue, and meet people before doors.',
  'Going to a concert alone in DC is common. Pick a show with easy transit, arrive when doors open, and use Synth to see who else is going to the same event before you leave home.',
  E'## Going alone is normal in DC\n\nBetween 9:30 Club, The Anthem, smaller rooms on U Street, and free outdoor series, a lot of people arrive solo. Venues expect it. You are not the only one without a plus-one.\n\n## Choose a venue that feels comfortable\n\nFor a first solo night, favor seated rooms or clear sightlines (The Hamilton, Sixth & I for some shows, or a club where the bar is easy to reach). Save mosh-pit weekends for when you already know the room.\n\n## Line up company before you go\n\nOpen the show on Synth and mark **going**. Check who else marked it and send a message—"solo but would love to meet at doors" is enough. You can still go alone if nobody replies; you just gave yourself options.\n\n## Shows this weekend in DC\n\n{{events window=weekend limit=6}}\n\n## Safety basics\n\nMeet in public inside the venue, keep your phone charged, and share your plans with a friend off-app. Synth is for planning; trust your instincts in the room.',
  '[{"q":"Is it weird to go alone?","a":"No. Especially in DC, staff and regulars see solo concertgoers every night."},{"q":"When should I arrive?","a":"Doors are a good time to scope the room and grab a spot before the opener."}]'::jsonb,
  ARRAY['concert alone dc', 'solo concert dc', 'washington dc live music']
);

SELECT public.seo_seed_target_page(
  'how to make friends through live music in DC',
  'make-friends-through-live-music-in-dc',
  'How to Make Friends Through Live Music in DC',
  'Repeat shows, shared taste, and small venues make DC one of the easier cities to turn concerts into friendships.',
  'Make friends through live music in DC by going regularly to the same venues and genres, saying yes to weeknight shows, and connecting with people on Synth who mark the same events.',
  E'## Show up more than once\n\nFriendships stick when you have a **second** show to plan. Pick one venue or genre for a month—jazz at Blues Alley, indie at DC9, go-go when it pops up—and become a familiar face.\n\n## Use the calendar as an excuse to reach out\n\nWhen a friend-adjacent match on Synth marks a show, message: "I am going—want to split an Uber from the Red Line?" Low pressure, clear plan.\n\n## Smaller rooms beat festivals for new friends\n\n100–800 cap clubs make it easier to talk before and after the set than a field in July. DC has plenty in that range.\n\n{{venues limit=8}}\n\n## After the show matters\n\nStay for one song at the bar, swap Instagram, or plan the next show in-thread on Synth. The friendship usually solidifies on the **second** concert.',
  '[{"q":"What if I am new to DC?","a":"Start with a genre you already know, then expand. Synth listings plus reviews from members help you pick rooms with a welcoming crowd."}]'::jsonb,
  ARRAY['make friends dc', 'live music community dc']
);

SELECT public.seo_seed_target_page(
  'concert buddy app',
  'concert-buddy-app',
  'Concert Buddy Apps: What to Use in 2026',
  'Compare concert discovery apps with a social layer so you can find a concert buddy, not just a ticket link.',
  'A concert buddy app helps you find people going to the same show—not just alerts for new tour dates. Synth focuses on who is going; discovery apps focus on what is on sale.',
  E'## What a concert buddy app should do\n\nYou need **discovery** (what is playing near you) and **social proof** (who else cares). Alerts alone do not solve "who will I go with?"\n\n## How Synth fits\n\nSynth combines JamBase-powered listings with member interest: see who is **interested** or **going**, message before the show, and keep a history of shows you attended.\n\n## Pair with discovery tools\n\nMany people use a discovery app for alerts and Synth for the people layer. That is normal.\n\n## Try it on a real show\n\n{{events window=month limit=6}}',
  '[{"q":"Is Synth free?","a":"Synth is free to join on the web and iPhone. Ticket prices come from venues and sellers linked on each event."}]'::jsonb,
  ARRAY['concert buddy app', 'concert companion app']
);

SELECT public.seo_seed_target_page(
  'best apps to find concerts and people to go with',
  'best-apps-concerts-and-people',
  'Best Apps to Find Concerts and People to Go With',
  'The best setup pairs concert listings with a social layer. Here is how Synth handles the people part in DC.',
  'Use a concert listing app for dates and tickets, and a social app like Synth to see who else is going to the same show. In DC, Synth has the strongest people-going layer.',
  E'## Split the job\n\n**Discovery** answers "what is on?" **Social** answers "who is going with me?" Different products optimize for different halves.\n\n## Synth for the social half\n\nMark shows, browse who else marked them, message, and review afterward. Taste from Spotify or Apple Music helps recommendations.\n\n## Upcoming shows to try\n\n{{events window=month limit=6}}',
  '[]'::jsonb,
  ARRAY['apps to find concerts', 'concert social app']
);

SELECT public.seo_seed_target_page(
  'new to DC: how to get into the local music scene',
  'new-to-dc-local-music-scene',
  'New to DC? How to Get Into the Local Music Scene',
  'A practical first month in DC live music: venues to learn, genres that define the city, and how to find people to go with.',
  'New to DC? Start with one venue corridor (U Street or Navy Yard), one genre you already like, and two shows per month. Use Synth to see who else is going.',
  E'## Month one: pick a corridor\n\nU Street / 14th, H Street NE, and The Wharf cover a lot of genres without driving everywhere. Go twice to the same room so staff and regulars start to look familiar.\n\n## Month two: add a DC-specific genre\n\nGo-go, jazz, and punk/hardcore all have strong DC roots. Even one show outside your usual taste expands your network.\n\n## Find people, not just listings\n\n{{events window=month limit=6}}\n\n{{venues limit=6}}',
  '[]'::jsonb,
  ARRAY['dc music scene', 'new to dc concerts']
);

SELECT public.seo_seed_target_page(
  'best small concert venues in DC',
  'best-small-concert-venues-in-dc',
  'Best Small Concert Venues in DC',
  'Small rooms in DC where it is easy to talk before the show and actually see the band.',
  'The best small concert venues in DC include 9:30 Club (800-cap feel), DC9, Songbyrd, and Pearl Street Warehouse—rooms where you can hear and meet people.',
  E'## Why small rooms matter\n\nSub-1,000 capacity venues make solo nights easier: shorter bar lines, clearer sightlines, and more chance to recognize the same faces show after show.\n\n## Venues to bookmark\n\n{{venues limit=10}}\n\n## Pick a show and see who is going\n\n{{events window=month limit=6}}',
  '[]'::jsonb,
  ARRAY['small venues dc', 'best venues dc']
);

SELECT public.seo_seed_target_page(
  'best DC concert venues for your first show',
  'best-dc-venues-first-concert',
  'Best DC Concert Venues for Your First Show',
  'First time at a DC show? Start with these rooms for easy entry, transit, and a forgiving crowd.',
  'For your first concert in DC, pick a venue with clear security, good transit, and an early door time—then see who else on Synth is going.',
  E'## First-show checklist\n\nChoose **all-ages or 21+** intentionally, check bag policy online, and plan arrival for doors—not last minute.\n\n## Friendly first rooms\n\nLarger clubs with assigned seating options or balconies can feel less overwhelming than a packed black-box floor.\n\n{{venues limit=8}}\n\n## This weekend\n\n{{events window=weekend limit=6}}',
  '[]'::jsonb,
  ARRAY['first concert dc', 'dc venues beginner']
);

SELECT public.seo_seed_target_page(
  'date night concert ideas in DC',
  'date-night-concert-ideas-dc',
  'Date Night Concert Ideas in DC',
  'Concert date nights in DC: seated rooms, dinner nearby, and shows that still feel special.',
  'For a concert date in DC, pick a seated room or early show, dinner within walking distance, and a genre you both already like—then grab tickets together.',
  E'## Match energy to the relationship stage\n\nFirst date: seated jazz or singer-songwriter, end by 10 p.m. Established couple: louder room or festival side stage.\n\n## Logistics beat surprise\n\nBook dinner **after** you confirm door time. Build in 20 minutes to find each other inside—venues get loud.\n\n## Shows worth considering\n\n{{events window=month limit=6}}',
  '[]'::jsonb,
  ARRAY['concert date night dc', 'dc date ideas']
);

SELECT public.seo_seed_target_page(
  'where to see live jazz in DC',
  'live-jazz-in-dc',
  'Where to See Live Jazz in DC',
  'Jazz nights across DC: clubs, late sets, and how to find who else is going.',
  'Live jazz in DC spans Blues Alley, Kennedy Center programming, restaurant late sets, and festival weeks. Check Synth for who is marking the same show.',
  E'## Clubs vs. restaurant sets\n\nDedicated clubs hold the line-up history; restaurant gigs are great for conversation but check start times—they shift.\n\n## Find a show\n\n{{events genre=jazz window=month limit=8}}\n\n## Go with someone who knows the room\n\nMark the show on Synth and message another member who has reviewed the venue before.',
  '[]'::jsonb,
  ARRAY['jazz dc', 'live jazz washington dc']
);

SELECT public.seo_seed_target_page(
  'DC go-go music guide',
  'dc-go-go-music-guide',
  'DC Go-Go Music: A Quick Guide',
  'What go-go is, where it shows up in DC, and how to catch a live set.',
  'Go-go is DC''s homegrown funk-derived sound—live percussion, call-and-response, long sets. Find upcoming shows on Synth and see who else is going.',
  E'## What to expect\n\nSets run long, crowds dance, and the beat rarely stops between songs. Hydrate and protect your ears.\n\n## Finding listings\n\nGo-go listings move fast. When you see a show, mark it on Synth so others can find you—and you can find them.\n\n{{events window=month limit=6}}',
  '[]'::jsonb,
  ARRAY['go-go dc', 'dc go-go concerts']
);

SELECT public.seo_seed_target_page(
  'free and cheap concerts in DC',
  'free-and-cheap-concerts-in-dc',
  'Free and Cheap Concerts in DC',
  'Free outdoor series, happy-hour shows, and low-cover rooms in Washington, DC.',
  'Free and cheap concerts in DC include summer outdoor series, museum programs, and weeknight shows under $20—browse upcoming listings and mark what you want on Synth.',
  E'## Free does not mean no plan\n\nRSVP when required, arrive early for shade or grass, and bring water. Free series fill up.\n\n## Cheap weeknights\n\nLocal openers and album-release shows often run $15–25 if you buy before door price.\n\n{{events window=month limit=8}}',
  '[]'::jsonb,
  ARRAY['free concerts dc', 'cheap shows dc']
);

SELECT public.seo_seed_target_page(
  'what is the Synth app',
  'what-is-synth',
  'What Is the Synth App?',
  'Synth is a social app for live music: discover shows, see who is going, message concert buddies, and review nights out.',
  'Synth is an app for people who go to concerts and want company at the same shows. It lists events (powered by JamBase), shows who is interested or going, and lets members message and review shows.',
  E'## What Synth is\n\nSynth helps you **discover** concerts near you and **find people** going to the same ones—so you do not have to show up alone unless you want to.\n\n## What you can do\n\n- Browse upcoming shows in cities Synth covers (deepest in Washington, DC)\n- Mark **interested** or **going**\n- See other members on the same event\n- Message to make plans\n- Connect Spotify or Apple Music for taste-based matching\n- Review artists, venues, and shows you attended\n\n## Where to use it\n\nWeb at [join.getsynth.app](https://join.getsynth.app) and iPhone on the App Store.\n\n## What Synth is not\n\nSynth is not a ticket seller. Ticket links go to official sellers; Synth adds the social layer on top.',
  '[{"q":"Who is Synth for?","a":"Anyone who loves live music and wants friends or concert buddies who go to the same shows."},{"q":"Where does event data come from?","a":"Show listings are powered by JamBase."}]'::jsonb,
  ARRAY['what is synth', 'synth app', 'synth concert app']
);

SELECT public.seo_seed_target_page(
  'how Synth works for concertgoers',
  'how-synth-works',
  'How Synth Works for Concertgoers',
  'From discovery to post-show review: how Synth fits into one night out.',
  'Pick a show, mark going, see who else is on the event, message to meet, attend, then review— that is the Synth loop for concertgoers.',
  E'## 1. Discover\n\nBrowse concerts near you or search artists and venues.\n\n## 2. Mark the show\n\n**Interested** saves it; **going** signals you plan to be there.\n\n## 3. Connect\n\nSee other members on the same event and message with a concrete plan (doors, ticket, meet-up spot).\n\n## 4. Show up\n\nMeet in a public area inside the venue first.\n\n## 5. Review\n\nShort reviews help the community and your future recommendations.\n\n## See it on a real event\n\n{{events window=weekend limit=4}}',
  '[]'::jsonb,
  ARRAY['how synth works', 'synth concertgoers']
);

SELECT public.seo_seed_target_page(
  'is it safe to meet people from a concert app',
  'is-synth-safe-to-meet-people',
  'Is It Safe to Meet People From a Concert App?',
  'Practical safety tips for meeting concert buddies from Synth—or any app—before and during the show.',
  'Treat concert app meet-ups like any first meeting: public place, tell a friend your plan, trust your instincts, and stay inside the venue until you are comfortable.',
  E'## Meet inside the venue\n\nDoors, bar, or merch table—not a residential address or parked car.\n\n## Tell someone off-app\n\nShare artist, venue, time, and who you are meeting.\n\n## Use in-app messaging first\n\nKeep plans in Synth until you have met in person.\n\n## You can leave\n\nIf something feels off, you can watch the show solo. No obligation to stay with a match.\n\n## Report concerns\n\nUse in-app reporting so the team can act on violations of community rules.',
  '[{"q":"Does Synth verify users?","a":"Synth uses standard account signup. Use the same caution you would with any social product."}]'::jsonb,
  ARRAY['concert app safety', 'meeting people from apps']
);

SELECT public.seo_seed_target_page(
  'Synth vs Bandsintown',
  'synth-vs-bandsintown',
  'Synth vs Bandsintown',
  'Bandsintown is built for artist alerts and tickets; Synth is built for who is going with you. Many fans use both.',
  'Bandsintown excels at tour alerts and ticket links. Synth excels at seeing who else is going to a show and messaging them. They solve different problems.',
  E'## Bandsintown\n\nStrength: follow artists, get notified, click out to tickets.\n\n## Synth\n\nStrength: mark a show, see members interested or going, message, review nights out.\n\n## Use both\n\nFollow artists elsewhere; use Synth when you need a **person** for the same night.\n\n{{events window=month limit=4}}',
  '[]'::jsonb,
  ARRAY['synth vs bandsintown', 'bandsintown alternative social']
);

SELECT public.seo_seed_target_page(
  'Synth vs Songkick',
  'synth-vs-songkick',
  'Synth vs Songkick',
  'Songkick focuses on tracking artists; Synth focuses on concert buddies at specific shows.',
  'Songkick helps you track artists and concerts. Synth helps you find people going to the same concert and plan together.',
  E'## Songkick\n\nStrength: artist tracking and concert calendars.\n\n## Synth\n\nStrength: social layer on each event—who is going, messaging, reviews.\n\n## When to open Synth\n\nOnce you have a ticket or a target show, mark it and find company.\n\n{{events window=month limit=4}}',
  '[]'::jsonb,
  ARRAY['synth vs songkick']
);

DROP FUNCTION public.seo_seed_target_page(text, text, text, text, text, text, jsonb, text[]);
