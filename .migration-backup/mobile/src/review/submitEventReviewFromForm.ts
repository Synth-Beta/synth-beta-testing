import { supabase } from '../integrations/supabase/client';
import {
    EventReviewSubmitService,
    type ReviewData,
    type UserReview,
} from '../services/eventReviewSubmitService';
import type { ReviewFormData } from '../hooks/useReviewForm';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(value?: string | null): boolean {
    return typeof value === 'string' && UUID_REGEX.test(value);
}

async function resolveArtistProfileId(formData: ReviewFormData): Promise<string | undefined> {
    const artistCandidate = formData.selectedArtist;
    if (!artistCandidate) return undefined;
    if (artistCandidate.is_from_database && isValidUUID(artistCandidate.id)) {
        return artistCandidate.id;
    }
    if (artistCandidate.identifier) {
        const { data } = await supabase
            .from('artists')
            .select('id')
            .eq('identifier', artistCandidate.identifier)
            .limit(1)
            .maybeSingle();
        if (data?.id) return data.id;
    }
    if (artistCandidate.name) {
        const { data } = await supabase
            .from('artists')
            .select('id')
            .ilike('name', artistCandidate.name)
            .limit(1)
            .maybeSingle();
        if (data?.id) return data.id;
    }
    return undefined;
}

async function resolveVenueId(formData: ReviewFormData): Promise<string | undefined> {
    let venueId: string | undefined = formData.selectedVenue?.is_from_database ? formData.selectedVenue.id : undefined;
    if (!venueId && formData.selectedVenue) {
        try {
            const candidateIdentifier = formData.selectedVenue.identifier;
            const idLooksLikeUuid =
                typeof candidateIdentifier === 'string' && isValidUUID(candidateIdentifier);
            let foundId: string | undefined;
            if (idLooksLikeUuid) {
                const sel = await supabase.from('venues').select('id').eq('identifier', candidateIdentifier!).limit(1);
                foundId = Array.isArray(sel.data) && sel.data.length > 0 ? (sel.data[0] as any).id : undefined;
            }
            if (foundId) venueId = foundId;
            else {
                const byName = await supabase
                    .from('venues')
                    .select('id')
                    .ilike('name', `%${formData.selectedVenue.name}%`)
                    .limit(1);
                foundId = Array.isArray(byName.data) && byName.data.length > 0 ? (byName.data[0] as any).id : undefined;
                if (foundId) venueId = foundId;
            }
        } catch {
            /* non-fatal */
        }
    }
    if (venueId && !isValidUUID(venueId)) return undefined;
    return venueId;
}

export async function submitEventReviewFromForm(
    userId: string,
    formData: ReviewFormData,
    currentFlow: 'quick' | 'standard' | 'detailed' | null
): Promise<{ ok: true; eventId?: string; submittedReview?: UserReview } | { ok: false; message: string }> {
    const flow = currentFlow || 'detailed';

    let decimalAverage: number | undefined;
    if (flow === 'quick') {
        decimalAverage =
            typeof formData.rating === 'number' && formData.rating > 0 ? formData.rating : undefined;
    } else if (flow === 'standard') {
        const standardRatings = [formData.artistPerformanceRating, formData.venueRating].filter(
            (r): r is number => typeof r === 'number' && r > 0
        );
        decimalAverage =
            standardRatings.length > 0
                ? Number((standardRatings.reduce((s, r) => s + r, 0) / standardRatings.length).toFixed(1))
                : typeof formData.rating === 'number' && formData.rating > 0
                  ? formData.rating
                  : undefined;
    } else {
        const categoryRatings = [
            formData.artistPerformanceRating,
            formData.productionRating,
            formData.venueRating,
            formData.locationRating,
            formData.valueRating,
        ].filter((r): r is number => typeof r === 'number' && r > 0);
        decimalAverage =
            categoryRatings.length > 0
                ? Number((categoryRatings.reduce((s, r) => s + r, 0) / categoryRatings.length).toFixed(1))
                : typeof formData.rating === 'number' && formData.rating > 0
                  ? formData.rating
                  : undefined;
    }

    const ticketPrice = formData.ticketPricePaid ? Number(formData.ticketPricePaid) : undefined;

    let artistPerfRating: number | undefined;
    if (flow === 'quick') {
        artistPerfRating =
            typeof decimalAverage === 'number' && decimalAverage > 0
                ? Number(decimalAverage.toFixed(1))
                : undefined;
    } else {
        artistPerfRating =
            typeof formData.artistPerformanceRating === 'number' && formData.artistPerformanceRating > 0
                ? Number(formData.artistPerformanceRating.toFixed(1))
                : undefined;
    }

    const prodRating =
        typeof formData.productionRating === 'number' && formData.productionRating > 0
            ? Number(formData.productionRating.toFixed(1))
            : undefined;
    const venueRatingVal =
        typeof formData.venueRating === 'number' && formData.venueRating > 0
            ? Number(formData.venueRating.toFixed(1))
            : undefined;
    const locationRatingVal =
        typeof formData.locationRating === 'number' && formData.locationRating > 0
            ? Number(formData.locationRating.toFixed(1))
            : undefined;
    const valueRatingVal =
        typeof formData.valueRating === 'number' && formData.valueRating > 0
            ? Number(formData.valueRating.toFixed(1))
            : undefined;

    const reviewData: ReviewData = {
        review_type: 'event',
        rating: typeof decimalAverage === 'number' && decimalAverage > 0 ? decimalAverage : undefined,
        artist_performance_rating: artistPerfRating,
        production_rating: prodRating,
        venue_rating: venueRatingVal,
        location_rating: locationRatingVal,
        value_rating: valueRatingVal,
        artist_performance_feedback: formData.artistPerformanceFeedback.trim() || undefined,
        production_feedback: formData.productionFeedback.trim() || undefined,
        venue_feedback: formData.venueFeedback.trim() || undefined,
        location_feedback: formData.locationFeedback.trim() || undefined,
        value_feedback: formData.valueFeedback.trim() || undefined,
        ticket_price_paid: typeof ticketPrice === 'number' && !Number.isNaN(ticketPrice) ? ticketPrice : undefined,
        review_text: formData.reviewText.trim() || undefined,
        photos: formData.photos?.length ? formData.photos : undefined,
        videos: formData.videos?.length ? formData.videos : undefined,
        setlist: formData.selectedSetlist ?? undefined,
        custom_setlist:
            formData.customSetlists && formData.customSetlists.length > 0
                ? (formData.customSetlists as any)
                : undefined,
        is_public: formData.isPublic,
        attendees: formData.attendees?.length ? formData.attendees : undefined,
        met_on_synth: formData.metOnSynth,
    };

    let safeArtistId = await resolveArtistProfileId(formData);
    let safeVenueId = await resolveVenueId(formData);
    let userCreatedArtistId: string | undefined;
    let userCreatedVenueId: string | undefined;

    // If catalog lookup failed but we have a name, create a user-created entity as fallback
    if (!safeArtistId && formData.selectedArtist?.name) {
        try {
            userCreatedArtistId = await EventReviewSubmitService.createUserCreatedArtist(
                userId,
                formData.selectedArtist.name,
                null
            );
        } catch {
            // fall through to final guard below
        }
    }
    if (!safeVenueId && formData.selectedVenue?.name) {
        try {
            userCreatedVenueId = await EventReviewSubmitService.createUserCreatedVenue(
                userId,
                formData.selectedVenue.name,
                null
            );
        } catch {
            // fall through to final guard below
        }
    }

    if (!safeArtistId && !userCreatedArtistId) {
        return {
            ok: false,
            message: 'Could not find or create artist. Please pick from search results.',
        };
    }
    if (!safeVenueId && !userCreatedVenueId) {
        return {
            ok: false,
            message: 'Could not find or create venue. Please pick from search results.',
        };
    }

    let eventDateForReview: Date;
    if (formData.eventDate && formData.eventDate.trim() !== '') {
        const dateObj = new Date(formData.eventDate + 'T00:00:00Z');
        eventDateForReview = !Number.isNaN(dateObj.getTime()) ? dateObj : new Date();
    } else {
        eventDateForReview = new Date();
    }

    try {
        const review = await EventReviewSubmitService.setEventReview(
            userId,
            undefined,
            { ...reviewData, Event_date: eventDateForReview },
            safeVenueId,
            safeArtistId,
            userCreatedArtistId,
            userCreatedVenueId
        );
        const eventId =
            review && typeof (review as { event_id?: string }).event_id === 'string'
                ? (review as { event_id?: string }).event_id
                : undefined;
        return { ok: true, eventId, submittedReview: review as UserReview | undefined };
    } catch (e: any) {
        const message = e?.message || 'Could not save review';
        return { ok: false, message };
    }
}
