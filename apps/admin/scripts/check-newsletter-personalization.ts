import { newsletters } from "../src/data/newsletters";
import {
  findRecipientFacingLeaks,
  getMockPersonalizationContext,
  inferDerivedState,
  resolveNewsletterForContext,
  validateNewsletterPersonalization,
} from "../src/lib/newsletterPersonalization";
import { renderNewsletterHtml } from "../src/lib/newsletterRenderer";

const issue = newsletters.find((item) => item.slug === "august-5-2026") ?? newsletters[0];

const hasSectionContent = (section: any) =>
  Boolean(
    section.label ||
      section.eyebrowText ||
      section.headline ||
      section.body ||
      section.imageUrl ||
      section.ctaLabel ||
      section.ctaUrl ||
      (section.cards && section.cards.length > 0) ||
      (section.listItems && section.listItems.length > 0)
  );

const presets = [
  "active-user",
  "inactive-with-history",
  "spotify-connected-user",
  "apple-connected-user",
  "interest-signal-user",
  "brand-new-user",
  "missing-location-user",
] as const;

const stateChecks = presets.map((preset) => {
  const context = getMockPersonalizationContext(preset);
  const resolved = resolveNewsletterForContext(issue, context, "resolved");
  const html = renderNewsletterHtml(resolved.newsletter, {
    mode: "email",
    absoluteBaseUrl: "https://getsynth.app",
  });

  return {
    preset,
    derivedState: resolved.state,
    renderedSections: resolved.newsletter.sections.filter((section) => !section.hidden).length,
    hasEmptyRenderedSection: resolved.newsletter.sections.some(
      (section) => !section.hidden && !hasSectionContent(section)
    ),
    hasScriptTag: /<script/i.test(html),
    hasLocalhost: /localhost|127\.0\.0\.1/i.test(html),
    hasAdminExplanationLeak: /Rendered because|Used fallback/i.test(html),
  };
});

const templateHtml = renderNewsletterHtml(
  resolveNewsletterForContext(
    issue,
    getMockPersonalizationContext("active-user"),
    "template"
  ).newsletter,
  {
    mode: "email",
    absoluteBaseUrl: "https://getsynth.app",
  }
);

const overlapScenarios = [
  {
    name: "active-with-spotify",
    context: {
      ...getMockPersonalizationContext("active-user"),
      musicConnections: {
        ...getMockPersonalizationContext("spotify-connected-user").musicConnections,
        followedArtists: [],
        followedVenues: [],
      },
    },
  },
  {
    name: "active-no-location",
    context: {
      ...getMockPersonalizationContext("active-user"),
      user: { ...getMockPersonalizationContext("active-user").user, city: undefined, location: undefined },
      recommendations: { ...getMockPersonalizationContext("active-user").recommendations, nearbyShows: [] },
    },
  },
  {
    name: "inactive-interest-and-spotify",
    context: {
      ...getMockPersonalizationContext("inactive-with-history"),
      musicConnections: {
        ...getMockPersonalizationContext("spotify-connected-user").musicConnections,
        followedArtists: [{ name: "Example Interest Artist" }],
        followedVenues: [{ name: "Example Venue", city: "Washington", state: "DC" }],
      },
    },
  },
  {
    name: "new-with-location",
    context: {
      ...getMockPersonalizationContext("brand-new-user"),
      user: { ...getMockPersonalizationContext("brand-new-user").user, city: "Washington" },
      recommendations: {
        ...getMockPersonalizationContext("brand-new-user").recommendations,
        nearbyShows: [getMockPersonalizationContext("active-user").recommendations.nearbyShows[0]],
      },
    },
  },
  {
    name: "missing-location-with-listening",
    context: {
      ...getMockPersonalizationContext("missing-location-user"),
      musicConnections: {
        ...getMockPersonalizationContext("spotify-connected-user").musicConnections,
      },
    },
  },
];

const overlapChecks = overlapScenarios.map((scenario) => {
  const resolved = resolveNewsletterForContext(issue, scenario.context as any, "resolved");
  return {
    name: scenario.name,
    inferredState: resolved.state,
    renderedModules: resolved.moduleExplanations
      .filter((entry) => entry.rendered)
      .map((entry) => entry.sectionType),
    fallbackCount: resolved.moduleExplanations.filter((entry) =>
      /fallback/i.test(entry.reason)
    ).length,
  };
});

const zeroDataContext = {
  ...getMockPersonalizationContext("brand-new-user"),
  user: {
    ...getMockPersonalizationContext("brand-new-user").user,
    city: undefined,
    location: undefined,
  },
  recommendations: {
    ...getMockPersonalizationContext("brand-new-user").recommendations,
    nearbyShows: [],
    relevantArtists: [],
    relevantVenues: [],
  },
  musicConnections: {
    ...getMockPersonalizationContext("brand-new-user").musicConnections,
    topArtists: [],
    genres: [],
    followedArtists: [],
    followedVenues: [],
  },
};

const zeroDataResolved = resolveNewsletterForContext(issue, zeroDataContext as any, "resolved");
const zeroDataRenderedTypes = zeroDataResolved.newsletter.sections
  .filter((section) => !section.hidden)
  .map((section) => section.type);
const expectedZeroDataTypes = [
  "hero",
  "yourSynth",
  "yourMusic",
  "aroundYou",
  "communitySpotlight",
  "quickStories",
  "discoverTip",
  "productUpdate",
  "cta",
  "footer",
];
const zeroDataMissingTypes = expectedZeroDataTypes.filter(
  (sectionType) => !zeroDataRenderedTypes.includes(sectionType as any)
);
if (zeroDataMissingTypes.length > 0) {
  throw new Error(`Zero-data output is missing required modules: ${zeroDataMissingTypes.join(", ")}`);
}

const lowConfidenceInterestContext = {
  ...getMockPersonalizationContext("brand-new-user"),
  musicConnections: {
    ...getMockPersonalizationContext("brand-new-user").musicConnections,
    followedArtists: [{ name: "Single weak signal", score: 1 }],
    followedVenues: [{ name: "Single weak venue", city: "Washington", state: "DC" }],
  },
};
const lowConfidenceResolved = resolveNewsletterForContext(
  issue,
  lowConfidenceInterestContext as any,
  "resolved"
);
const lowConfidenceHtml = renderNewsletterHtml(lowConfidenceResolved.newsletter, {
  mode: "email",
  absoluteBaseUrl: "https://getsynth.app",
});
const lowConfidenceLeakPhrases = [
  "interest signals",
  "Single weak signal",
  "Single weak venue",
  "a member wrote",
  "Final CTA",
  "use this block",
];
const lowConfidenceLeak = lowConfidenceLeakPhrases.some((phrase) =>
  lowConfidenceHtml.toLowerCase().includes(phrase.toLowerCase())
);
if (lowConfidenceLeak) {
  throw new Error("Low-confidence interest signal text leaked into production output.");
}

const activeValidation = validateNewsletterPersonalization(
  issue,
  getMockPersonalizationContext("active-user")
);
if (activeValidation.errors.length > 0) {
  throw new Error(`Validation errors: ${activeValidation.errors.join("; ")}`);
}

const zeroHtml = renderNewsletterHtml(zeroDataResolved.newsletter, {
  mode: "email",
  absoluteBaseUrl: "https://getsynth.app",
});
const zeroLeaks = findRecipientFacingLeaks(zeroHtml);
if (zeroLeaks.length > 0) {
  throw new Error(`Zero-data HTML leaked phrases: ${zeroLeaks.join(", ")}`);
}
if (!/linear-gradient\(135deg,#CC2486/.test(zeroHtml)) {
  throw new Error("Zero-data HTML is missing the branded hero gradient.");
}
if (!/border-radius:999px/.test(zeroHtml)) {
  throw new Error("Zero-data HTML is missing pill CTA buttons.");
}
if (/Quick hits/i.test(zeroHtml)) {
  throw new Error("Zero-data HTML still uses Quick hits instead of This Week in Live Music.");
}

const leakFailures = stateChecks.filter(
  (check) =>
    check.hasScriptTag ||
    check.hasLocalhost ||
    check.hasAdminExplanationLeak ||
    check.hasEmptyRenderedSection
);

const draftSerialized = JSON.stringify(issue);
const localDraftLeakChecks = {
  containsRealDataFlag: draftSerialized.includes("containsRealUserData"),
  containsMockDataFlag: draftSerialized.includes("isAdminMockData"),
  containsModuleExplanationText: draftSerialized.includes("Rendered because"),
};

if (leakFailures.length > 0) {
  throw new Error(
    `Personalization leak checks failed for presets: ${leakFailures
      .map((failure) => failure.preset)
      .join(", ")}`
  );
}

if (
  localDraftLeakChecks.containsRealDataFlag ||
  localDraftLeakChecks.containsMockDataFlag ||
  localDraftLeakChecks.containsModuleExplanationText
) {
  throw new Error("Local draft serialization includes preview-only personalization metadata.");
}

console.log(
  JSON.stringify(
    {
      stateChecks,
      overlapChecks,
      zeroDataCheck: {
        derivedState: inferDerivedState(zeroDataContext as any),
        renderedTypes: zeroDataRenderedTypes,
      },
      lowConfidenceInterestLeak: lowConfidenceLeak,
      templateContainsMockName: templateHtml.includes("Alex"),
      templateContainsAdminMockLabel: templateHtml.includes("Admin mock data"),
      localDraftLeakChecks,
    },
    null,
    2
  )
);

