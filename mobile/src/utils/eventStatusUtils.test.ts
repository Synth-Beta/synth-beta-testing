/**
 * Interested list ordering must match web ProfileView: `going` leads the
 * section, then soonest first. The service already sorts going-first, but this
 * segment filter re-sorts, so the ordering has to be re-applied here or the
 * profile tab silently loses it.
 *
 * Run: npx tsx mobile/src/utils/eventStatusUtils.test.ts
 */

import assert from 'node:assert/strict';
import { filterInterestedRowsForSegment } from './eventStatusUtils';

const future = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString();

const rows = [
    { event_date: future(3), relationship_type: 'interested', id: 'soon-interested' },
    { event_date: future(30), relationship_type: 'going', id: 'far-going' },
    { event_date: future(10), relationship_type: 'going', id: 'near-going' },
    { event_date: future(1), relationship_type: null, id: 'soonest-no-rsvp' },
    { event_date: future(-10), relationship_type: 'going', id: 'past-going' },
];

const upcoming = filterInterestedRowsForSegment(rows, true);
assert.deepEqual(
    upcoming.map(r => r.id),
    ['near-going', 'far-going', 'soonest-no-rsvp', 'soon-interested'],
    'going first, then soonest first within each group'
);

const past = filterInterestedRowsForSegment(rows, false);
assert.deepEqual(past.map(r => r.id), ['past-going'], 'past bucket keeps its own segment');

console.log('eventStatusUtils: OK');
