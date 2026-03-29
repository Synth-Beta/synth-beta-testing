export type EventStatus = 'upcoming' | 'past';

export const getEventStatus = (eventDate: string | Date): EventStatus => {
    const eventDateTime = new Date(eventDate);
    const now = new Date();
    const eventDateOnly = new Date(eventDateTime.getFullYear(), eventDateTime.getMonth(), eventDateTime.getDate());
    const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return eventDateOnly >= todayOnly ? 'upcoming' : 'past';
};

export const isEventPast = (eventDate: string | Date): boolean => getEventStatus(eventDate) === 'past';
