import type { EventDetail } from '../services/eventService';

/**
 * Format in the venue's zone when known, so a show reads the same wherever the viewer is.
 * An unrecognised zone name throws RangeError; fall back to the device zone.
 */
function withVenueZone<T>(timeZone: string | null | undefined, format: (zone?: string) => T): T {
    if (timeZone) {
        try {
            return format(timeZone);
        } catch {
            // fall through to the device zone
        }
    }
    return format();
}

/** Match web EventDetailsModal.formatDate */
export function formatEventDetailDate(dateString: string | null | undefined, timeZone?: string | null): string {
    if (!dateString) return 'Date TBD';
    const date = new Date(dateString);
    if (!Number.isFinite(date.getTime())) return 'Date TBD';
    return withVenueZone(timeZone, (zone) =>
        date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: zone,
        })
    );
}

/** Match web EventDetailsModal.formatTime */
export function formatEventDetailTime(dateString: string | null | undefined, timeZone?: string | null): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (!Number.isFinite(date.getTime())) return '';
    return withVenueZone(timeZone, (zone) =>
        date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: zone,
        })
    );
}

/** Match web EventDetailsModal.formatDoorsTime */
export function formatDoorsTimeShort(doorsTime: string | null | undefined, timeZone?: string | null): string | null {
    if (!doorsTime) return null;
    const date = new Date(doorsTime);
    if (!Number.isFinite(date.getTime())) return null;
    return withVenueZone(timeZone, (zone) =>
        date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: zone,
        })
    );
}

/** City + state code, e.g. "Washington, DC" */
export function formatCityState(e: { venue_city?: string | null; venue_state?: string | null }): string {
    return [e.venue_city, e.venue_state].filter(Boolean).join(', ');
}

/** Match web getVenueAddress: street, else city/state TBD */
export function venueAddressPrimaryLine(e: EventDetail): string {
    const street = e.venue_address?.trim();
    if (street) return street;
    const parts = [e.venue_city, e.venue_state].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Location TBD';
}

/** Web EventDetailsModal price card logic (simplified string formatting). */
export function formatEventDetailPrice(e: EventDetail): string | null {
    const pr = e.price_range?.trim();
    if (pr) return pr;

    const min = e.price_min;
    const max = e.price_max;
    const cur = e.price_currency || 'USD';

    if (min != null && max != null && max > min) {
        try {
            const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: cur });
            return `${fmt.format(min)} – ${fmt.format(max)}`;
        } catch {
            return `$${min} - $${max}`;
        }
    }
    if (min != null && min >= 0) {
        try {
            const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: cur });
            return `${fmt.format(min)}+`;
        } catch {
            return `$${min}+`;
        }
    }
    if (max != null && max >= 0) {
        try {
            const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: cur });
            return `Up to ${fmt.format(max)}`;
        } catch {
            return `Up to $${max}`;
        }
    }
    return null;
}
