import { NewsletterIssue } from "@/types/newsletter";

/** Main Synth app entry. Deep links for specific in-app actions are not yet available. */
export const SYNTH_APP_URL = "https://join.getsynth.app/";
export const SYNTH_SITE_URL = "https://getsynth.app/";
export const SYNTH_INSTAGRAM_URL = "https://www.instagram.com/getsynth.app/";

export const newsletters: NewsletterIssue[] = [
  {
    id: "newsletter-001",
    slug: "august-5-2026",
    title: "The Synth Setlist - Personalized Edition",
    issueNumber: "1",
    publishDate: "2026-08-05",
    subjectLine: "Your Synth Setlist: built from your music and show history",
    preheader:
      "Your Synth activity, your listening, and the week’s live music picks in one digest.",
    description:
      "A personalized weekly Synth template with deterministic modules, safe fallbacks, and admin preview states.",
    coverImage: "/newsletter-covers/newsletter-placeholder.svg",
    isPublicSample: true,
    status: "published",
    sections: [
      {
        id: "hero-001",
        type: "hero",
        label: "Your week in live music",
        headline: "Here’s what’s worth knowing this week.",
        body: "A short guide to the shows, stories, and moments worth your attention.",
        personalization: {
          sourceLabel: "Admin-selected",
          fallbackContent: {
            label: "Your week in live music",
            headline: "Here’s what’s worth knowing this week.",
            body: "A short guide to the shows, stories, and moments worth your attention.",
          },
        },
      },
      {
        id: "your-synth-001",
        type: "yourSynth",
        label: "Your Synth",
        headline: "Your week in Synth",
        body: "You have {{upcomingShowCount}} shows coming up. Your next show is {{nextShowArtist}} at {{nextShowVenue}}. You have logged {{lifetimeConcertCount}} concerts so far.",
        ctaLabel: "View your upcoming shows",
        ctaUrl: SYNTH_APP_URL,
        ctaStyle: "button",
        backgroundStyle: "pink",
        personalization: {
          sourceLabel: "Personalized",
          minimumConfidence: "high",
          displayIfStates: ["active-user", "inactive-with-history"],
          fallbackContent: {
            label: "Your Synth",
            headline: "Still thinking about your last show?",
            body: "Add it to Synth while you remember the good parts.",
            ctaLabel: "Add your last concert",
            ctaUrl: SYNTH_APP_URL,
          },
        },
      },
      {
        id: "concert-history-001",
        type: "concertHistory",
        label: "From Your Concert History",
        headline: "A few names already on your timeline",
        body: "",
        personalization: {
          sourceLabel: "Personalized",
          minimumConfidence: "high",
          requiredDataFields: ["synthActivity.recentlyAttendedConcerts"],
          displayIfStates: ["active-user", "inactive-with-history"],
        },
      },
      {
        id: "your-music-001",
        type: "yourMusic",
        label: "Your Music",
        headline: "Based on your recent listening",
        body: "{{topArtist}} keeps showing up in your listening, with a lean toward {{topGenre}}.",
        ctaLabel: "Browse matching shows",
        ctaUrl: SYNTH_APP_URL,
        ctaStyle: "button",
        personalization: {
          sourceLabel: "Streaming-based",
          minimumConfidence: "high",
          // Connection and listening data are separate; dedicated resolver chooses connect vs insights copy.
          displayIfStates: [
            "connected-music-user",
            "active-user",
            "inactive-with-history",
            "new-or-empty-user",
            "missing-location-user",
            "interest-signal-user",
          ],
          fallbackContent: {
            label: "Your Music",
            headline: "Make your listening useful.",
            body: "Connect Spotify or Apple Music and Synth can match the artists you already listen to with shows worth seeing.",
            ctaLabel: "Connect your music",
            ctaUrl: SYNTH_APP_URL,
            listItems: [],
          },
        },
      },
      {
        id: "coming-up-001",
        type: "aroundYou",
        label: "Coming Up",
        headline: "Shows worth saving this week",
        body: "A nearby date that fits your taste is ready to save.",
        ctaLabel: "Browse shows",
        ctaUrl: SYNTH_APP_URL,
        ctaStyle: "button",
        personalization: {
          sourceLabel: "Location-based",
          minimumConfidence: "medium",
          requiredDataFields: ["recommendations.nearbyShows"],
          fallbackContent: {
            label: "Coming Up",
            headline: "Find your next night out",
            body: "Browse live dates and save one show you actually want to see.",
            ctaLabel: "Browse shows",
            ctaUrl: SYNTH_APP_URL,
          },
        },
      },
      {
        id: "community-spotlight-001",
        type: "communitySpotlight",
        label: "Community Spotlight",
        headline: "What stuck with you after the lights came up?",
        body: "When a show ends, the best part is often the detail you keep replaying. Save that moment so it stays easy to find.",
        ctaLabel: "Review a show",
        ctaUrl: SYNTH_APP_URL,
        ctaStyle: "button",
        backgroundStyle: "pink",
        personalization: {
          sourceLabel: "Evergreen fallback",
          fallbackContent: {
            label: "Community Spotlight",
            headline: "What stuck with you after the lights came up?",
            body: "When a show ends, the best part is often the detail you keep replaying. Save that moment so it stays easy to find.",
            ctaLabel: "Review a show",
            ctaUrl: SYNTH_APP_URL,
          },
        },
      },
      {
        id: "live-music-week-001",
        type: "quickStories",
        label: "This Week in Live Music",
        headline: "This Week in Live Music",
        cards: [
          {
            id: "live-story-001",
            label: "Featured story",
            title: "ScHoolboy Q is taking Blank Face LP back on tour",
            body: "The anniversary run puts classic cuts back on stage this fall, with dates now rolling out city by city.",
            ctaLabel: "See the announced dates",
            ctaUrl:
              "https://pitchfork.com/story/schoolboy-q-announces-blank-face-lp-anniversary-tour",
          },
          {
            id: "live-story-002",
            label: "Quick story",
            title: "BTS made MetLife feel weirdly personal",
            body: "Fan chants, light sticks, and shared rituals turned a stadium spectacle into something closer.",
            ctaLabel: "Read the concert recap",
            ctaUrl:
              "https://nypost.com/2026/08/04/ticket-sales/bts-metlife-stadium-concert-experience-set-list-visuals-fans/",
          },
          {
            id: "live-story-003",
            label: "Quick story",
            title: "Zac Brown Band sent Fenway home with a free cruise",
            body: "At a sold-out Fenway night, every eligible fan was offered a cruise for two.",
            ctaLabel: "See how the giveaway worked",
            ctaUrl:
              "https://people.com/zac-brown-band-gives-away-free-cruise-ship-vacations-to-every-fan-fenway-park-concert-12032597",
          },
        ],
        personalization: {
          sourceLabel: "Admin-selected",
        },
      },
      {
        id: "discover-001",
        type: "discoverTip",
        label: "Discover",
        headline: "Add the last concert you went to.",
        body: "One show is enough to start building a timeline you can actually use.",
        ctaLabel: "Add your last concert",
        ctaUrl: SYNTH_APP_URL,
        ctaStyle: "button",
        backgroundStyle: "yellow",
        personalization: {
          sourceLabel: "Evergreen fallback",
          fallbackContent: {
            label: "Discover",
            headline: "Add the last concert you went to.",
            body: "One show is enough to start building a timeline you can actually use.",
            ctaLabel: "Add your last concert",
            ctaUrl: SYNTH_APP_URL,
          },
        },
      },
      {
        id: "whats-new-001",
        type: "productUpdate",
        label: "What's New",
        headline: "Reviews are easier to finish",
        body: "Draft a review right after the show, add photos when you want, and keep every night in one place.",
        personalization: {
          sourceLabel: "Admin-selected",
        },
      },
      {
        id: "final-cta-001",
        type: "cta",
        label: "After the encore",
        headline: "Keep the show.",
        body: "Your concerts, reviews, photos, and people you met all belong somewhere.",
        ctaLabel: "Open Synth",
        ctaUrl: SYNTH_APP_URL,
        ctaStyle: "button",
        backgroundStyle: "dark",
        personalization: {
          sourceLabel: "Evergreen fallback",
          fallbackContent: {
            label: "After the encore",
            headline: "Keep the show.",
            body: "Your concerts, reviews, photos, and people you met all belong somewhere.",
            ctaLabel: "Open Synth",
            ctaUrl: SYNTH_APP_URL,
          },
        },
      },
      {
        id: "footer-001",
        type: "footer",
        headline: "Discover, Connect, Share.",
        body: "Going to shows just got easier.",
        ctaLabel: "Website",
        ctaUrl: SYNTH_SITE_URL,
        imageUrl: SYNTH_INSTAGRAM_URL,
        eyebrowText: SYNTH_APP_URL,
        label: SYNTH_APP_URL,
      },
    ],
  },
];

export const newslettersNewestFirst = [...newsletters].sort(
  (a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()
);

export const getNewsletterBySlug = (slug: string) =>
  newsletters.find((newsletter) => newsletter.slug === slug);
