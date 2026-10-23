/**
 * Daily JamBase ingest report for Synth Admin Bot.
 * Reads the stored jambase_ingest_snapshot row — no sync-run table.
 * Channel: SLACK_ADMIN_BOT_EVENT_HYGIENE_CHANNEL, default C0CBGCHC325.
 */

import { createClient } from '@supabase/supabase-js';

export const DEFAULT_HYGIENE_CHANNEL = 'C0CBGCHC325';

const ISSUE_LABELS = {
  artist: 'missing artist',
  venue: 'missing venue',
  title: 'missing name',
  event_date: 'missing start time',
  tickets: 'missing ticket link',
  genres: 'missing genres',
  genres_unresolved: 'genres that do not match the feed',
  genres_should_inherit: 'empty genres an artist could fill',
  name: 'missing name',
  identifier: 'missing JamBase identifier',
};

let postedThisProcess = false;

function escapeSlack(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function count(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function when(value) {
  if (!value) return 'never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

export function hygieneChannel() {
  return process.env.SLACK_ADMIN_BOT_EVENT_HYGIENE_CHANNEL?.trim() || DEFAULT_HYGIENE_CHANNEL;
}

function gapLines(missing, whole) {
  const lines = [];
  for (const [key, value] of Object.entries(missing || {})) {
    const n = Number(value || 0);
    if (n <= 0) continue;
    const label = ISSUE_LABELS[key] || key;
    const pct = whole > 0 ? ` (${((n / whole) * 100).toFixed(1)}%)` : '';
    lines.push(`• ${count(n)} ${label}${pct}`);
  }
  return lines;
}

export function formatIngestSuccess(health, samples = []) {
  const events = health?.events || {};
  const artists = health?.artists || {};
  const venues = health?.venues || {};
  const hygieneUpcoming = Number(events.hygiene_upcoming ?? events.upcoming ?? 0);
  const festivalsExcluded = Number(events.festivals_excluded || 0);
  const eventGaps = gapLines(events.missing, hygieneUpcoming);
  const artistGaps = gapLines(artists.missing, Number(artists.total || 0));
  const venueGaps = gapLines(venues.missing, Number(venues.total || 0));
  const failed = Number(health?.failed_pages || 0);
  const clean = eventGaps.length === 0 && artistGaps.length === 0 && venueGaps.length === 0 && failed === 0;

  const lines = [
    '*JamBase ingest complete*',
    `*Events:* ${count(events.created_26h)} new, ${count(events.updated_26h)} updated in the last 26 hours`,
    `*Artists:* ${count(artists.created_26h)} new, ${count(artists.updated_26h)} updated`,
    `*Venues:* ${count(venues.created_26h)} new, ${count(venues.updated_26h)} updated`,
    `*Last event write:* ${when(events.latest_updated_at)}`,
    `*JamBase watermark:* ${when(events.latest_modified_at)}`,
    `*Unresolved failed pages:* ${count(failed)}`,
    '',
    `*Upcoming events clean:* ${events.clean_pct ?? 0}% (${count(events.clean)} / ${count(hygieneUpcoming)})`,
    `*Artists clean:* ${artists.clean_pct ?? 0}% (${count(artists.clean)} / ${count(artists.total)})`,
    `*Venues clean:* ${venues.clean_pct ?? 0}% (${count(venues.clean)} / ${count(venues.total)})`,
  ];
  if (festivalsExcluded > 0) {
    lines.push(`*Festivals excluded:* ${count(festivalsExcluded)}`);
  }

  if (clean) {
    lines.push('', 'No hygiene errors.');
  } else {
    if (eventGaps.length) lines.push('', '*Event gaps*', ...eventGaps);
    if (artistGaps.length) lines.push('', '*Artist gaps*', ...artistGaps);
    if (venueGaps.length) lines.push('', '*Venue gaps*', ...venueGaps);
    const examples = (samples || []).slice(0, 5);
    if (examples.length) {
      lines.push('', '*Examples*');
      for (const row of examples) {
        const title = escapeSlack(row.title || 'Untitled');
        const issues = (row.issues || []).map((issue) => ISSUE_LABELS[issue] || issue).join(', ');
        lines.push(`• ${title}${issues ? ` — ${escapeSlack(issues)}` : ''}`);
      }
    }
  }

  return lines.join('\n').slice(0, 3900);
}

export function formatIngestFailure(errorText) {
  return [
    '*JamBase ingest failed*',
    `*Error:* ${escapeSlack(errorText || 'unknown error')}`,
  ].join('\n');
}

export function formatIngestMissed(health) {
  const events = health?.events || {};
  const hygieneUpcoming = Number(events.hygiene_upcoming ?? events.upcoming ?? 0);
  return [
    '*JamBase ingest did not update the catalog*',
    `No JamBase event has been updated since ${when(health?.cron_start)}.`,
    `*Last event write:* ${when(events.latest_updated_at)}`,
    `*JamBase watermark:* ${when(events.latest_modified_at)}`,
    `*Unresolved failed pages:* ${count(health?.failed_pages)}`,
    `*Upcoming events clean:* ${events.clean_pct ?? 0}% (${count(events.clean)} / ${count(hygieneUpcoming)})`,
  ].join('\n');
}

function serviceClient() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function fetchIngestHealth() {
  const db = serviceClient();
  if (!db) throw new Error('Supabase service role is not configured');
  const { data, error } = await db.rpc('admin_event_ingest_health');
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchHygieneSamples() {
  const db = serviceClient();
  if (!db) return [];
  const { data, error } = await db.rpc('admin_event_hygiene_samples', { p_limit: 5 });
  if (error) {
    console.warn('[event-ingest-report] samples failed', error.message);
    return [];
  }
  return Array.isArray(data) ? data : [];
}

async function postSlack(text) {
  const token = process.env.SLACK_ADMIN_BOT_TOKEN?.trim();
  const channel = hygieneChannel();
  if (!token) return { ok: false, error: 'SLACK_ADMIN_BOT_TOKEN is not set' };

  const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }),
  });
  const body = await slackRes.json().catch(() => null);
  if (slackRes.ok && body?.ok) return { ok: true, channel };
  return { ok: false, error: body?.error || `Slack HTTP ${slackRes.status}` };
}

/**
 * @param {{ kind: 'success' | 'failure' | 'missed', error?: string, health?: object }} opts
 */
export async function postEventIngestReport(opts) {
  if (postedThisProcess) return { ok: false, error: 'already posted' };
  postedThisProcess = true;

  try {
    let text;
    if (opts.kind === 'failure') {
      text = formatIngestFailure(opts.error);
    } else if (opts.kind === 'missed') {
      text = formatIngestMissed(opts.health || (await fetchIngestHealth()));
    } else {
      try {
        const health = opts.health || (await fetchIngestHealth());
        const samples = await fetchHygieneSamples();
        text = formatIngestSuccess(health, samples);
      } catch (err) {
        text = formatIngestFailure(`Sync finished, but the hygiene report failed: ${err.message}`);
      }
    }

    const posted = await postSlack(text);
    if (!posted.ok) {
      console.warn('[event-ingest-report] Slack post failed', posted.error);
    } else {
      console.log(`[event-ingest-report] posted ${opts.kind} to ${posted.channel}`);
    }
    return posted;
  } catch (err) {
    console.warn('[event-ingest-report] report failed', err.message);
    return { ok: false, error: err.message };
  }
}

/** Missed-run check. Posts only when today's 09:30 UTC window has no event write. */
export async function postMissedIngestIfStale() {
  const health = await fetchIngestHealth();
  if (health?.fresh) return { ok: true, skipped: true, fresh: true };
  const posted = await postEventIngestReport({ kind: 'missed', health });
  return { ...posted, skipped: false, fresh: false };
}
