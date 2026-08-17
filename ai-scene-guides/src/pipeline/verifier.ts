import type {
  GeneratedGuideMessage,
  GroundedFact,
  VerifierCheckResult,
  VerifierResult,
} from '../types.js';

const LIVED = [
  /\bi was (there|front row|in the pit)\b/i,
  /\bi got tickets\b/i,
  /\bmy friend (said|told|on the tour)\b/i,
  /\bjust bought my ticket\b/i,
  /\bas a \d+-year-old\b/i,
  /\bi'?m (going|attending|headed)\b/i,
];

const MARKETING = /\b(iconic|epic|game-changing|must-see|you won'?t want to miss)\b/i;

const INJECTION = [
  /ignore (all |any )?prior instructions/i,
  /reveal (the )?system prompt/i,
  /you are now/i,
];

const SAFETY = [
  /\b(kill yourself|kys)\b/i,
  /\b(nazi|white power)\b/i,
  /\b(child porn|csam)\b/i,
];

function ngrams(text: string, n: number): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i <= words.length - n; i++) {
    out.push(words.slice(i, i + n).join(' '));
  }
  return out;
}

export function verifyMessage(options: {
  message: GeneratedGuideMessage;
  facts: GroundedFact[];
  priorTexts?: string[];
  setlistGenerationEnabled?: boolean;
  now?: Date;
}): VerifierResult {
  const {
    message,
    facts,
    priorTexts = [],
    setlistGenerationEnabled = false,
    now = new Date(),
  } = options;
  const checks: VerifierCheckResult[] = [];
  const byId = new Map(facts.map((f) => [f.id, f]));

  if (message.authorType !== 'ai_scene_guide') {
    checks.push({
      ok: false,
      code: 'disclosure',
      detail: 'Missing author_type ai_scene_guide',
      severity: 'high_risk',
    });
  } else {
    checks.push({ ok: true, code: 'disclosure', detail: 'author_type set', severity: 'style' });
  }

  if (message.citedFactIds.length === 0) {
    checks.push({
      ok: false,
      code: 'citations',
      detail: 'No cited facts',
      severity: 'high_risk',
    });
  } else {
    const missing = message.citedFactIds.filter((id) => !byId.has(id));
    checks.push({
      ok: missing.length === 0,
      code: 'citations',
      detail: missing.length ? `Unknown fact ids: ${missing.join(',')}` : 'All citations resolve',
      severity: 'high_risk',
    });
  }

  for (const id of message.citedFactIds) {
    const f = byId.get(id);
    if (!f) continue;
    if (Date.parse(f.expiresAt) < now.getTime()) {
      checks.push({
        ok: false,
        code: 'freshness',
        detail: `Fact ${id} expired`,
        severity: 'high_risk',
      });
    }
  }
  if (!checks.some((c) => c.code === 'freshness')) {
    checks.push({ ok: true, code: 'freshness', detail: 'Cited facts fresh', severity: 'style' });
  }

  const livedHit = LIVED.some((re) => re.test(message.text));
  checks.push({
    ok: !livedHit,
    code: 'lived_experience',
    detail: livedHit ? 'Firsthand/identity claim detected' : 'No lived-experience phrases',
    severity: 'high_risk',
  });

  const marketingHit = MARKETING.test(message.text);
  checks.push({
    ok: !marketingHit,
    code: 'voice',
    detail: marketingHit ? 'Prohibited marketing language' : 'Voice OK',
    severity: 'style',
  });

  const injectHit = INJECTION.some((re) => re.test(message.text));
  checks.push({
    ok: !injectHit,
    code: 'prompt_injection',
    detail: injectHit ? 'Injection-following language in output' : 'No injection leakage',
    severity: 'high_risk',
  });

  const safetyHit = SAFETY.some((re) => re.test(message.text));
  checks.push({
    ok: !safetyHit,
    code: 'safety',
    detail: safetyHit ? 'Safety category hit' : 'Safety OK',
    severity: 'high_risk',
  });

  if (message.containsSetlistSpoiler) {
    const hasSetlistFact = message.citedFactIds.some((id) => byId.get(id)?.kind === 'setlist');
    const liveSetlistBlocked =
      !setlistGenerationEnabled &&
      message.citedFactIds.some((id) => {
        const f = byId.get(id);
        return f?.kind === 'setlist' && f.dataSegment === 'live';
      });
    checks.push({
      ok: hasSetlistFact && !liveSetlistBlocked,
      code: 'spoiler',
      detail: !hasSetlistFact
        ? 'Spoiler without setlist fact'
        : liveSetlistBlocked
          ? 'Live setlist claims disabled for JamBase contract'
          : 'Spoiler flagged with setlist fact',
      severity: 'high_risk',
    });
  } else {
    checks.push({ ok: true, code: 'spoiler', detail: 'No setlist spoiler', severity: 'style' });
  }

  const onlyTopic =
    message.citedFactIds.length > 0 &&
    message.citedFactIds.every((id) => byId.get(id)?.kind === 'topic_signal');
  if (onlyTopic && /\b(confirmed|cancelled|surprise guest|doors at)\b/i.test(message.text)) {
    checks.push({
      ok: false,
      code: 'factual_support',
      detail: 'Hard claim supported only by topic_signal',
      severity: 'high_risk',
    });
  } else {
    checks.push({
      ok: true,
      code: 'factual_support',
      detail: 'Claims map to cited facts',
      severity: 'style',
    });
  }

  const grams = new Set(ngrams(message.text, 8));
  let dup = false;
  for (const prior of priorTexts) {
    for (const g of ngrams(prior, 8)) {
      if (grams.has(g)) {
        dup = true;
        break;
      }
    }
    if (dup) break;
  }
  checks.push({
    ok: !dup,
    code: 'duplication',
    detail: dup ? 'Near-duplicate 8-gram overlap' : 'No long n-gram duplicate',
    severity: 'style',
  });

  const usernameLeak = /u\/[A-Za-z0-9_-]+/.test(message.text);
  checks.push({
    ok: !usernameLeak,
    code: 'reddit_privacy',
    detail: usernameLeak ? 'Reddit username leaked' : 'No username',
    severity: 'high_risk',
  });

  const vague =
    /\b(this act|this bill|this listing|the listing|the venue page)\b/i.test(message.text);
  checks.push({
    ok: !vague,
    code: 'referent',
    detail: vague ? 'Vague referent without named artist/venue' : 'Named referent OK',
    severity: 'high_risk',
  });

  const highRiskFail = checks.some((c) => !c.ok && c.severity === 'high_risk');
  const styleFail = checks.some((c) => !c.ok && c.severity === 'style');
  return {
    passed: !highRiskFail && !styleFail,
    checks,
    allowRegen: !highRiskFail && styleFail,
  };
}

export function verifyConversation(options: {
  messages: GeneratedGuideMessage[];
  facts: GroundedFact[];
  setlistGenerationEnabled?: boolean;
  now?: Date;
}): VerifierResult[] {
  const prior: string[] = [];
  const results: VerifierResult[] = [];
  for (const message of options.messages) {
    const r = verifyMessage({
      message,
      facts: options.facts,
      priorTexts: prior,
      setlistGenerationEnabled: options.setlistGenerationEnabled,
      now: options.now,
    });
    results.push(r);
    prior.push(message.text);
  }
  return results;
}
