/**
 * Text for share link previews (iMessage / WhatsApp bubble + /api/og poster).
 * Pure and dependency-free so both the Node page (api/share.ts) and the Edge
 * image function (api/og.ts) can import it.
 */

/** 0–5 in half steps as five symbols, e.g. 4.5 → "★★★★½". */
export function starRating(score: number): string {
  const s = Math.round(Math.min(5, Math.max(0, score)) * 2) / 2;
  const full = Math.floor(s);
  const half = s - full >= 0.5 ? 1 : 0;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - half);
}

export function truncateQuote(text: string | null | undefined, max = 90): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * "Sat, Nov 8". Events carry no venue timezone; US Eastern keeps US evening
 * shows on the right day where UTC would roll them to the next one.
 */
export function formatShowDate(iso: string | null | undefined, timeZone = 'America/New_York'): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone });
}

type Bubble = { title: string; description: string };

export function eventBubble(e: {
  artist?: string;
  venue?: string;
  city?: string;
  state?: string;
  date?: string | null;
  title?: string | null;
}): Bubble {
  const title =
    e.artist && e.venue ? `${e.artist} at ${e.venue}` : e.artist || e.title || e.venue || 'Live music on Synth';
  const place = [e.city, e.state].filter(Boolean).join(', ');
  const description = [formatShowDate(e.date), place, 'on Synth'].filter(Boolean).join(' · ');
  return { title, description };
}

export function reviewBubble(r: {
  reviewer?: string;
  artist?: string;
  venue?: string;
  date?: string | null;
  rating?: number | null;
  title?: string | null;
}): Bubble {
  const who = r.reviewer || 'Someone';
  const what = r.artist || r.title || 'a show';
  const title =
    typeof r.rating === 'number' && r.rating > 0
      ? `${who} rated ${what} ${starRating(r.rating)}`
      : `${who}'s review of ${what}`;
  const description = [r.venue, formatShowDate(r.date)].filter(Boolean).join(' · ');
  return { title, description };
}
