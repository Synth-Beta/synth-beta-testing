import { isEventUpcomingLocalDay } from './localYmd';

export type EventStatus = 'upcoming' | 'past';

export const getEventStatus = (eventDate: string | Date): EventStatus => {
    const raw = typeof eventDate === 'string' ? eventDate : eventDate.toISOString();
    return isEventUpcomingLocalDay(raw) ? 'upcoming' : 'past';
};

export const isEventPast = (eventDate: string | Date): boolean => getEventStatus(eventDate) === 'past';

function eventDateForStatus(d: string | null | undefined): string {
    if (d == null || String(d).trim() === '') return '';
    return String(d);
}

export const filterEventsByStatus = <T extends { event_date?: string | null }>(
    events: T[],
    status: EventStatus
): T[] =>
    events.filter((event) => getEventStatus(eventDateForStatus(event.event_date)) === status);

export const getUpcomingEvents = <T extends { event_date?: string | null }>(events: T[]): T[] =>
    filterEventsByStatus(events, 'upcoming');

export const getPastEvents = <T extends { event_date?: string | null }>(events: T[]): T[] =>
    filterEventsByStatus(events, 'past');

/**
 * Matches web ProfileView interested list: `going` first — it's the real
 * commitment, so it leads the section — then ascending by date, within the
 * Upcoming vs Past buckets.
 */
export function filterInterestedRowsForSegment<
    T extends { event_date?: string | null; relationship_type?: string | null }
>(rows: T[], upcoming: boolean): T[] {
    const filtered = upcoming ? getUpcomingEvents(rows) : getPastEvents(rows);
    return [...filtered].sort((a, b) => {
        const aGoing = a.relationship_type === 'going' ? 0 : 1;
        const bGoing = b.relationship_type === 'going' ? 0 : 1;
        if (aGoing !== bGoing) return aGoing - bGoing;
        return new Date(String(a.event_date ?? 0)).getTime() - new Date(String(b.event_date ?? 0)).getTime();
    });
}
