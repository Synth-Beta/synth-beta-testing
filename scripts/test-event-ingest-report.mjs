/**
 * Formatter checks for the daily JamBase Slack report. Does not post.
 *   node scripts/test-event-ingest-report.mjs
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_HYGIENE_CHANNEL,
  formatIngestFailure,
  formatIngestMissed,
  formatIngestSuccess,
  hygieneChannel,
} from '../api/_lib/eventIngestReport.mjs';

const health = {
  cron_start: '2026-10-22T09:30:00.000Z',
  failed_pages: 0,
  events: {
    created_26h: 12,
    updated_26h: 40,
    latest_updated_at: '2026-10-22T10:15:00.000Z',
    latest_modified_at: '2026-10-22T08:00:00.000Z',
    clean: 100,
    upcoming: 100,
    clean_pct: 100,
    missing: { artist: 0, genres: 0 },
  },
  artists: {
    created_26h: 1,
    updated_26h: 2,
    clean: 10,
    total: 10,
    clean_pct: 100,
    missing: { genres: 0 },
  },
  venues: {
    created_26h: 0,
    updated_26h: 3,
    clean: 8,
    total: 8,
    clean_pct: 100,
    missing: { geo: 0 },
  },
};

const clean = formatIngestSuccess(health, []);
assert.match(clean, /JamBase ingest complete/);
assert.match(clean, /12 new, 40 updated/);
assert.match(clean, /No hygiene errors/);

const dirty = formatIngestSuccess(
  {
    ...health,
    failed_pages: 2,
    events: {
      ...health.events,
      clean: 90,
      upcoming: 112,
      hygiene_upcoming: 100,
      festivals_excluded: 12,
      clean_pct: 90,
      missing: { artist: 4, genres_should_inherit: 6 },
    },
  },
  [{ title: 'Sample Show', issues: ['artist', 'genres_should_inherit'] }],
);
assert.match(dirty, /4 missing artist/);
assert.match(dirty, /6 empty genres an artist could fill/);
assert.match(dirty, /90% \(90 \/ 100\)/);
assert.match(dirty, /Festivals excluded:\* 12/);
assert.match(dirty, /Sample Show/);
assert.doesNotMatch(dirty, /No hygiene errors/);

const missed = formatIngestMissed(health);
assert.match(missed, /did not update the catalog/);
assert.match(missed, /09:30:00 UTC/);

const failed = formatIngestFailure('timeout <db>');
assert.match(failed, /JamBase ingest failed/);
assert.match(failed, /timeout &lt;db&gt;/);

delete process.env.SLACK_ADMIN_BOT_EVENT_HYGIENE_CHANNEL;
assert.equal(hygieneChannel(), DEFAULT_HYGIENE_CHANNEL);
process.env.SLACK_ADMIN_BOT_EVENT_HYGIENE_CHANNEL = 'C0TEST';
assert.equal(hygieneChannel(), 'C0TEST');

console.log('event ingest report formatter ok');
