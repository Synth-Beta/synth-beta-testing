/**
 * Thin fetch wrappers for the SEO jobs: OpenAI chat (JSON drafts), and web-search answers
 * from OpenAI, Perplexity, and Gemini for AI-visibility tracking. Each answer comes back
 * as plain text plus the URLs the assistant cited.
 */

export interface SearchAnswer {
  text: string;
  citedUrls: string[];
  model: string;
}

const TIMEOUT_MS = 60_000;

async function postJson(url: string, body: unknown, headers: Record<string, string>): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

export function openAiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

export async function openAiJson<T>(input: { system: string; user: string; model?: string; maxTokens?: number }): Promise<{ data: T; model: string }> {
  const key = openAiKey();
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  const model = input.model || process.env.OPENAI_SEO_MODEL?.trim() || 'gpt-4o';
  const json = await postJson(
    'https://api.openai.com/v1/chat/completions',
    {
      model,
      temperature: 0.6,
      max_tokens: input.maxTokens ?? 4000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
    },
    { Authorization: `Bearer ${key}` },
  );
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('OpenAI returned no content');
  return { data: JSON.parse(content) as T, model };
}

/** OpenAI Responses API with the web search tool (what ChatGPT search does). */
export async function openAiSearch(prompt: string): Promise<SearchAnswer> {
  const key = openAiKey();
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  const model = process.env.OPENAI_AIO_MODEL?.trim() || 'gpt-4o-mini';
  const run = (tool: string) =>
    postJson('https://api.openai.com/v1/responses', { model, tools: [{ type: tool }], input: prompt }, { Authorization: `Bearer ${key}` });
  let json: any;
  try {
    json = await run('web_search');
  } catch (err) {
    if (!String(err).startsWith('400')) throw err;
    json = await run('web_search_preview');
  }
  const texts: string[] = [];
  const urls: string[] = [];
  for (const item of json?.output ?? []) {
    if (item?.type !== 'message') continue;
    for (const part of item.content ?? []) {
      if (typeof part?.text === 'string') texts.push(part.text);
      for (const a of part?.annotations ?? []) if (typeof a?.url === 'string') urls.push(a.url);
    }
  }
  return { text: texts.join('\n'), citedUrls: [...new Set(urls)], model };
}

export async function perplexitySearch(prompt: string): Promise<SearchAnswer> {
  const key = process.env.PERPLEXITY_API_KEY?.trim();
  if (!key) throw new Error('PERPLEXITY_API_KEY is not set');
  // Perplexity retired chat/completions (403 "Sonar is now the Agent API"); presets replace model names.
  const preset = process.env.PERPLEXITY_PRESET?.trim() || 'fast';
  const json = await postJson(
    'https://api.perplexity.ai/v1/agent',
    { preset, input: prompt },
    { Authorization: `Bearer ${key}` },
  );
  const output: any[] = Array.isArray(json?.output) ? json.output : [];
  const text = output
    .filter((o) => o?.type === 'message')
    .flatMap((o) => o.content ?? [])
    .map((p: any) => p?.text ?? '')
    .join('\n');
  const urls: string[] = output
    .filter((o) => o?.type === 'search_results')
    .flatMap((o) => o.results ?? [])
    .map((r: any) => r?.url)
    .filter((u: unknown): u is string => typeof u === 'string');
  return { text, citedUrls: [...new Set(urls)], model: json?.model || `perplexity:${preset}` };
}

export async function geminiSearch(prompt: string): Promise<SearchAnswer> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  const json = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] },
    { 'x-goog-api-key': key },
  );
  const candidate = json?.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((p: any) => p?.text ?? '').join('');
  const urls: string[] = [];
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    if (typeof chunk?.web?.uri === 'string') urls.push(chunk.web.uri);
    // Gemini cites through redirect URLs; the title carries the real domain.
    if (typeof chunk?.web?.title === 'string' && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(chunk.web.title)) urls.push(`https://${chunk.web.title}`);
  }
  return { text, citedUrls: [...new Set(urls)], model };
}

export const SEARCH_PLATFORMS: Array<{ platform: string; enabled: () => boolean; run: (prompt: string) => Promise<SearchAnswer> }> = [
  { platform: 'chatgpt', enabled: () => !!openAiKey(), run: openAiSearch },
  { platform: 'perplexity', enabled: () => !!process.env.PERPLEXITY_API_KEY?.trim(), run: perplexitySearch },
  { platform: 'gemini', enabled: () => !!process.env.GEMINI_API_KEY?.trim(), run: geminiSearch },
];
