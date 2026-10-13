/**
 * Traffic source classification for first-party visitor tracking (/api/share?collect=1).
 * No imports: node:test loads this file directly.
 */

export type SourceCategory =
  | 'ai_assistant'
  | 'organic_search'
  | 'social'
  | 'email'
  | 'paid'
  | 'referral'
  | 'internal'
  | 'direct';

export interface SourceInput {
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
}

export interface Source {
  category: SourceCategory;
  name: string | null;
  referrerHost: string | null;
  referrerPath: string | null;
}

// Host suffix -> name. Checked as "host === suffix || host.endsWith('.' + suffix)".
const AI_HOSTS: Array<[string, string]> = [
  ['chatgpt.com', 'chatgpt'],
  ['chat.openai.com', 'chatgpt'],
  ['openai.com', 'chatgpt'],
  ['perplexity.ai', 'perplexity'],
  ['claude.ai', 'claude'],
  ['gemini.google.com', 'gemini'],
  ['bard.google.com', 'gemini'],
  ['copilot.microsoft.com', 'copilot'],
  ['copilot.cloud.microsoft', 'copilot'],
  ['meta.ai', 'meta_ai'],
  ['you.com', 'you'],
  ['phind.com', 'phind'],
  ['chat.deepseek.com', 'deepseek'],
  ['grok.com', 'grok'],
  ['chat.mistral.ai', 'mistral'],
  ['kagi.com', 'kagi'],
];

const SEARCH_HOSTS: Array<[string, string]> = [
  ['google.com', 'google'],
  ['bing.com', 'bing'],
  ['duckduckgo.com', 'duckduckgo'],
  ['search.yahoo.com', 'yahoo'],
  ['yahoo.com', 'yahoo'],
  ['ecosia.org', 'ecosia'],
  ['search.brave.com', 'brave'],
  ['startpage.com', 'startpage'],
  ['yandex.ru', 'yandex'],
  ['yandex.com', 'yandex'],
  ['baidu.com', 'baidu'],
  ['naver.com', 'naver'],
];

const SOCIAL_HOSTS: Array<[string, string]> = [
  ['instagram.com', 'instagram'],
  ['l.instagram.com', 'instagram'],
  ['facebook.com', 'facebook'],
  ['m.facebook.com', 'facebook'],
  ['l.facebook.com', 'facebook'],
  ['t.co', 'x'],
  ['x.com', 'x'],
  ['twitter.com', 'x'],
  ['tiktok.com', 'tiktok'],
  ['reddit.com', 'reddit'],
  ['linkedin.com', 'linkedin'],
  ['lnkd.in', 'linkedin'],
  ['youtube.com', 'youtube'],
  ['threads.net', 'threads'],
  ['threads.com', 'threads'],
  ['bsky.app', 'bluesky'],
  ['snapchat.com', 'snapchat'],
  ['pinterest.com', 'pinterest'],
  ['discord.com', 'discord'],
];

const EMAIL_HOSTS: Array<[string, string]> = [
  ['mail.google.com', 'gmail'],
  ['outlook.live.com', 'outlook'],
  ['outlook.office.com', 'outlook'],
  ['mail.yahoo.com', 'yahoo_mail'],
  ['substack.com', 'substack'],
];

// utm_source values AI products add to outbound links.
const AI_UTM: Record<string, string> = {
  'chatgpt.com': 'chatgpt',
  chatgpt: 'chatgpt',
  openai: 'chatgpt',
  perplexity: 'perplexity',
  'perplexity.ai': 'perplexity',
  claude: 'claude',
  'claude.ai': 'claude',
  gemini: 'gemini',
  copilot: 'copilot',
};

const SELF_HOSTS = ['getsynth.app'];

function matchHost(host: string, table: Array<[string, string]>): string | null {
  for (const [suffix, name] of table) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return name;
  }
  return null;
}

/** "google.co.uk", "google.de" etc. are Google too. */
function isGoogleCountryHost(host: string): boolean {
  return /(^|\.)google\.[a-z.]{2,6}$/.test(host);
}

export function classifySource(input: SourceInput): Source {
  let referrerHost: string | null = null;
  let referrerPath: string | null = null;
  if (input.referrer) {
    try {
      const url = new URL(input.referrer);
      referrerHost = url.hostname.toLowerCase().replace(/^www\./, '');
      referrerPath = url.pathname.slice(0, 300);
    } catch {
      referrerHost = null;
    }
  }
  const utmSource = input.utmSource?.trim().toLowerCase() || null;
  const utmMedium = input.utmMedium?.trim().toLowerCase() || null;
  const base = { referrerHost, referrerPath };

  if (utmSource && AI_UTM[utmSource]) return { ...base, category: 'ai_assistant', name: AI_UTM[utmSource] };
  if (referrerHost) {
    const ai = matchHost(referrerHost, AI_HOSTS);
    if (ai) return { ...base, category: 'ai_assistant', name: ai };
  }
  if (utmMedium && /^(cpc|ppc|paid|paidsocial|paid_social|display|ads?)$/.test(utmMedium)) {
    return { ...base, category: 'paid', name: utmSource };
  }
  if (utmMedium === 'email' || utmMedium === 'newsletter') return { ...base, category: 'email', name: utmSource };
  if (utmSource && utmMedium === 'social') return { ...base, category: 'social', name: utmSource };

  if (referrerHost) {
    if (SELF_HOSTS.some((h) => referrerHost === h || referrerHost!.endsWith(`.${h}`))) {
      return { ...base, category: 'internal', name: referrerHost };
    }
    const search = matchHost(referrerHost, SEARCH_HOSTS) ?? (isGoogleCountryHost(referrerHost) ? 'google' : null);
    if (search) return { ...base, category: 'organic_search', name: search };
    const social = matchHost(referrerHost, SOCIAL_HOSTS);
    if (social) return { ...base, category: 'social', name: social };
    const email = matchHost(referrerHost, EMAIL_HOSTS);
    if (email) return { ...base, category: 'email', name: email };
    return { ...base, category: 'referral', name: referrerHost };
  }

  if (utmSource) return { ...base, category: 'referral', name: utmSource };
  return { ...base, category: 'direct', name: null };
}

export function deviceFromUserAgent(userAgent: string | null | undefined): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android|windows phone/.test(ua)) return 'mobile';
  return 'desktop';
}

/** Headless browsers, uptime checkers, link unfurlers: not people. */
export function looksAutomated(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return /bot|crawl|spider|slurp|headless|preview|fetch|monitor|lighthouse|pingdom|curl|wget|python|node-fetch|axios|facebookexternalhit|embedly|whatsapp|slackbot|discordbot|telegrambot/i.test(
    userAgent,
  );
}
