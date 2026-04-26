import React, { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { EventReviewFlow, type ReviewPrefill } from '../src/components/review/EventReviewFlow';

export default function ReviewComposeScreen() {
    const { eventId, prefillArtistId, prefillVenueId, prefillDate } = useLocalSearchParams<{
        eventId?: string;
        prefillArtistId?: string;
        prefillVenueId?: string;
        prefillDate?: string;
    }>();
    const router = useRouter();

    const prefill = useMemo((): ReviewPrefill | null => {
        if (!prefillArtistId && !prefillVenueId && !prefillDate) return null;
        return {
            artistId: prefillArtistId,
            venueId: prefillVenueId,
            eventDate: prefillDate,
        };
    }, [prefillArtistId, prefillVenueId, prefillDate]);

    return (
        <EventReviewFlow
            initialEventId={eventId ?? null}
            prefill={prefill}
            onClose={() => router.back()}
            onSubmitted={(eid, reviewId) => {
                if (reviewId) {
                    router.replace(`/review/${reviewId}` as any);
                } else if (eid) {
                    router.replace(`/event/${eid}` as any);
                } else {
                    router.back();
                }
            }}
        />
    );
}
