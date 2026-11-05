/**
 * Run: node --experimental-strip-types --test packages/synth-shared/src/googleCalendar.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGoogleCalendarLocation,
  buildGoogleCalendarTitle,
  buildGoogleCalendarUrl,
  isDateOnlyEventDate,
  GOOGLE_CALENDAR_DEFAULT_DURATION_MS,
} from './googleCalendar.ts';

const SITE = 'https://join.getsynth.app';

test('title avoids duplicating artist when already present', () => {
  assert.equal(buildGoogleCalendarTitle('Weyes Blood', 'Weyes Blood'), 'Weyes Blood');
  assert.equal(buildGoogleCalendarTitle('Weyes Blood', 'Weyes Blood at 9:30 Club'), 'Weyes Blood at 9:30 Club');
  assert.equal(buildGoogleCalendarTitle('Weyes Blood', 'And in the Darkness'), 'Weyes Blood – And in the Darkness');
  assert.equal(buildGoogleCalendarTitle('', 'Solo Show'), 'Solo Show');
  assert.equal(buildGoogleCalendarTitle('Artist', ''), 'Artist');
});

test('location joins available venue parts and tolerates gaps', () => {
  assert.equal(
    buildGoogleCalendarLocation({
      venueName: '9:30 Club',
      venueAddress: '815 V St NW',
      venueCity: 'Washington',
      venueState: 'DC',
    }),
    '9:30 Club, 815 V St NW, Washington, DC'
  );
  assert.equal(
    buildGoogleCalendarLocation({ venueName: 'Venue', venueCity: 'Austin', venueState: 'TX' }),
    'Venue, Austin, TX'
  );
  assert.equal(buildGoogleCalendarLocation({}), '');
});

test('date-only detection matches YYYY-MM-DD convention', () => {
  assert.equal(isDateOnlyEventDate('2026-11-15'), true);
  assert.equal(isDateOnlyEventDate('2026-11-15T20:00:00-05:00'), false);
  assert.equal(isDateOnlyEventDate('2026-11-16T01:00:00.000Z'), false);
  assert.equal(isDateOnlyEventDate(''), true);
});

test('timed event with venue timezone keeps local wall clock (no day shift)', () => {
  // 8pm Eastern on Nov 15 = 01:00 UTC Nov 16
  const result = buildGoogleCalendarUrl({
    id: 'evt-1',
    title: 'And in the Darkness',
    artistName: 'Weyes Blood',
    eventDate: '2026-11-16T01:00:00.000Z',
    venueTimezone: 'America/New_York',
    venueName: '9:30 Club',
    venueCity: 'Washington',
    venueState: 'DC',
    siteUrl: SITE,
  });
  assert.ok(result);
  assert.equal(result!.allDay, false);
  assert.equal(result!.ctz, 'America/New_York');
  assert.match(result!.dates, /^20261115T200000\/20261115T220000$/);
  assert.equal(result!.text, 'Weyes Blood – And in the Darkness');
  assert.match(result!.location, /9:30 Club/);
  assert.match(result!.details, /View on Synth:/);
  assert.match(result!.details, /event=evt-1/);

  const url = new URL(result!.url);
  assert.equal(url.origin + url.pathname, 'https://calendar.google.com/calendar/r/eventedit');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('text'), 'Weyes Blood – And in the Darkness');
  assert.equal(url.searchParams.get('ctz'), 'America/New_York');
  assert.equal(url.searchParams.get('dates'), '20261115T200000/20261115T220000');
});

test('Pacific near-midnight start stays on the venue-local date', () => {
  // 11:30pm PT Nov 14 = 07:30 UTC Nov 15
  const result = buildGoogleCalendarUrl({
    id: 'evt-midnight',
    title: 'Late Set',
    artistName: 'Local Band',
    eventDate: '2026-11-15T07:30:00.000Z',
    venueTimezone: 'America/Los_Angeles',
    siteUrl: SITE,
  });
  assert.ok(result);
  assert.equal(result!.dates, '20261114T233000/20261115T013000');
  assert.equal(result!.ctz, 'America/Los_Angeles');
});

test('without timezone uses UTC Z compact form', () => {
  const result = buildGoogleCalendarUrl({
    id: 'evt-2',
    title: 'Show',
    artistName: 'Band',
    eventDate: '2026-11-16T01:00:00.000Z',
    siteUrl: SITE,
  });
  assert.ok(result);
  assert.equal(result!.ctz, undefined);
  assert.equal(result!.dates, '20261116T010000Z/20261116T030000Z');
  const endDelta =
    Date.parse('2026-11-16T03:00:00.000Z') - Date.parse('2026-11-16T01:00:00.000Z');
  assert.equal(endDelta, GOOGLE_CALENDAR_DEFAULT_DURATION_MS);
});

test('explicit end time is preferred over the two-hour placeholder', () => {
  const result = buildGoogleCalendarUrl({
    id: 'evt-3',
    title: 'Show',
    artistName: 'Band',
    eventDate: '2026-11-16T01:00:00.000Z',
    endDate: '2026-11-16T04:30:00.000Z',
    siteUrl: SITE,
  });
  assert.ok(result);
  assert.equal(result!.dates, '20261116T010000Z/20261116T043000Z');
});

test('date-only events become all-day without inventing a start time', () => {
  const result = buildGoogleCalendarUrl({
    id: 'evt-4',
    title: 'Festival Day',
    artistName: 'Various',
    eventDate: '2026-07-04',
    siteUrl: SITE,
  });
  assert.ok(result);
  assert.equal(result!.allDay, true);
  assert.equal(result!.dates, '20260704/20260705');
  assert.equal(result!.ctz, undefined);
});

test('multi-day all-day events use exclusive end date', () => {
  const result = buildGoogleCalendarUrl({
    id: 'evt-5',
    title: 'Weekend Fest',
    artistName: 'Various',
    eventDate: '2026-07-04',
    endDate: '2026-07-06',
    siteUrl: SITE,
  });
  assert.ok(result);
  assert.equal(result!.allDay, true);
  assert.equal(result!.dates, '20260704/20260706');
});

test('missing venue still builds a usable URL', () => {
  const result = buildGoogleCalendarUrl({
    id: 'evt-6',
    title: 'TBA Venue Night',
    artistName: 'Band',
    eventDate: '2026-12-01T02:00:00.000Z',
    siteUrl: SITE,
  });
  assert.ok(result);
  assert.equal(result!.location, '');
  assert.equal(new URL(result!.url).searchParams.has('location'), false);
});

test('invalid or missing event date returns null', () => {
  assert.equal(
    buildGoogleCalendarUrl({ id: 'x', eventDate: '', siteUrl: SITE }),
    null
  );
  assert.equal(
    buildGoogleCalendarUrl({ id: 'x', eventDate: 'not-a-date', siteUrl: SITE }),
    null
  );
});

test('URL parameters are encoded', () => {
  const result = buildGoogleCalendarUrl({
    id: 'evt-7',
    title: 'Rock & Roll',
    artistName: 'AC/DC',
    eventDate: '2026-08-01T00:00:00.000Z',
    venueName: 'Madison Square Garden',
    venueAddress: '4 Pennsylvania Plaza',
    venueCity: 'New York',
    venueState: 'NY',
    description: 'Lineup: A & B\nDoors open early',
    siteUrl: SITE,
  });
  assert.ok(result);
  assert.match(result!.url, /text=AC%2FDC/);
  assert.match(result!.url, /Rock%20%26%20Roll|Rock\+%26\+Roll/);
  assert.match(result!.url, /location=Madison/);
});
