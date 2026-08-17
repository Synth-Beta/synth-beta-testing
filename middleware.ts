/**
 * Host-based routing for the unified Vercel deployment.
 * getsynth.app serves the admin/marketing SPA from dist/_site/getsynth.
 * join.getsynth.app continues to use the consumer SPA in dist/.
 */

import { next, rewrite } from '@vercel/functions';

const GETSYNTH_HOSTS = new Set(['getsynth.app', 'www.getsynth.app']);

function isGetsynthHost(host: string): boolean {
  const hostname = host.split(':')[0]?.toLowerCase() ?? '';
  return GETSYNTH_HOSTS.has(hostname);
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
  if (!isGetsynthHost(host)) return next();

  const url = new URL(request.url);
  const path = url.pathname;
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
