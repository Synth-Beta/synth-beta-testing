/**
 * Host-based routing for the unified Vercel deployment.
 * getsynth.app serves the admin/marketing SPA from dist/_site/getsynth.
 * join.getsynth.app continues to use the consumer SPA in dist/.
 */

import { next, rewrite, waitUntil } from '@vercel/functions';
import { classifyBot } from './api/_lib/seo/bots.js';

const GETSYNTH_HOSTS = new Set(['getsynth.app', 'www.getsynth.app']);

function isGetsynthHost(host: string): boolean {
  const hostname = host.split(':')[0]?.toLowerCase() ?? '';
  return GETSYNTH_HOSTS.has(hostname);
}

/** Public SEO pages render in api/share.ts (see api/_lib/seo/handler.ts). */
function seoRewriteQuery(getsynth: boolean, path: string): string | null {
  if (path === '/sitemap-seo.xml') return `seo=sitemap&site=${getsynth ? 'getsynth' : 'join'}`;
  if (path === '/indexnow-key.txt') return 'seo=indexnow-key';
  if (getsynth) {
    // /concerts/{city} and /concerts/{city}/{this-weekend|genre}
    const city = path.match(/^\/concerts\/([^/]+)(?:\/([^/]+))?\/?$/);
    if (!city) return null;
    return `seo=city&slug=${encodeURIComponent(city[1])}${city[2] ? `&sub=${encodeURIComponent(city[2])}` : ''}`;
  }
  const entity = path.match(/^\/(venues|artists)\/([^/]+)\/?$/);
  if (!entity) return null;
  return `seo=${entity[1] === 'venues' ? 'venue' : 'artist'}&slug=${encodeURIComponent(entity[2])}`;
}

// Middleware runs before the CDN cache, so this sees every crawler request, cached or not.
function logCrawlerHit(request: Request, host: string, path: string) {
  const bot = classifyBot(request.headers.get('user-agent'));
  if (!bot) return;
  if (/\.[a-zA-Z0-9]+$/.test(path) && !/\.(xml|txt)$/.test(path)) return; // skip assets
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;
  waitUntil(
    fetch(`${supabaseUrl}/rest/v1/seo_crawler_hits`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        host: host.split(':')[0]?.toLowerCase().slice(0, 100) ?? '',
        path: path.slice(0, 500),
        bot_name: bot.name,
        bot_category: bot.category,
      }),
    }).catch(() => undefined),
  );
}

const STATIC_PREFIXES = ['/assets/', '/Logos/', '/demos/', '/founders/', '/screenshots/'];
const STATIC_FILES = new Set([
  '/favicon.png',
  '/robots.txt',
  '/sitemap.xml',
  '/placeholder.svg',
]);

export default function middleware(request: Request) {
  const host = request.headers.get('host') || '';
  const getsynth = isGetsynthHost(host);
  const url = new URL(request.url);
  const path = url.pathname;

  logCrawlerHit(request, host, path);

  const seoQuery = seoRewriteQuery(getsynth, path);
  if (seoQuery) return rewrite(new URL(`/api/share?${seoQuery}`, request.url));

  if (!getsynth) return next();

  if (path === '/admin' && !url.searchParams.has('tab')) {
    url.searchParams.set('tab', 'ai-scene-guides');
    return Response.redirect(url, 307);
  }

  if (path.startsWith('/api/') || path.startsWith('/_site/')) return next();

  const isStatic =
    STATIC_FILES.has(path) ||
    STATIC_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    /\.[a-zA-Z0-9]+$/.test(path);

  if (isStatic) {
    return rewrite(new URL(`/_site/getsynth${path}`, request.url));
  }

  return rewrite(new URL('/_site/getsynth/index.html', request.url));
}

export const config = {
  matcher: ['/((?!api/|_site/|\\.well-known/).*)'],
};
