/**
 * HTML templates for the public SEO pages (DC pilot): city hub, venue, artist, sitemap.
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
const APP_STORE_URL = 'https://apps.apple.com/us/app/synth-for-live-music-lovers/id6757408095';
const GA4_ID = 'G-9T0MS9F1D3';
// shortcut: every event time is shown in Eastern time, which is right for the DC pilot only.
const DISPLAY_TIME_ZONE = 'America/New_York';

export interface SeoEvent {
  id: string;
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

function eventListHtml(events: SeoEvent[], show: 'venue' | 'artist' | 'both'): string {
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
  <div class="what">${escapeHtml(event.title ?? event.artist?.name ?? 'Live music')}</div>
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
}

export function renderPage(input: PageInput): string {
  const robots = input.indexable ? 'index, follow' : 'noindex, follow';
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
<meta property="og:type" content="website">
<meta property="og:site_name" content="Synth">
<meta property="og:title" content="${escapeHtml(input.title)}">
<meta property="og:description" content="${escapeHtml(input.description)}">
<meta property="og:url" content="${escapeHtml(input.canonical)}">
<meta name="twitter:card" content="summary">
${jsonLdScript(breadcrumbJsonLd(input.breadcrumbs))}
${input.jsonLd.map(jsonLdScript).join('\n')}
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
</style>
</head>
<body>
<header class="site"><a class="brand" href="${GETSYNTH_ORIGIN}/">Synth</a><a href="${escapeHtml(input.ctaHref)}" data-track="open_in_synth">Open in Synth</a></header>
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
  const faq =
    view.kind === 'all'
      ? `<h2>Questions</h2>
<h3>How many concerts are coming up in ${escapeHtml(cityName)}?</h3>
<p>Synth lists ${active} upcoming concerts in ${escapeHtml(cityName)} right now.</p>
${busiest.length ? `<h3>Which ${escapeHtml(cityName)} venues have the most shows?</h3><p>${escapeHtml(busiest.join(', '))}.</p>` : ''}
<h3>How can I find people to go to concerts with in ${escapeHtml(cityName)}?</h3>
<p>On Synth you can see who else is interested in a show, match with people who like the same music, and plan to go together.</p>`
      : `<h2>Find people to go with</h2>
<p>On Synth you can see who else is interested in a show, match with people who like the same music, and plan to go together.</p>`;

  const body = `<h1>${escapeHtml(heading)}</h1>
<p class="summary">${escapeHtml(summary)}</p>
${navLinks.length ? `<ul class="chips">${navLinks.join('')}</ul>` : ''}
<h2>Next up</h2>
${eventListHtml(events.slice(0, NEXT_UP), 'both')}
${seeAll}
${venues.length ? `<h2>Browse by venue</h2>\n${byVenue}` : ''}
${byArtist ? `<h2>Browse by artist</h2>\n${byArtist}` : ''}
${faq}`;

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
    ],
    body,
    ctaHref: appLink('', view.kind === 'all' ? `city_${citySlug}` : `city_${citySlug}_${view.kind === 'weekend' ? 'weekend' : view.slug}`),
  });
}

export function renderVenuePage(input: { venue: SeoVenue; events: SeoEvent[]; total: number; indexable: boolean }): string {
  const { venue } = input;
  const canonical = venueUrl(venue.slug);
  const place = [venue.city, venue.state].filter(Boolean).join(', ');
  const address = [venue.street_address, place].filter(Boolean).join(', ');
  const summary = `${venue.name}${place ? ` in ${place}` : ''} has ${input.total} upcoming shows listed on Synth.`;
  const body = `<h1>${escapeHtml(venue.name)}</h1>
${address ? `<p class="muted">${escapeHtml(address)}</p>` : ''}
<p class="summary">${escapeHtml(summary)}</p>
<h2>Upcoming shows at ${escapeHtml(venue.name)}</h2>
${eventListHtml(input.events, 'artist')}`;
  return renderPage({
    title: `${venue.name}${place ? `, ${place}` : ''} | Upcoming Concerts | Synth`,
    description: `Upcoming concerts at ${venue.name}${place ? ` in ${place}` : ''}: dates, lineups and tickets.`,
    canonical,
    indexable: input.indexable,
    breadcrumbs: [
      { name: 'Synth', url: `${GETSYNTH_ORIGIN}/` },
      { name: 'Concerts in Washington, DC', url: `${GETSYNTH_ORIGIN}/concerts/washington-dc` },
      { name: venue.name, url: canonical },
    ],
    jsonLd: [
      {
        '@type': 'MusicVenue',
        name: venue.name,
        url: canonical,
        address: {
          '@type': 'PostalAddress',
          streetAddress: venue.street_address ?? undefined,
          addressLocality: venue.city ?? undefined,
          addressRegion: venue.state ?? undefined,
        },
        event: input.events.slice(0, 20).map(eventJsonLd),
      },
    ],
    body,
    ctaHref: appLink(`venue=${venue.id}`, 'venue'),
  });
}

export function renderArtistPage(input: { artist: SeoArtist; events: SeoEvent[]; total: number; indexable: boolean }): string {
  const { artist } = input;
  const canonical = artistUrl(artist.slug);
  const genres = (artist.genres ?? []).filter(Boolean).slice(0, 6);
  const summary = `${artist.name} has ${input.total} upcoming shows listed on Synth.`;
  const body = `<h1>${escapeHtml(artist.name)}</h1>
${genres.length ? `<ul class="chips">${genres.map((g) => `<li>${escapeHtml(g)}</li>`).join('')}</ul>` : ''}
<p class="summary">${escapeHtml(summary)}</p>
<h2>${escapeHtml(artist.name)} tour dates</h2>
${eventListHtml(input.events, 'venue')}`;
  return renderPage({
    title: `${artist.name} Tour Dates & Tickets | Synth`,
    description: `Upcoming ${artist.name} concerts: tour dates, venues and tickets, plus people to go with on Synth.`,
    canonical,
    indexable: input.indexable,
    breadcrumbs: [
      { name: 'Synth', url: `${GETSYNTH_ORIGIN}/` },
      { name: artist.name, url: canonical },
    ],
    jsonLd: [
      {
        '@type': 'MusicGroup',
        name: artist.name,
        url: canonical,
        ...(genres.length ? { genre: genres } : {}),
        event: input.events.slice(0, 20).map(eventJsonLd),
      },
    ],
    body,
    ctaHref: appLink(`artist=${artist.id}`, 'artist'),
  });
}

export function renderNotFound(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | Synth</title></head><body style="font-family:system-ui,sans-serif;padding:24px"><h1>Page not found</h1><p><a href="${GETSYNTH_ORIGIN}/">Go to Synth</a></p></body></html>`;
}

export function renderSitemap(urls: string[]): string {
  const entries = urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;
}

export { venueUrl, artistUrl };
