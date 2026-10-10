/**
 * Search-engine and AI crawler detection for SEO crawler-hit logging (middleware.ts).
 * No imports: the edge middleware and the node:test suite both load this file directly.
 * User-agent claims are not verified (no reverse-DNS), so counts are an estimate.
 */

export type BotCategory = 'search' | 'ai';

// Order matters: more specific tokens first (e.g. "Claude-SearchBot" before "ClaudeBot").
const BOTS: ReadonlyArray<{ token: string; name: string; category: BotCategory }> = [
  { token: 'googlebot', name: 'Googlebot', category: 'search' },
  { token: 'bingbot', name: 'Bingbot', category: 'search' },
  { token: 'duckduckbot', name: 'DuckDuckBot', category: 'search' },
  { token: 'applebot', name: 'Applebot', category: 'search' },
  { token: 'yandexbot', name: 'YandexBot', category: 'search' },
  { token: 'oai-searchbot', name: 'OAI-SearchBot', category: 'ai' },
  { token: 'chatgpt-user', name: 'ChatGPT-User', category: 'ai' },
  { token: 'gptbot', name: 'GPTBot', category: 'ai' },
  { token: 'claude-searchbot', name: 'Claude-SearchBot', category: 'ai' },
  { token: 'claude-user', name: 'Claude-User', category: 'ai' },
  { token: 'claudebot', name: 'ClaudeBot', category: 'ai' },
  { token: 'perplexity-user', name: 'Perplexity-User', category: 'ai' },
  { token: 'perplexitybot', name: 'PerplexityBot', category: 'ai' },
  { token: 'google-extended', name: 'Google-Extended', category: 'ai' },
  { token: 'ccbot', name: 'CCBot', category: 'ai' },
  { token: 'bytespider', name: 'Bytespider', category: 'ai' },
  { token: 'meta-externalagent', name: 'Meta-ExternalAgent', category: 'ai' },
];

export function classifyBot(userAgent: string | null | undefined): { name: string; category: BotCategory } | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  const hit = BOTS.find((bot) => ua.includes(bot.token));
  return hit ? { name: hit.name, category: hit.category } : null;
}
