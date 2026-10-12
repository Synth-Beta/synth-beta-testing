/**
 * Local preview of the server-rendered SEO pages against the real Supabase data.
 *   npx tsx scripts/seo-preview.ts   ->  http://localhost:4321
 *
 * Routes paths through middleware.ts's seoRewriteQuery for both hosts on one port (their
 * paths don't overlap) and rewrites getsynth.app / join.getsynth.app links to localhost.
 * Reads SUPABASE_URL + anon key from .env.vercel (`vercel env pull .env.vercel`).
 * Tracker beacons are dropped so local browsing never writes analytics rows.
 */
import http from 'node:http';
import { config } from 'dotenv';
import type { VercelRequest, VercelResponse } from '@vercel/node';

config({ path: ['.env.vercel', '.env.local', '.env'], quiet: true });

const { seoRewriteQuery } = await import('../middleware.ts');
const { handleSeoRoute, readSeoRoute } = await import('../api/_lib/seo/handler.ts');

const PORT = Number(process.env.SEO_PREVIEW_PORT) || 4321;
const LOCAL = `http://localhost:${PORT}`;

const INDEX = `<!doctype html><meta charset="utf-8"><title>SEO preview</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.6}</style>
<h1>Synth SEO pages (local preview)</h1>
<ul>
<li><a href="/concerts/washington-dc">Concerts in Washington, DC</a> (event, venue and artist pages link from here)</li>
<li><a href="/concerts/washington-dc/this-weekend">This weekend in DC</a></li>
<li><a href="/guides">Guides index</a> (approved guide, brand and comparison pages appear here)</li>
<li><a href="/llms.txt">llms.txt</a></li>
<li><a href="/sitemap-seo.xml?site=getsynth">Sitemap: getsynth.app</a> · <a href="/sitemap-seo.xml?site=join">join.getsynth.app</a></li>
</ul>`;

function localize(body: string): string {
  return body.replaceAll('https://join.getsynth.app', LOCAL).replaceAll('https://getsynth.app', LOCAL);
}

function makeRes(out: http.ServerResponse, rewriteLinks: boolean): VercelResponse {
  const res = {
    setHeader(name: string, value: string) {
      out.setHeader(name, value);
      return res;
    },
    status(code: number) {
      out.statusCode = code;
      return res;
    },
    send(body: string) {
      out.end(rewriteLinks && typeof body === 'string' ? localize(body) : body);
      return res;
    },
    json(body: unknown) {
      out.setHeader('Content-Type', 'application/json');
      out.end(JSON.stringify(body));
      return res;
    },
    end() {
      out.end();
      return res;
    },
  };
  return res as unknown as VercelResponse;
}

http
  .createServer(async (incoming, out) => {
    const url = new URL(incoming.url ?? '/', LOCAL);
    try {
      if (url.pathname === '/') {
        out.setHeader('Content-Type', 'text/html; charset=utf-8');
        return out.end(INDEX);
      }
      if (url.searchParams.has('collect')) {
        out.statusCode = 204;
        return out.end();
      }

      let query: string | null = null;
      if (url.pathname === '/api/share') query = url.search.slice(1);
      else if (url.pathname === '/sitemap-seo.xml') query = `seo=sitemap&site=${url.searchParams.get('site') === 'join' ? 'join' : 'getsynth'}`;
      else query = seoRewriteQuery(true, url.pathname) ?? seoRewriteQuery(false, url.pathname);
      if (!query) {
        out.statusCode = 404;
        return out.end('Not an SEO page. Start at /');
      }

      const params = new URLSearchParams(query);
      const req = {
        method: incoming.method,
        url: `/api/share?${query}`,
        headers: incoming.headers,
        query: Object.fromEntries(params),
        body: undefined,
      } as unknown as VercelRequest;
      const route = readSeoRoute(req);
      if (!route) {
        out.statusCode = 404;
        return out.end('Unknown route');
      }
      await handleSeoRoute(route, req, makeRes(out, route.kind !== 'tracker'));
      console.log(out.statusCode, url.pathname);
    } catch (err) {
      console.error(url.pathname, err);
      out.statusCode = 500;
      out.end(String(err instanceof Error ? err.stack : err));
    }
  })
  .listen(PORT, () => console.log(`SEO preview on ${LOCAL}`));
