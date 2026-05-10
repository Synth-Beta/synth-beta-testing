export type EventStatus = 'upcoming' | 'past';

export const getEventStatus = (eventDate: string | Date): EventStatus => {
    const eventDateTime = new Date(eventDate);
    const now = new Date();
    const eventDateOnly = new Date(eventDateTime.getFullYear(), eventDateTime.getMonth(), eventDateTime.getDate());
    const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return eventDateOnly >= todayOnly ? 'upcoming' : 'past';
};

export const isEventPast = (eventDate: string | Date): boolean => getEventStatus(eventDate) === 'past';

/** Matches web ProfileView interested list: ascending by date within Upcoming vs Past buckets. */
export function filterInterestedRowsForSegment<T extends { event_date?: string | null }>(
    rows: T[],
    upcoming: boolean
): T[] {
    const filtered = rows.filter((r) => {
        const d = r.event_date;
        if (d == null || String(d).trim() === '') return upcoming;
        return upcoming ? !isEventPast(String(d)) : isEventPast(String(d));
    });
    return [...filtered].sort(
        (a, b) => new Date(String(a.event_date ?? 0)).getTime() - new Date(String(b.event_date ?? 0)).getTime()
    );
}
