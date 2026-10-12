/**
 * HTML templates for the public SEO pages (DC pilot): city hub, venue, artist, event,
 * guide/brand/comparison content, guides index, sitemap, llms.txt.
 * Pure string builders, like api/share.ts. No local imports so node:test can load this
 * file directly (see render.test.ts).
 *
 * JamBase API terms (required on every page that shows their data):
 *   - visible "Powered by JamBase" link to jambase.com with rel="nofollow"
 *   - each event links to its primary ticket URL, unmodified, else the JamBase event URL,
 *     with rel="nofollow"
 */

export const GETSYNTH_ORIGIN = 'https://getsynth.app';
export const JOIN_ORIGIN = 'https://join.getsynth.app';
const APP_STORE_ID = '6757408095';
const APP_STORE_URL = `https://apps.apple.com/us/app/synth-for-live-music-lovers/id${APP_STORE_ID}`;
const DEFAULT_IMAGE = `${JOIN_ORIGIN}/opengraph.jpg`;
const GA4_ID = 'G-9T0MS9F1D3';
// shortcut: every event time is shown in Eastern time, which is right for the DC pilot only.
const DISPLAY_TIME_ZONE = 'America/New_York';

export interface SeoEvent {
  id: string;
  slug?: string | null;
  title: string | null;
  event_date: string;
  event_status: string | null;
  ticket_urls: unknown;
  external_url: string | null;
  genres: string[] | null;
  artist: { id: string; name: string | null; slug: string | null } | null;
  venue: { id: string; name: string | null; slug: string | null; city: string | null; state: string | null } | null;
  /** Synth users interested or going; filled in by the handler, omitted when unknown. */
  interested?: number;
}

export interface SeoVenue {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  street_address: string | null;
}

export interface SeoArtist {
  id: string;
  name: string;
  slug: string;
  genres: string[] | null;
  image_url?: string | null;
}

export interface SeoVenueDetail extends SeoVenue {
  capacity?: number | null;
  image_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  postal_code?: string | null;
}

export interface SeoEventDetail extends SeoEvent {
  doors_time?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  price_currency?: string | null;
  tour_name?: string | null;
  image_url?: string | null;
  ticket_available?: boolean | null;
  setlist_songs?: string[];
  setlist_url?: string | null;
}

export interface ReviewBlock {
  count: number;
  avg: number | null;
  snippets: Array<{ rating: number | null; text: string; date: string }>;
}

export interface ReviewSnippets {
  artist?: ReviewBlock | null;
  venue?: ReviewBlock | null;
  event?: ReviewBlock | null;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface LinkItem {
  title: string;
  url: string;
}

export type ContentType = 'guide' | 'brand' | 'comparison';

const CONTENT_PREFIX: Record<ContentType, string> = { guide: 'guides', brand: 'learn', comparison: 'compare' };
const CONTENT_SECTION: Record<ContentType, string> = { guide: 'Guides', brand: 'About Synth', comparison: 'Comparisons' };

export function contentUrl(type: ContentType, slug: string): string {
  return `${GETSYNTH_ORIGIN}/${CONTENT_PREFIX[type]}/${encodeURIComponent(slug)}`;
}

export function eventUrl(slug: string): string {
  return `${JOIN_ORIGIN}/events/${encodeURIComponent(slug)}`;
}

const DC_CITY = 'washington';
const DC_STATE = 'District of Columbia';

export function isDcVenue(venue: { city?: string | null; state?: string | null } | null | undefined): boolean {
  return !!venue && venue.city?.trim().toLowerCase() === DC_CITY && venue.state === DC_STATE;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

/** JamBase rule: primary ticket URL as-is, else the JamBase event URL, else no link. */
export function ticketHref(event: Pick<SeoEvent, 'ticket_urls' | 'external_url'>): string | null {
  const urls = Array.isArray(event.ticket_urls) ? event.ticket_urls : [];
  const first = urls[0];
  const primary = isHttpUrl(first)
    ? first
    : first && typeof first === 'object' && isHttpUrl((first as { url?: unknown }).url)
      ? (first as { url: string }).url
      : null;
  if (primary) return primary.trim();
  return isHttpUrl(event.external_url) ? event.external_url.trim() : null;
}

function formatEventDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const STATUS_LABEL: Record<string, string> = {
  cancelled: 'Cancelled',
  postponed: 'Postponed',
  rescheduled: 'Rescheduled',
};

const SCHEMA_STATUS: Record<string, string> = {
  cancelled: 'https://schema.org/EventCancelled',
  postponed: 'https://schema.org/EventPostponed',
  rescheduled: 'https://schema.org/EventRescheduled',
};

function venueUrl(slug: string): string {
  return `${JOIN_ORIGIN}/venues/${encodeURIComponent(slug)}`;
}

function artistUrl(slug: string): string {
  return `${JOIN_ORIGIN}/artists/${encodeURIComponent(slug)}`;
}

/** Our own links may carry UTMs; ticket links must never be modified (JamBase terms). */
function appLink(query: string, campaign: string): string {
  const params = new URLSearchParams(query);
  params.set('utm_source', 'getsynth_seo');
  params.set('utm_medium', 'organic');
  params.set('utm_campaign', campaign);
  return `${JOIN_ORIGIN}/?${params.toString()}`;
}

function eventJsonLd(event: SeoEvent): Record<string, unknown> {
  const status = SCHEMA_STATUS[event.event_status ?? ''] ?? 'https://schema.org/EventScheduled';
  const href = ticketHref(event);
  return {
    '@type': 'MusicEvent',
    name: event.title ?? event.artist?.name ?? 'Live music',
    startDate: event.event_date,
    eventStatus: status,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    ...(event.venue?.name
      ? {
          location: {
            '@type': 'MusicVenue',
            name: event.venue.name,
            address: {
              '@type': 'PostalAddress',
              addressLocality: event.venue.city ?? undefined,
              addressRegion: event.venue.state ?? undefined,
            },
          },
        }
      : {}),
    ...(event.artist?.name ? { performer: { '@type': 'MusicGroup', name: event.artist.name } } : {}),
    ...(href ? { offers: { '@type': 'Offer', url: href } } : {}),
  };
}

/** `<` is escaped so a value like "</script>" cannot break out of the JSON-LD block. */
function jsonLdScript(data: Record<string, unknown>): string {
  const json = JSON.stringify({ '@context': 'https://schema.org', ...data }).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

function breadcrumbJsonLd(items: Array<{ name: string; url: string }>): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** Event pages exist (and are linked) for DC shows only. */
function eventHref(event: SeoEvent): string | null {
  return event.slug && isDcVenue(event.venue) ? eventUrl(event.slug) : null;
}

export function eventListHtml(events: SeoEvent[], show: 'venue' | 'artist' | 'both'): string {
  if (events.length === 0) {
    return '<p class="muted">No upcoming shows listed right now. Check back soon.</p>';
  }
  const items = events.map((event) => {
    const status = STATUS_LABEL[event.event_status ?? ''];
    const href = ticketHref(event);
    const venue =
      show !== 'artist' && event.venue?.name
        ? event.venue.slug
          ? `<a href="${escapeHtml(venueUrl(event.venue.slug))}">${escapeHtml(event.venue.name)}</a>`
          : escapeHtml(event.venue.name)
        : '';
    const artist =
      show !== 'venue' && event.artist?.name
        ? event.artist.slug
          ? `<a href="${escapeHtml(artistUrl(event.artist.slug))}">${escapeHtml(event.artist.name)}</a>`
          : escapeHtml(event.artist.name)
        : '';
    const where = [artist, venue].filter(Boolean).join(' · ');
    const interested = event.interested && event.interested > 0
      ? ` <span class="interest">${event.interested} interested on Synth</span>`
      : '';
    return `<li class="event">
  <div class="when">${escapeHtml(formatEventDate(event.event_date))}${status ? ` <span class="status">${status}</span>` : ''}</div>
  <div class="what">${(() => {
    const label = escapeHtml(event.title ?? event.artist?.name ?? 'Live music');
    const page = eventHref(event);
    return page ? `<a href="${escapeHtml(page)}">${label}</a>` : label;
  })()}</div>
  ${where ? `<div class="where">${where}</div>` : ''}
  ${href ? `<a class="tickets" href="${escapeHtml(href)}" rel="nofollow noopener" target="_blank" data-track="ticket_click">Tickets</a>` : ''}${interested}
</li>`;
  });
  return `<ul class="events">${items.join('\n')}</ul>`;
}

const ACCENTS_FROM = 'áàâäãåéèêëíìîïóòôöõúùûüñçø';
const ACCENTS_TO = 'aaaaaaeeeeiiiiooooouuuunco';

/** Mirrors public.seo_slugify so genre URLs match seo_genre_counts(). */
export function slugifyGenre(value: string): string {
  const folded = [...value.toLowerCase()].map((ch) => {
    const i = ACCENTS_FROM.indexOf(ch);
    return i >= 0 ? ACCENTS_TO[i] : ch;
  }).join('');
  return folded.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const GENRE_LABELS: Record<string, string> = {
  edm: 'EDM',
  'rhythm-and-blues-soul': 'R&B / Soul',
  'hip-hop-rap': 'Hip-Hop / Rap',
  'hip-hop': 'Hip-Hop',
  'country-music': 'Country',
  jamband: 'Jam Band',
  'prog-rock': 'Prog Rock',
};

export function genreLabel(slug: string): string {
  return GENRE_LABELS[slug] ?? slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function eventHasGenre(event: Pick<SeoEvent, 'genres'>, slug: string): boolean {
  return (event.genres ?? []).some((g) => slugifyGenre(g) === slug);
}

/** Calendar date (y, m, d) as seen in DISPLAY_TIME_ZONE for an instant. */
function zonedYmd(date: Date): { y: number; m: number; d: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { y: Number(get('year')), m: Number(get('month')), d: Number(get('day')), weekday };
}

/** UTC instant of local midnight in DISPLAY_TIME_ZONE on the given calendar date. */
function zonedMidnight(y: number, m: number, d: number): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, 12)); // noon avoids DST-edge day slips
  const local = zonedYmd(guess);
  const offsetHours = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: DISPLAY_TIME_ZONE, hour: 'numeric', hourCycle: 'h23' }).format(guess),
  ) - 12;
  return new Date(Date.UTC(local.y, local.m - 1, local.d) - offsetHours * 3_600_000);
}

/**
 * "This weekend" in Eastern time: Friday 00:00 to Monday 00:00. Mon-Thu point at the
 * coming weekend; Fri-Sun at the current one.
 */
export function weekendWindow(now: Date): { start: Date; end: Date; label: string } {
  const today = zonedYmd(now);
  const daysBack = today.weekday === 0 ? 2 : today.weekday === 6 ? 1 : today.weekday === 5 ? 0 : -(5 - today.weekday);
  const friday = new Date(Date.UTC(today.y, today.m - 1, today.d - daysBack));
  const fy = friday.getUTCFullYear();
  const fm = friday.getUTCMonth() + 1;
  const fd = friday.getUTCDate();
  const start = zonedMidnight(fy, fm, fd);
  const end = zonedMidnight(fy, fm, fd + 3);
  const fmt = (date: Date) => date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
  const label = `${fmt(friday)} – ${fmt(new Date(Date.UTC(fy, fm - 1, fd + 2)))}`;
  return { start, end, label };
}

interface PageInput {
  title: string;
  description: string;
  canonical: string;
  indexable: boolean;
  breadcrumbs: Array<{ name: string; url: string }>;
  jsonLd: Array<Record<string, unknown>>;
  body: string;
  ctaHref: string;
  /** Tags the page for visitor analytics (landing pages by type). */
  pageType?: string;
  image?: string | null;
  ogType?: 'website' | 'article';
}

export function faqHtml(items: FaqItem[], heading = 'Questions'): string {
  if (items.length === 0) return '';
  return `<h2>${escapeHtml(heading)}</h2>
${items.map((f) => `<h3>${escapeHtml(f.q)}</h3>\n<p>${escapeHtml(f.a)}</p>`).join('\n')}`;
}

export function faqJsonLd(items: FaqItem[]): Record<string, unknown> | null {
  if (items.length === 0) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

function linkListHtml(heading: string, links: LinkItem[]): string {
  if (links.length === 0) return '';
  return `<h2>${escapeHtml(heading)}</h2>
<ul class="links">${links.map((l) => `<li><a href="${escapeHtml(l.url)}">${escapeHtml(l.title)}</a></li>`).join('')}</ul>`;
}

function stars(rating: number | null | undefined): string {
  if (rating == null || !Number.isFinite(rating)) return '';
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return `<span class="stars" aria-label="${r} out of 5">${'★'.repeat(r)}${'☆'.repeat(5 - r)}</span>`;
}

function reviewBlockHtml(heading: string, block: ReviewBlock | null | undefined): string {
  if (!block || block.count === 0) return '';
  const avg = block.avg != null ? `${block.avg.toFixed(1)} out of 5` : '';
  const quotes = block.snippets
    .map((s) => `<blockquote>${stars(s.rating)} ${escapeHtml(s.text.length >= 400 ? `${s.text.slice(0, 397)}…` : s.text)}</blockquote>`)
    .join('\n');
  return `<h2>${escapeHtml(heading)}</h2>
<p class="muted">${block.count} ${block.count === 1 ? 'review' : 'reviews'} from Synth members${avg ? ` · average ${avg}` : ''}.</p>
${quotes}`;
}

function setlistHtml(heading: string, songs: string[], note: string, url: string | null): string {
  if (songs.length === 0) return '';
  const shown = songs.slice(0, 20);
  return `<h2>${escapeHtml(heading)}</h2>
<p class="muted">${escapeHtml(note)}</p>
<ol class="setlist">${shown.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
${songs.length > shown.length ? `<p class="muted">Plus ${songs.length - shown.length} more.</p>` : ''}
${url && isHttpUrl(url) ? `<p class="more"><a href="${escapeHtml(url)}" rel="nofollow noopener" target="_blank">Full setlist on setlist.fm</a></p>` : ''}`;
}

export function renderPage(input: PageInput): string {
  const robots = input.indexable ? 'index, follow' : 'noindex, follow';
  const image = input.image && isHttpUrl(input.image) ? input.image : DEFAULT_IMAGE;
  const crumbs = input.breadcrumbs
    .map((c, i) =>
      i === input.breadcrumbs.length - 1
        ? `<span>${escapeHtml(c.name)}</span>`
        : `<a href="${escapeHtml(c.url)}">${escapeHtml(c.name)}</a>`,
    )
    .join(' › ');
  const updated = new Date().toLocaleDateString('en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)}</title>
<meta name="description" content="${escapeHtml(input.description)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${escapeHtml(input.canonical)}">
<meta property="og:type" content="${input.ogType ?? 'website'}">
<meta property="og:site_name" content="Synth">
<meta property="og:title" content="${escapeHtml(input.title)}">
<meta property="og:description" content="${escapeHtml(input.description)}">
<meta property="og:url" content="${escapeHtml(input.canonical)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeHtml(image)}">
<meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}, app-argument=${escapeHtml(input.canonical)}">
${input.pageType ? `<meta name="synth:page-type" content="${escapeHtml(input.pageType)}">` : ''}
${jsonLdScript(breadcrumbJsonLd(input.breadcrumbs))}
${input.jsonLd.map(jsonLdScript).join('\n')}
<script defer src="/api/share?seo=tracker"></script>
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA4_ID}');
document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[data-track]');if(a)gtag('event',a.getAttribute('data-track'),{page_path:location.pathname});});</script>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#141414;--muted:#666;--line:#e6e6e6;--brand:#e0247e}
@media (prefers-color-scheme:dark){:root{--bg:#111;--fg:#f2f2f2;--muted:#a0a0a0;--line:#2a2a2a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}a{color:var(--brand)}
header.site{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line)}
header.site .brand{font-weight:800;font-size:20px;color:var(--brand);text-decoration:none}
.crumbs{font-size:14px;color:var(--muted)}h1{font-size:30px;line-height:1.2;margin:12px 0}
.summary{font-size:18px}.muted{color:var(--muted)}
.cta{display:inline-block;background:var(--brand);color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;margin:8px 8px 8px 0}
.cta.secondary{background:transparent;color:var(--brand);border:1px solid var(--brand)}
ul.events{list-style:none;padding:0;margin:0}li.event{padding:14px 0;border-bottom:1px solid var(--line)}
.when{font-size:14px;color:var(--muted)}.what{font-weight:600}.where{font-size:15px}
.status{color:#b42318;font-weight:600}.tickets{font-size:14px}
.chips{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none}.chips li{border:1px solid var(--line);border-radius:999px;padding:4px 10px;font-size:14px}
footer{max-width:760px;margin:0 auto;padding:16px;border-top:1px solid var(--line);font-size:14px;color:var(--muted)}
.interest{font-size:14px;color:var(--brand);margin-left:8px}
.chips a{text-decoration:none}
details{border:1px solid var(--line);border-radius:8px;padding:0 12px;margin:8px 0}
details[open]{padding-bottom:8px}
summary{cursor:pointer;padding:10px 0;font-weight:600;min-height:44px;display:flex;align-items:center}
details ul.events li.event:last-child{border-bottom:0}
.more{font-size:14px}
article h2,main>h2{margin-top:32px}blockquote{margin:12px 0;padding:8px 14px;border-left:3px solid var(--brand);background:color-mix(in srgb,var(--brand) 6%,transparent);border-radius:0 8px 8px 0}
.stars{color:#f5a524;letter-spacing:1px;margin-right:6px}.solo{border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:20px 0}
.solo h2{margin:0 0 6px;font-size:20px}dl.facts{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:0}dl.facts dt{color:var(--muted)}dl.facts dd{margin:0}
ol.setlist{columns:2;column-gap:32px;padding-left:20px}ul.links{padding-left:20px}ul.links li{margin:4px 0}.byline{font-size:14px;color:var(--muted)}
</style>
</head>
<body>
<header class="site"><a class="brand" href="${GETSYNTH_ORIGIN}/">Synth</a><span><a href="${GETSYNTH_ORIGIN}/guides">Guides</a> · <a href="${escapeHtml(input.ctaHref)}" data-track="open_in_synth">Open in Synth</a></span></header>
<main>
<nav class="crumbs">${crumbs}</nav>
${input.body}
<p>
<a class="cta" href="${escapeHtml(input.ctaHref)}" data-track="open_in_synth">Open in Synth</a>
<a class="cta secondary" href="${APP_STORE_URL}" data-track="app_store_click">Get the iPhone app</a>
</p>
<p class="muted">Last updated ${escapeHtml(updated)}.</p>
</main>
<footer>
Synth helps you find concerts and people to go with.
<a href="${GETSYNTH_ORIGIN}/concerts/washington-dc">Concerts in DC</a> · <a href="${GETSYNTH_ORIGIN}/guides">Guides</a> · <a href="${GETSYNTH_ORIGIN}/">About Synth</a><br>
Event data <a href="https://www.jambase.com" rel="nofollow">Powered by JamBase</a>.
</footer>
</body>
</html>`;
}

export type CityView =
  | { kind: 'all' }
  | { kind: 'weekend'; label: string }
  | { kind: 'genre'; slug: string; label: string };

const NEXT_UP = 8;
const SEE_ALL_CAP = 100;
const SHOWS_PER_VENUE = 5;
const ARTIST_CAP = 300;

/**
 * City hub and its sub-pages (genre, this weekend). Long lists sit in native
 * <details> so the page stays readable; crawlers still read the collapsed content.
 */
export function renderCityPage(input: {
  cityName: string;
  citySlug: string;
  view: CityView;
  /** Upcoming events for this view, soonest first. */
  events: SeoEvent[];
  /** City-wide genres that have their own page. */
  genres: Array<{ slug: string; label: string; count: number }>;
  indexable: boolean;
  /** Published guides worth linking from the hub. */
  guides?: LinkItem[];
}): string {
  const { cityName, citySlug, view, events } = input;
  const cityUrl = `${GETSYNTH_ORIGIN}/concerts/${citySlug}`;
  const canonical =
    view.kind === 'all' ? cityUrl : `${cityUrl}/${view.kind === 'weekend' ? 'this-weekend' : view.slug}`;
  const active = events.filter((e) => e.event_status !== 'cancelled').length;

  const venueGroups = new Map<string, { name: string; slug: string | null; events: SeoEvent[] }>();
  const artistGroups = new Map<string, { name: string; slug: string | null; count: number }>();
  for (const event of events) {
    if (event.venue?.name) {
      const group = venueGroups.get(event.venue.id) ?? { name: event.venue.name, slug: event.venue.slug, events: [] };
      group.events.push(event);
      venueGroups.set(event.venue.id, group);
    }
    if (event.artist?.name) {
      const group = artistGroups.get(event.artist.id) ?? { name: event.artist.name, slug: event.artist.slug, count: 0 };
      group.count += 1;
      artistGroups.set(event.artist.id, group);
    }
  }
  const venues = [...venueGroups.values()].sort((a, b) => b.events.length - a.events.length);
  const artists = [...artistGroups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const heading =
    view.kind === 'all'
      ? `Concerts in ${cityName}`
      : view.kind === 'weekend'
        ? `Concerts in ${cityName} this weekend`
        : `${view.label} concerts in ${cityName}`;
  const summary =
    view.kind === 'weekend'
      ? `${active} concerts in ${cityName} this weekend (${view.label}) across ${venues.length} venues.`
      : `There are ${active} upcoming ${view.kind === 'genre' ? `${view.label} ` : ''}concerts in ${cityName} on Synth across ${venues.length} venues. Updated daily.`;

  const navLinks = [
    view.kind !== 'all' ? `<li><a href="${escapeHtml(cityUrl)}">All ${escapeHtml(cityName)} concerts</a></li>` : '',
    view.kind !== 'weekend' ? `<li><a href="${escapeHtml(`${cityUrl}/this-weekend`)}">This weekend</a></li>` : '',
    ...input.genres
      .filter((g) => !(view.kind === 'genre' && view.slug === g.slug))
      .slice(0, 12)
      .map((g) => `<li><a href="${escapeHtml(`${cityUrl}/${g.slug}`)}">${escapeHtml(g.label)}</a></li>`),
  ].filter(Boolean);

  const rest = events.slice(NEXT_UP, NEXT_UP + SEE_ALL_CAP);
  const seeAll = rest.length
    ? `<details><summary>See all ${events.length} shows</summary>
${eventListHtml(rest, 'both')}
${events.length > NEXT_UP + SEE_ALL_CAP ? `<p class="more muted">Showing the next ${NEXT_UP + SEE_ALL_CAP}. Browse by venue for the rest.</p>` : ''}
</details>`
    : '';

  const byVenue = venues
    .map((v) => {
      const more = v.slug
        ? `<p class="more"><a href="${escapeHtml(venueUrl(v.slug))}">All shows at ${escapeHtml(v.name)} →</a></p>`
        : '';
      return `<details><summary>${escapeHtml(v.name)} · ${v.events.length} ${v.events.length === 1 ? 'show' : 'shows'}</summary>
${eventListHtml(v.events.slice(0, SHOWS_PER_VENUE), 'artist')}
${more}
</details>`;
    })
    .join('\n');

  const artistChips = artists
    .slice(0, ARTIST_CAP)
    .map((a) => {
      const label = `${escapeHtml(a.name)}${a.count > 1 ? ` (${a.count})` : ''}`;
      return a.slug ? `<li><a href="${escapeHtml(artistUrl(a.slug))}">${label}</a></li>` : `<li>${label}</li>`;
    })
    .join('');
  const byArtist = artists.length
    ? `<details><summary>All ${artists.length} artists</summary><ul class="chips">${artistChips}</ul></details>`
    : '';

  const busiest = venues.slice(0, 3).map((v) => v.name);
  const goTogether = 'On Synth you can see who else is interested in a show, match with people who like the same music, and plan to go together.';
  const faqItems: FaqItem[] =
    view.kind === 'all'
      ? [
          { q: `How many concerts are coming up in ${cityName}?`, a: `Synth lists ${active} upcoming concerts in ${cityName} right now.` },
          ...(busiest.length ? [{ q: `Which ${cityName} venues have the most shows?`, a: `${busiest.join(', ')}.` }] : []),
          { q: `How can I find people to go to concerts with in ${cityName}?`, a: goTogether },
        ]
      : [{ q: `Can I find people to go with to ${heading.toLowerCase()}?`, a: goTogether }];

  const body = `<h1>${escapeHtml(heading)}</h1>
<p class="summary">${escapeHtml(summary)}</p>
${navLinks.length ? `<ul class="chips">${navLinks.join('')}</ul>` : ''}
<h2>Next up</h2>
${eventListHtml(events.slice(0, NEXT_UP), 'both')}
${seeAll}
${venues.length ? `<h2>Browse by venue</h2>\n${byVenue}` : ''}
${byArtist ? `<h2>Browse by artist</h2>\n${byArtist}` : ''}
${linkListHtml(`${cityName} guides`, (input.guides ?? []).slice(0, 8))}
${faqHtml(faqItems)}`;

  const title =
    view.kind === 'all'
      ? `Concerts in ${cityName} | Upcoming Shows | Synth`
      : view.kind === 'weekend'
        ? `Concerts in ${cityName} This Weekend (${view.label}) | Synth`
        : `${view.label} Concerts in ${cityName} | Upcoming Shows | Synth`;
  const description =
    view.kind === 'weekend'
      ? `${active} concerts in ${cityName} this weekend: times, venues and tickets, plus people to go with on Synth.`
      : `${active} upcoming ${view.kind === 'genre' ? `${view.label} ` : ''}concerts in ${cityName}: dates, venues and tickets, plus people to go with on Synth.`;
  const breadcrumbs = [
    { name: 'Synth', url: `${GETSYNTH_ORIGIN}/` },
    { name: `Concerts in ${cityName}`, url: cityUrl },
    ...(view.kind === 'all' ? [] : [{ name: view.kind === 'weekend' ? 'This weekend' : view.label, url: canonical }]),
  ];

  return renderPage({
    title,
    description,
    canonical,
    indexable: input.indexable,
    breadcrumbs,
    jsonLd: [
      {
        '@type': 'ItemList',
        name: heading,
        itemListElement: events.slice(0, 20).map((event, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          item: eventJsonLd(event),
        })),
      },
      ...[faqJsonLd(faqItems)].filter((x): x is Record<string, unknown> => !!x),
    ],
    body,
    pageType: view.kind === 'all' ? 'city' : view.kind === 'weekend' ? 'city_weekend' : 'city_genre',
    ctaHref: appLink('', view.kind === 'all' ? `city_${citySlug}` : `city_${citySlug}_${view.kind === 'weekend' ? 'weekend' : view.slug}`),
  });
}

const DC_HUB = { name: 'Concerts in Washington, DC', url: `${GETSYNTH_ORIGIN}/concerts/washington-dc` };
const GO_TOGETHER =
  'Synth shows you who else is interested in or going to a show, matches you with people who like the same music, and lets you plan to meet up, so you never have to go alone.';

/** "Washington, District of Columbia" reads as "Washington, DC". */
function placeLabel(city: string | null | undefined, state: string | null | undefined): string {
  const region = state === DC_STATE ? 'DC' : state;
  return [city, region].filter(Boolean).join(', ');
}

function postalAddress(venue: SeoVenueDetail | SeoVenue | null | undefined): Record<string, unknown> | undefined {
  if (!venue) return undefined;
  const detail = venue as SeoVenueDetail;
  return {
    '@type': 'PostalAddress',
    streetAddress: venue.street_address ?? undefined,
    addressLocality: venue.city ?? undefined,
    addressRegion: venue.state ?? undefined,
    postalCode: detail.postal_code ?? undefined,
    addressCountry: 'US',
  };
}

function geoJsonLd(venue: SeoVenueDetail | null | undefined): Record<string, unknown> | undefined {
  if (!venue || venue.latitude == null || venue.longitude == null) return undefined;
  return { '@type': 'GeoCoordinates', latitude: venue.latitude, longitude: venue.longitude };
}

export function renderVenuePage(input: {
  venue: SeoVenueDetail;
  events: SeoEvent[];
  total: number;
  indexable: boolean;
  reviews?: ReviewBlock | null;
  guides?: LinkItem[];
}): string {
  const { venue } = input;
  const canonical = venueUrl(venue.slug);
  const place = placeLabel(venue.city, venue.state);
  const address = [venue.street_address, place].filter(Boolean).join(', ');
  const next = input.events.find((e) => e.event_status !== 'cancelled');
  const summary = `${venue.name}${place ? ` in ${place}` : ''} has ${input.total} upcoming ${input.total === 1 ? 'show' : 'shows'} listed on Synth${
    next ? `; next up is ${next.artist?.name ?? next.title ?? 'a show'} on ${formatEventDate(next.event_date)}` : ''
  }.`;
  const facts = [
    address ? `<dt>Address</dt><dd>${escapeHtml(address)}</dd>` : '',
    venue.capacity ? `<dt>Capacity</dt><dd>About ${venue.capacity.toLocaleString('en-US')} people</dd>` : '',
    `<dt>Upcoming shows</dt><dd>${input.total}</dd>`,
  ].join('');
  const faqItems: FaqItem[] = [
    ...(address ? [{ q: `Where is ${venue.name}?`, a: `${venue.name} is at ${address}.` }] : []),
    ...(venue.capacity ? [{ q: `How big is ${venue.name}?`, a: `${venue.name} holds about ${venue.capacity.toLocaleString('en-US')} people.` }] : []),
    ...(next ? [{ q: `Who is playing ${venue.name} next?`, a: `${next.artist?.name ?? next.title ?? 'The next show'} on ${formatEventDate(next.event_date)}.` }] : []),
    { q: `How can I find people to go to ${venue.name} with?`, a: GO_TOGETHER },
  ];
  const body = `<h1>${escapeHtml(venue.name)}</h1>
<p class="summary">${escapeHtml(summary)}</p>
<dl class="facts">${facts}</dl>
<h2>Upcoming shows at ${escapeHtml(venue.name)}</h2>
${eventListHtml(input.events, 'artist')}
${reviewBlockHtml(`What Synth members say about ${venue.name}`, input.reviews)}
${linkListHtml('Related guides', input.guides ?? [])}
${faqHtml(faqItems)}`;
  return renderPage({
    title: `${venue.name}${place ? `, ${place}` : ''}: Upcoming Concerts & Venue Guide | Synth`,
    description: `Upcoming concerts at ${venue.name}${place ? ` in ${place}` : ''}: dates, lineups, tickets, and what Synth members say about the venue.`,
    canonical,
    indexable: input.indexable,
    breadcrumbs: [{ name: 'Synth', url: `${GETSYNTH_ORIGIN}/` }, DC_HUB, { name: venue.name, url: canonical }],
    jsonLd: [
      {
        '@type': 'MusicVenue',
        name: venue.name,
        url: canonical,
        address: postalAddress(venue),
        ...(geoJsonLd(venue) ? { geo: geoJsonLd(venue) } : {}),
        ...(venue.capacity ? { maximumAttendeeCapacity: venue.capacity } : {}),
        ...(venue.image_url && isHttpUrl(venue.image_url) ? { image: venue.image_url } : {}),
        event: input.events.slice(0, 20).map(eventJsonLd),
      },
      ...[faqJsonLd(faqItems)].filter((x): x is Record<string, unknown> => !!x),
    ],
    body,
    pageType: 'venue',
    image: venue.image_url,
    ctaHref: appLink(`venue=${venue.id}`, 'venue'),
  });
}

export function renderArtistPage(input: {
  artist: SeoArtist;
  events: SeoEvent[];
  total: number;
  indexable: boolean;
  reviews?: ReviewBlock | null;
}): string {
  const { artist } = input;
  const canonical = artistUrl(artist.slug);
  const genres = (artist.genres ?? []).filter(Boolean).slice(0, 6);
  const dcShows = input.events.filter((e) => isDcVenue(e.venue) && e.event_status !== 'cancelled');
  const summary = `${artist.name} has ${input.total} upcoming ${input.total === 1 ? 'show' : 'shows'} listed on Synth${
    dcShows.length ? `, including ${dcShows.length} in Washington, DC` : ''
  }.`;
  const genreChips = genres
    .map((g) => {
      const slug = slugifyGenre(g);
      return `<li><a href="${escapeHtml(`${DC_HUB.url}/${slug}`)}">${escapeHtml(g)}</a></li>`;
    })
    .join('');
  const faqItems: FaqItem[] = [
    ...(dcShows[0]
      ? [{ q: `When is ${artist.name} playing in DC?`, a: `${artist.name} plays ${dcShows[0].venue?.name ?? 'Washington, DC'} on ${formatEventDate(dcShows[0].event_date)}.` }]
      : []),
    { q: `How can I find people to see ${artist.name} with?`, a: GO_TOGETHER },
  ];
  const body = `<h1>${escapeHtml(artist.name)}</h1>
${genreChips ? `<ul class="chips">${genreChips}</ul>` : ''}
<p class="summary">${escapeHtml(summary)}</p>
<h2>${escapeHtml(artist.name)} tour dates</h2>
${eventListHtml(input.events, 'venue')}
${reviewBlockHtml(`What Synth members say about ${artist.name} live`, input.reviews)}
${faqHtml(faqItems)}`;
  return renderPage({
    title: `${artist.name} Tour Dates & Tickets | Synth`,
    description: `Upcoming ${artist.name} concerts: tour dates, venues and tickets, plus people to go with on Synth.`,
    canonical,
    indexable: input.indexable,
    breadcrumbs: [{ name: 'Synth', url: `${GETSYNTH_ORIGIN}/` }, DC_HUB, { name: artist.name, url: canonical }],
    jsonLd: [
      {
        '@type': 'MusicGroup',
        name: artist.name,
        url: canonical,
        ...(genres.length ? { genre: genres } : {}),
        ...(artist.image_url && isHttpUrl(artist.image_url) ? { image: artist.image_url } : {}),
        event: input.events.slice(0, 20).map(eventJsonLd),
      },
      ...[faqJsonLd(faqItems)].filter((x): x is Record<string, unknown> => !!x),
    ],
    body,
    pageType: 'artist',
    image: artist.image_url,
    ctaHref: appLink(`artist=${artist.id}`, 'artist'),
  });
}

function positive(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

function priceText(event: SeoEventDetail): string | null {
  const min = positive(event.price_min);
  const max = positive(event.price_max);
  if (min == null && max == null) return null;
  const currency = (event.price_currency ?? 'USD').toUpperCase();
  const fmt = (n: number) => (currency === 'USD' ? `$${Math.round(n)}` : `${Math.round(n)} ${currency}`);
  if (min != null && max != null && max > min) return `${fmt(min)} to ${fmt(max)}`;
  return fmt((min ?? max)!);
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { timeZone: DISPLAY_TIME_ZONE, hour: 'numeric', minute: '2-digit' });
}

function eventDetailJsonLd(
  event: SeoEventDetail,
  venue: SeoVenueDetail | null,
  artist: SeoArtist | null,
  canonical: string,
  description: string,
): Record<string, unknown> {
  const href = ticketHref(event);
  const min = positive(event.price_min);
  const max = positive(event.price_max);
  const currency = (event.price_currency ?? 'USD').toUpperCase();
  const image = [event.image_url, artist?.image_url, venue?.image_url].find((u) => u && isHttpUrl(u));
  const offers = href
    ? min != null && max != null && max > min
      ? { '@type': 'AggregateOffer', url: href, lowPrice: min, highPrice: max, priceCurrency: currency }
      : {
          '@type': 'Offer',
          url: href,
          ...(min ?? max ? { price: min ?? max, priceCurrency: currency } : {}),
          ...(event.ticket_available === true ? { availability: 'https://schema.org/InStock' } : {}),
        }
    : undefined;
  return {
    '@type': 'MusicEvent',
    name: event.title ?? artist?.name ?? 'Live music',
    url: canonical,
    description,
    startDate: event.event_date,
    ...(event.doors_time ? { doorTime: event.doors_time } : {}),
    eventStatus: SCHEMA_STATUS[event.event_status ?? ''] ?? 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    ...(image ? { image: [image] } : {}),
    ...(venue
      ? {
          location: {
            '@type': 'MusicVenue',
            name: venue.name,
            url: venueUrl(venue.slug),
            address: postalAddress(venue),
            ...(geoJsonLd(venue) ? { geo: geoJsonLd(venue) } : {}),
          },
        }
      : {}),
    ...(artist ? { performer: { '@type': 'MusicGroup', name: artist.name, url: artistUrl(artist.slug) } } : {}),
    ...(offers ? { offers } : {}),
  };
}

/**
 * One show. Built around what people search before a concert (when, where, doors,
 * tickets, what they'll play, is it worth it, can I go alone) and what only Synth has:
 * who else is going, member reviews, and a way to meet up.
 */
export function renderEventPage(input: {
  event: SeoEventDetail;
  venue: SeoVenueDetail | null;
  artist: SeoArtist | null;
  reviews: ReviewSnippets;
  recentSetlist: { date: string; venueName: string | null; songs: string[]; url: string | null } | null;
  moreDates: SeoEvent[];
  similar: SeoEvent[];
  guides: LinkItem[];
  isPast: boolean;
  indexable: boolean;
}): string {
  const { event, venue, artist, isPast } = input;
  const canonical = eventUrl(event.slug ?? event.id);
  const artistName = artist?.name ?? event.title ?? 'Live music';
  const venueName = venue?.name ?? 'the venue';
  const place = placeLabel(venue?.city, venue?.state);
  const when = formatEventDate(event.event_date);
  const doors = formatTime(event.doors_time);
  const price = priceText(event);
  const status = STATUS_LABEL[event.event_status ?? ''];
  const interested = event.interested ?? 0;
  const href = ticketHref(event);
  const address = [venue?.street_address, place].filter(Boolean).join(', ');
  const genre = (event.genres ?? artist?.genres ?? []).find(Boolean);

  const heading = `${artistName} at ${venueName}`;
  const summary = isPast
    ? `${artistName} played ${venueName}${place ? ` in ${place}` : ''} on ${when}.${
        input.reviews.event?.count ? ` ${input.reviews.event.count} Synth ${input.reviews.event.count === 1 ? 'member has' : 'members have'} reviewed the show.` : ''
      }`
    : `${artistName} plays ${venueName}${place ? ` in ${place}` : ''} on ${when}${doors ? `, doors at ${doors}` : ''}.${
        price ? ` Tickets are listed at ${price}.` : ''
      }${interested > 0 ? ` ${interested} ${interested === 1 ? 'person on Synth is' : 'people on Synth are'} interested.` : ''}${status ? ` Status: ${status}.` : ''}`;

  const solo = isPast
    ? ''
    : `<section class="solo">
<h2>Going alone? You don't have to.</h2>
<p>${
        interested > 0
          ? `${interested} ${interested === 1 ? 'person on Synth is' : 'people on Synth are'} interested in this show.`
          : `Be the first on Synth to say you're going${genre ? `; ${escapeHtml(genre)} fans nearby will see it` : ''}.`
      } ${escapeHtml(GO_TOGETHER)}</p>
<a class="cta" href="${escapeHtml(appLink(`event=${event.id}`, 'event_going'))}" data-track="open_in_synth">See who's going</a>
${href ? `<a class="cta secondary" href="${escapeHtml(href)}" rel="nofollow noopener" target="_blank" data-track="ticket_click">Tickets</a>` : ''}
</section>`;

  const facts = [
    `<dt>Date</dt><dd>${escapeHtml(when)}${status ? ` <span class="status">${status}</span>` : ''}</dd>`,
    doors ? `<dt>Doors</dt><dd>${escapeHtml(doors)}</dd>` : '',
    venue ? `<dt>Venue</dt><dd><a href="${escapeHtml(venueUrl(venue.slug))}">${escapeHtml(venue.name)}</a>${address ? `<br><span class="muted">${escapeHtml(address)}</span>` : ''}</dd>` : '',
    venue?.capacity ? `<dt>Capacity</dt><dd>About ${venue.capacity.toLocaleString('en-US')}</dd>` : '',
    price ? `<dt>Tickets</dt><dd>${escapeHtml(price)}</dd>` : '',
    event.tour_name ? `<dt>Tour</dt><dd>${escapeHtml(event.tour_name)}</dd>` : '',
    artist && artist.genres?.length ? `<dt>Genre</dt><dd>${escapeHtml(artist.genres.slice(0, 3).join(', '))}</dd>` : '',
  ].join('');

  const ownSetlist = event.setlist_songs ?? [];
  const setlist = ownSetlist.length
    ? setlistHtml('Setlist', ownSetlist, `What ${artistName} played at ${venueName}.`, event.setlist_url ?? null)
    : input.recentSetlist
      ? setlistHtml(
          `What ${artistName} has been playing`,
          input.recentSetlist.songs,
          `From ${formatEventDate(input.recentSetlist.date)}${input.recentSetlist.venueName ? ` at ${input.recentSetlist.venueName}` : ''}. Setlists change night to night.`,
          input.recentSetlist.url,
        )
      : '';

  const faqItems: FaqItem[] = [
    {
      q: isPast ? `When did ${artistName} play ${venueName}?` : `When is ${artistName} playing ${venueName}?`,
      a: `${when}${doors ? `, with doors at ${doors}` : ''}.`,
    },
    ...(address ? [{ q: `Where is ${venueName}?`, a: `${venueName} is at ${address}.` }] : []),
    ...(!isPast && price ? [{ q: `How much are tickets to see ${artistName} at ${venueName}?`, a: `Tickets are listed at ${price}. Prices can change; check the ticket link for current availability.` }] : []),
    ...(!isPast ? [{ q: `Can I go to the ${artistName} show alone?`, a: `Yes. Lots of people go to shows solo. ${GO_TOGETHER}` }] : []),
    ...(!isPast ? [{ q: `How do I find other people going to see ${artistName}?`, a: `Open the show on Synth to see who else is interested or going and message them before the show.` }] : []),
  ];

  const body = `<h1>${escapeHtml(heading)}</h1>
<p class="summary">${escapeHtml(summary)}</p>
${solo}
<h2>${isPast ? 'Show details' : 'Know before you go'}</h2>
<dl class="facts">${facts}</dl>
${setlist}
${reviewBlockHtml(`What Synth members said about this show`, input.reviews.event)}
${reviewBlockHtml(`What Synth members say about ${artistName} live`, input.reviews.artist)}
${reviewBlockHtml(`What Synth members say about ${venueName}`, input.reviews.venue)}
${input.moreDates.length ? `<h2>More ${escapeHtml(artistName)} dates</h2>\n${eventListHtml(input.moreDates, 'venue')}` : ''}
${input.similar.length ? `<h2>Similar shows in DC</h2>\n${eventListHtml(input.similar, 'both')}` : ''}
${linkListHtml('Planning your night', input.guides)}
${faqHtml(faqItems)}`;

  const description = isPast
    ? `${artistName} at ${venueName} on ${when}: setlist, reviews from Synth members, and upcoming dates.`
    : `${artistName} at ${venueName}${place ? `, ${place}` : ''} on ${when}: doors, tickets${price ? ` (${price})` : ''}, setlist, and who else is going on Synth.`;
  const dateShort = new Date(event.event_date).toLocaleDateString('en-US', { timeZone: DISPLAY_TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric' });

  return renderPage({
    title: `${artistName} at ${venueName}, ${dateShort}${isPast ? ': Setlist & Reviews' : ': Tickets & Who\'s Going'} | Synth`,
    description,
    canonical,
    indexable: input.indexable,
    breadcrumbs: [
      { name: 'Synth', url: `${GETSYNTH_ORIGIN}/` },
      DC_HUB,
      ...(venue ? [{ name: venue.name, url: venueUrl(venue.slug) }] : []),
      { name: heading, url: canonical },
    ],
    jsonLd: [
      eventDetailJsonLd(event, venue, artist, canonical, description),
      ...[faqJsonLd(faqItems)].filter((x): x is Record<string, unknown> => !!x),
    ],
    body,
    pageType: isPast ? 'event_past' : 'event',
    image: event.image_url ?? artist?.image_url ?? venue?.image_url,
    ctaHref: appLink(`event=${event.id}`, 'event'),
  });
}

/** AI-drafted, admin-approved guide / brand / comparison page. bodyHtml is pre-rendered. */
export function renderContentPage(input: {
  type: ContentType;
  slug: string;
  title: string;
  metaDescription: string;
  summary: string;
  bodyHtml: string;
  faq: FaqItem[];
  publishedAt: string | null;
  updatedAt: string;
  related: LinkItem[];
  indexable: boolean;
}): string {
  const canonical = contentUrl(input.type, input.slug);
  const sectionUrl = `${GETSYNTH_ORIGIN}/guides`;
  const updated = new Date(input.updatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const body = `<article>
<h1>${escapeHtml(input.title)}</h1>
<p class="byline">By the Synth team · Updated ${escapeHtml(updated)}</p>
<p class="summary">${escapeHtml(input.summary)}</p>
${input.bodyHtml}
</article>
${faqHtml(input.faq)}
${linkListHtml('Keep reading', input.related)}`;
  const organization = { '@type': 'Organization', name: 'Synth', url: `${GETSYNTH_ORIGIN}/` };
  return renderPage({
    title: `${input.title} | Synth`,
    description: input.metaDescription,
    canonical,
    indexable: input.indexable,
    breadcrumbs: [
      { name: 'Synth', url: `${GETSYNTH_ORIGIN}/` },
      { name: CONTENT_SECTION[input.type], url: sectionUrl },
      { name: input.title, url: canonical },
    ],
    jsonLd: [
      {
        '@type': 'Article',
        headline: input.title,
        description: input.metaDescription,
        url: canonical,
        mainEntityOfPage: canonical,
        ...(input.publishedAt ? { datePublished: input.publishedAt } : {}),
        dateModified: input.updatedAt,
        author: organization,
        publisher: organization,
      },
      ...[faqJsonLd(input.faq)].filter((x): x is Record<string, unknown> => !!x),
    ],
    body,
    pageType: input.type,
    ogType: 'article',
    ctaHref: appLink('', `${input.type}_${input.slug}`.slice(0, 80)),
  });
}

export function renderGuidesIndex(input: {
  items: Array<{ type: ContentType; slug: string; title: string; summary: string }>;
  cityLinks: LinkItem[];
}): string {
  const canonical = `${GETSYNTH_ORIGIN}/guides`;
  const section = (type: ContentType, heading: string) => {
    const rows = input.items.filter((i) => i.type === type);
    if (rows.length === 0) return '';
    return `<h2>${escapeHtml(heading)}</h2>
<ul class="links">${rows
      .map((r) => `<li><a href="${escapeHtml(contentUrl(r.type, r.slug))}">${escapeHtml(r.title)}</a><br><span class="muted">${escapeHtml(r.summary)}</span></li>`)
      .join('')}</ul>`;
  };
  const body = `<h1>Synth guides</h1>
<p class="summary">Practical guides to live music in Washington, DC: finding people to go with, picking venues, and getting the most out of a night out.</p>
${section('guide', 'Guides')}
${section('brand', 'About Synth')}
${section('comparison', 'Comparisons')}
${linkListHtml('Browse concerts', input.cityLinks)}`;
  return renderPage({
    title: 'Live Music Guides for Washington, DC | Synth',
    description: 'Guides to concerts in Washington, DC: going solo, meeting people through music, venues, and more.',
    canonical,
    indexable: true,
    breadcrumbs: [{ name: 'Synth', url: `${GETSYNTH_ORIGIN}/` }, { name: 'Guides', url: canonical }],
    jsonLd: [
      {
        '@type': 'CollectionPage',
        name: 'Synth guides',
        url: canonical,
        hasPart: input.items.slice(0, 50).map((i) => ({ '@type': 'Article', headline: i.title, url: contentUrl(i.type, i.slug) })),
      },
    ],
    body,
    pageType: 'guides_index',
    ctaHref: appLink('', 'guides_index'),
  });
}

/** llms.txt (https://llmstxt.org): a plain map of the pages AI assistants should read. */
export function renderLlmsTxt(input: {
  content: Array<{ type: ContentType; slug: string; title: string; summary: string }>;
  cityLinks: LinkItem[];
  venues: LinkItem[];
}): string {
  const line = (l: LinkItem, note?: string) => `- [${l.title}](${l.url})${note ? `: ${note}` : ''}`;
  const byType = (type: ContentType) =>
    input.content.filter((c) => c.type === type).map((c) => line({ title: c.title, url: contentUrl(c.type, c.slug) }, c.summary));
  const sections: string[] = [
    '# Synth',
    '',
    '> Synth is a social app for live music. It shows upcoming concerts, who else is interested in or going to each show, and helps people find others to go with, so nobody has to go alone. Available on iPhone and the web.',
    '',
    'Synth combines concert discovery (event data powered by JamBase) with a social layer: members mark shows they are interested in or going to, see others going, match with people who share their music taste, message them, and review shows afterward. Synth is piloting in Washington, DC.',
    '',
    '## Product',
    '',
    line({ title: 'Synth', url: `${GETSYNTH_ORIGIN}/` }, 'What Synth is and how it works'),
    line({ title: 'Synth web app', url: `${JOIN_ORIGIN}/` }, 'Discover concerts and find people to go with'),
    line({ title: 'Synth on the App Store', url: APP_STORE_URL }, 'iPhone app'),
  ];
  const brand = byType('brand');
  if (brand.length) sections.push('', '## About Synth', '', ...brand);
  const guides = byType('guide');
  if (guides.length) sections.push('', '## Guides', '', ...guides);
  const comparisons = byType('comparison');
  if (comparisons.length) sections.push('', '## Comparisons', '', ...comparisons);
  sections.push('', '## Concert listings', '', ...input.cityLinks.map((l) => line(l)));
  if (input.venues.length) sections.push('', '## Venues', '', ...input.venues.map((l) => line(l)));
  return `${sections.join('\n')}\n`;
}

export function renderNotFound(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | Synth</title></head><body style="font-family:system-ui,sans-serif;padding:24px"><h1>Page not found</h1><p><a href="${GETSYNTH_ORIGIN}/">Go to Synth</a></p></body></html>`;
}

export function renderSitemap(urls: Array<string | { loc: string; lastmod?: string | null }>): string {
  const entries = urls
    .map((entry) => {
      const { loc, lastmod } = typeof entry === 'string' ? { loc: entry, lastmod: null } : entry;
      const date = lastmod ? lastmod.slice(0, 10) : '';
      return `  <url><loc>${escapeHtml(loc)}</loc>${/^\d{4}-\d{2}-\d{2}$/.test(date) ? `<lastmod>${date}</lastmod>` : ''}</url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;
}

export { venueUrl, artistUrl };
