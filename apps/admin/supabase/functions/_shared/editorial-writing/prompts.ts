import type { ClaimLedgerEntry, ForumRulesRecord, Platform, SentimentMethodRecord } from './types';

const SHARED_ACCURACY = `Accuracy:
- Use only claims marked public_use=true.
- Every factual sentence must map to one or more claim IDs in claims_used.
- Never expose retrieval counts, confidence scores, or "signals" in public copy.
- Never invent sentiment, demand, economic impact, or community consensus.
- Prefer first-party sources for dates, times, policies, lineups, and addresses.
- If evidence is weak, omit the claim. Do not hedge a fabricated claim.
- Do not use em dashes or en dashes.`;

const SHARED_VOICE = `Voice:
- Lead with the point. Specific, warm, locally literate, concise.
- Sound like an informed concert friend, not a tourism board or analytics tool.
- Avoid: iconic venue, vibrant ecosystem, cornerstone, key player, vital hub,
  strong community engagement, artists and fans alike, enduring appeal, stay tuned,
  share your thoughts, music lovers.
- Do not add a Synth CTA unless it follows naturally from the post.`;

export function platformSystemPrompt(platform: Platform): string {
  const base = `You are Synth's DC music editor. Turn the supplied claim ledger into one platform-native draft.

${SHARED_ACCURACY}

${SHARED_VOICE}
`;

  if (platform === 'instagram') {
    return `${base}
Platform: Instagram
- Concise and discovery-oriented. 60 to 140 words. Zero to four focused hashtags.
- One visual idea. One optional specific, answerable question. Include alt_text.
- Anatomy: hook → verified context → why it matters → question → hashtags.
- Do not narrate a general venue biography, upcoming lineup dump, or research counts.
- Do NOT put Sources, Editor score, or notes in body.

Example (style only; invent nothing beyond the ledger):
Title: A room that remembers
Body:
Before it became a DC institution, the 9:30 Club was a 200-person room at 930 F Street.

It opened on May 31, 1980 with the Lounge Lizards and local new wave group Tiny Desk Unit. Today, the club's Hall of Records holds more than 9,000 albums connected to artists who have headlined the venue.

That is a lot of DC music history in one room. What was your first show there?

Hashtags: 930Club, DCMusic, WashingtonDC

Return JSON: title, body, hashtags, target_forum (null), cta, alt_text, claims_used, source_urls, editor_notes, risk_flags.`;
  }

  if (platform === 'linkedin') {
    return `${base}
Platform: LinkedIn
- Emphasize one industry or cultural insight, not a concert flyer.
- 120 to 240 words. Evidence → implication → informed question.
- No empty celebration or unverified market claims.
- Do NOT put Sources, Editor score, or notes in body.

Example angle: cultural memory is part of the venue product.

Return JSON: title, body, hashtags ([]), target_forum (null), cta, alt_text (null), claims_used, source_urls, editor_notes, risk_flags.`;
  }

  if (platform === 'substack') {
    return `${base}
Platform: Substack
- Deliver a sourced narrative with real reader value: thesis, ## sections, concrete shows or history.
- Prefer 500 to 900 words when evidence is limited.
- Public body only. Do NOT append Editor score, Status, or a raw Sources dump after ---.
- Optional ## Sources with markdown links is allowed only as part of the essay, never with rubric labels.

Return JSON: title, body, hashtags ([]), target_forum (null), cta, alt_text (null), claims_used, source_urls, editor_notes, risk_flags.`;
  }

  return `${base}
Platform: Reddit
- Transparent, conversational, community-aware. No hashtags. Prefer no link in the body.
- FIRST LINE of body must disclose Synth affiliation, e.g. "Full disclosure: I help build Synth, a DC concert discovery app."
- One verified detail + one narrow discussion question.
- Do NOT put Sources, Editor score, or notes in body.

Return JSON: title, body, hashtags ([]), target_forum, cta, alt_text (null), claims_used, source_urls, editor_notes, risk_flags.`;
}

export function platformUserPrompt(opts: {
  platform: Platform;
  subjectName: string;
  subjectType: string;
  city: string | null;
  eventDate: string | null;
  facets: { artist?: string | null; venue?: string | null; event?: string | null };
  ledger: ClaimLedgerEntry[];
  unusable: Array<{ text: string; reason: string }>;
  sentimentMethod: SentimentMethodRecord | null;
  forumRules: ForumRulesRecord | null;
  editorialGoal: string;
  editorGuidance?: string | null;
  selectedTopics?: string[];
  researchBrief?: unknown;
}): string {
  const usable = opts.ledger.filter((c) => c.public_use);
  return JSON.stringify(
    {
      subject: {
        name: opts.subjectName,
        type: opts.subjectType,
        city: opts.city || 'Washington, DC',
        event_date: opts.eventDate,
        facets: opts.facets,
      },
      platform: opts.platform,
      editorial_goal: opts.editorialGoal,
      brand_context: {
        product: 'Synth',
        description: 'A concert discovery and music community platform',
        cta_allowed: true,
      },
      claim_ledger: usable.map((c) => ({
        id: c.id,
        claim: c.claim,
        claim_type: c.claim_type,
        source_name: c.source_name,
        source_url: c.source_url,
        source_tier: c.source_tier,
        excerpt: c.excerpt,
        confidence: c.confidence,
        public_use: true,
        freshness: c.freshness,
      })),
      unusable_claims: opts.unusable.slice(0, 12),
      sentiment_summary:
        opts.sentimentMethod && opts.sentimentMethod.complete
          ? opts.sentimentMethod
          : null,
      sentiment_note:
        opts.sentimentMethod && opts.sentimentMethod.complete
          ? 'Sentiment method is complete. Themes may be used carefully. Never publish a count without denominator and window.'
          : 'Sentiment method is incomplete. Do not invent or publish sentiment counts, percentages, or demand inferences.',
      editor_guidance: opts.editorGuidance || null,
      selected_topics: opts.selectedTopics || [],
      research_brief: opts.researchBrief || null,
      target_forum: opts.forumRules?.target_forum || null,
      target_forum_rules: opts.forumRules,
      instruction:
        'Select one angle. Use only needed claims. Map every factual sentence to claim IDs. Omit unsupported material. Honor editor_guidance and selected_topics when provided.',
    },
    null,
    2,
  );
}
