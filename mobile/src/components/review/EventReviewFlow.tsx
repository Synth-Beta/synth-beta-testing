import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mobileReviewDraftStorageKey } from '@synth/shared';
import {
    View,
    StyleSheet,
    ScrollView,
    TextInput,
    Pressable,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    FlatList,
    Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { supabase } from '../../integrations/supabase/client';
import {
    useReviewForm,
    REVIEW_FORM_INITIAL_DATA,
    type ReviewFormData,
    type ReviewArtist,
    type ReviewVenue,
} from '../../hooks/useReviewForm';
import { SearchService } from '../../services/searchService';
import { EventService } from '../../services/eventService';
import { isEventPast } from '../../utils/eventStatusUtils';
import { submitEventReviewFromForm } from '../../review/submitEventReviewFromForm';
import { uploadReviewPhotoFromUri } from '../../services/reviewPhotoUpload';
import type { UserReview } from '../../services/eventReviewSubmitService';
import { EventReviewSubmitService } from '../../services/eventReviewSubmitService';

type Flow = 'quick' | 'standard' | 'detailed' | null;

type CategoryConfig = {
    title: string;
    subtitle: string;
    ratingKey: keyof Pick<
        ReviewFormData,
        | 'artistPerformanceRating'
        | 'productionRating'
        | 'venueRating'
        | 'locationRating'
        | 'valueRating'
    >;
    feedbackKey: keyof Pick<
        ReviewFormData,
        | 'artistPerformanceFeedback'
        | 'productionFeedback'
        | 'venueFeedback'
        | 'locationFeedback'
        | 'valueFeedback'
    >;
    suggestions: Array<{ id: string; label: string; description?: string }>;
};

const ARTIST_SUGGESTIONS = [
    { id: 'a1', label: 'Electric energy', description: 'The band fed off the crowd with nonstop energy.' },
    { id: 'a2', label: 'Tight musicianship', description: 'Flawless set and tight transitions all night.' },
    { id: 'a3', label: 'Vocals struggled', description: 'Vocals were off pitch for most of the night.' },
    { id: 'a4', label: 'Short setlist', description: 'Felt too quick—left wanting a few more songs.' },
];
const PRODUCTION_SUGGESTIONS = [
    { id: 'p1', label: 'Insane light show', description: 'Lighting design elevated every drop.' },
    { id: 'p2', label: 'Crystal clear mix', description: 'Sound mix was balanced and immersive.' },
    { id: 'p3', label: 'Feedback issues', description: 'Persistent sound issues distracted from songs.' },
    { id: 'p4', label: 'Stage delays', description: 'Long pauses between songs killed the momentum.' },
];
const VENUE_SUGGESTIONS = [
    { id: 'v1', label: 'Staff was incredible', description: 'Friendly staff kept lines moving smoothly.' },
    { id: 'v2', label: 'Comfortable layout', description: 'Plenty of space and easy sightlines.' },
    { id: 'v3', label: 'Overcrowded', description: 'Packed to the brim with no room to breathe.' },
    { id: 'v4', label: 'Muddy house sound', description: 'Venue acoustics made everything sound muffled.' },
];
const LOCATION_SUGGESTIONS = [
    { id: 'l1', label: 'Easy transit', description: 'Quick rideshare + plenty of parking nearby.' },
    { id: 'l2', label: 'Great pre-show spots', description: 'Awesome food and bars in walking distance.' },
    { id: 'l3', label: 'Nightmare traffic', description: 'Getting there and back took forever.' },
    { id: 'l4', label: 'Felt unsafe', description: 'Area felt sketchy walking back to the car.' },
];
const VALUE_SUGGESTIONS = [
    { id: 'val1', label: 'Worth every dollar', description: 'Totally justified the ticket price.' },
    { id: 'val2', label: 'Steal of a night', description: 'Felt like we paid half of what it was worth.' },
    { id: 'val3', label: 'Overpriced', description: 'Fun night, but tickets were overpriced.' },
    { id: 'val4', label: 'Too many fees', description: 'Fees and merch prices added up fast.' },
];

function getStepLabels(flow: Flow): string[] {
    if (!flow) return ['Select time'];
    switch (flow) {
        case 'quick':
            return ['Select time', 'Event details', 'Quick review', 'Submit'];
        case 'standard':
            return [
                'Select time',
                'Event details',
                'Artist performance',
                'Venue',
                'Review content',
                'Submit',
            ];
        case 'detailed':
            return [
                'Select time',
                'Event details',
                'Artist performance',
                'Production',
                'Venue',
                'Location',
                'Value',
                'Review content',
                'Submit',
            ];
        default:
            return [];
    }
}

const STAR_VALUES = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const;

function StarPicker({
    value,
    onChange,
}: {
    value: number;
    onChange: (v: number) => void;
}) {
    return (
        <View style={styles.starRow}>
            {STAR_VALUES.map((v) => {
                const active = value >= v - 0.01;
                return (
                    <Pressable key={v} onPress={() => onChange(v)} style={styles.starHit}>
                        <SynthText variant="body" style={{ color: active ? '#EAB308' : SynthTokens.colors.neutral400 }}>
                            ★
                        </SynthText>
                    </Pressable>
                );
            })}
        </View>
    );
}

export type ReviewPrefill = {
    artistId?: string;
    venueId?: string;
    eventDate?: string;
};

interface EventReviewFlowProps {
    initialEventId?: string | null;
    prefill?: ReviewPrefill | null;
    onClose: () => void;
    onSubmitted?: (eventIdForReturn?: string) => void;
}

export function EventReviewFlow({ initialEventId, prefill, onClose, onSubmitted }: EventReviewFlowProps) {
    const insets = useSafeAreaInsets();
    const {
        formData,
        errors,
        currentStep,
        currentFlow,
        totalSteps,
        updateFormData,
        nextStep,
        prevStep,
        isLoading,
        setLoading,
        setFormData,
        setStep,
    } = useReviewForm();

    const [userId, setUserId] = useState<string | null>(null);
    const draftChecked = useRef(false);
    const skipDraft = !!(initialEventId || prefill?.artistId || prefill?.venueId || prefill?.eventDate);
    const [previousVenueReview, setPreviousVenueReview] = useState<UserReview | null>(null);
    const [eventQuery, setEventQuery] = useState('');
    const [eventRows, setEventRows] = useState<any[]>([]);
    const [artistQ, setArtistQ] = useState('');
    const [artistRows, setArtistRows] = useState<ReviewArtist[]>([]);
    const [venueQ, setVenueQ] = useState('');
    const [venueRows, setVenueRows] = useState<ReviewVenue[]>([]);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);

    useEffect(() => {
        void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    }, []);

    useEffect(() => {
        if (!prefill) return;
        const run = async () => {
            let artist: ReviewArtist | null = null;
            let venue: ReviewVenue | null = null;
            if (prefill.artistId) {
                const { data: a } = await supabase
                    .from('artists')
                    .select('id, name')
                    .eq('id', prefill.artistId)
                    .maybeSingle();
                if (a?.id && a?.name) {
                    artist = { id: a.id, name: a.name, is_from_database: true };
                } else {
                    artist = { id: prefill.artistId, name: 'Artist', is_from_database: true };
                }
            }
            if (prefill.venueId) {
                const { data: v } = await supabase
                    .from('venues')
                    .select('id, name')
                    .eq('id', prefill.venueId)
                    .maybeSingle();
                if (v?.id && v?.name) {
                    venue = { id: v.id, name: v.name, is_from_database: true };
                } else {
                    venue = { id: prefill.venueId, name: 'Venue', is_from_database: true };
                }
            }
            const dt = prefill.eventDate ? String(prefill.eventDate).split('T')[0] : '';
            if (artist || venue || dt) {
                setFormData({
                    ...(artist ? { selectedArtist: artist } : {}),
                    ...(venue ? { selectedVenue: venue } : {}),
                    ...(dt ? { eventDate: dt } : {}),
                    reviewType: 'event',
                });
            }
        };
        void run();
    }, [prefill, setFormData]);

    useEffect(() => {
        if (!userId || skipDraft || draftChecked.current) return;
        void (async () => {
            draftChecked.current = true;
            try {
                const raw = await AsyncStorage.getItem(mobileReviewDraftStorageKey(userId));
                if (!raw) return;
                const parsed = JSON.parse(raw) as { v?: number; currentStep?: number; formData?: Partial<ReviewFormData> };
                if (parsed.v !== 1 || !parsed.formData) return;
                Alert.alert('Resume draft?', 'You have an unsaved review in progress.', [
                    {
                        text: 'Start fresh',
                        style: 'destructive',
                        onPress: () => void AsyncStorage.removeItem(mobileReviewDraftStorageKey(userId)),
                    },
                    {
                        text: 'Continue',
                        onPress: () => {
                            setFormData({
                                ...REVIEW_FORM_INITIAL_DATA,
                                ...parsed.formData,
                            });
                            if (typeof parsed.currentStep === 'number' && parsed.currentStep >= 1) {
                                setStep(parsed.currentStep);
                            }
                        },
                    },
                ]);
            } catch {
                /* ignore corrupt draft */
            }
        })();
    }, [userId, skipDraft, setFormData, setStep]);

    useEffect(() => {
        if (!userId || skipDraft) return;
        if (currentStep <= 1 && !formData.reviewDuration) return;
        const t = setTimeout(() => {
            const payload = JSON.stringify({
                v: 1 as const,
                currentStep,
                formData,
            });
            void AsyncStorage.setItem(mobileReviewDraftStorageKey(userId), payload);
        }, 700);
        return () => clearTimeout(t);
    }, [userId, skipDraft, currentStep, formData]);

    useEffect(() => {
        if (!initialEventId) return;
        void EventService.getEventById(initialEventId).then((ev) => {
            if (!ev) return;
            const dt = ev.event_date ? String(ev.event_date).split('T')[0] : '';
            const artist: ReviewArtist | null =
                ev.artist_name && ev.artist_id
                    ? { id: ev.artist_id, name: ev.artist_name, is_from_database: true }
                    : ev.artist_name
                      ? { id: `manual-${ev.artist_name}`, name: ev.artist_name, is_from_database: !!ev.artist_id }
                      : null;
            const venue: ReviewVenue | null =
                ev.venue_name && ev.venue_id
                    ? { id: ev.venue_id, name: ev.venue_name, is_from_database: true }
                    : ev.venue_name
                      ? { id: `manual-${ev.venue_name}`, name: ev.venue_name, is_from_database: !!ev.venue_id }
                      : null;
            setFormData({
                selectedArtist: artist,
                selectedVenue: venue,
                eventDate: dt,
                reviewType: 'event',
            });
        });
    }, [initialEventId, setFormData]);

    useEffect(() => {
        const run = async () => {
            if (!userId || !formData.selectedVenue?.is_from_database || !formData.selectedVenue.id) {
                setPreviousVenueReview(null);
                return;
            }
            const vid = formData.selectedVenue.id;
            const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (!uuid.test(vid)) {
                setPreviousVenueReview(null);
                return;
            }
            const prev = await EventReviewSubmitService.getPreviousVenueReview(userId, vid);
            setPreviousVenueReview(prev);
        };
        void run();
    }, [userId, formData.selectedVenue?.id, formData.selectedVenue?.is_from_database]);

    useEffect(() => {
        const t = setTimeout(async () => {
            const q = eventQuery.trim();
            if (q.length < 2) {
                setEventRows([]);
                return;
            }
            const { data, error } = await supabase
                .from('events_with_artist_venue')
                .select(
                    'id, title, artist_name_normalized, venue_name_normalized, event_date, artist_id, venue_id'
                )
                .or(`artist_name_normalized.ilike.%${q}%,title.ilike.%${q}%,venue_name_normalized.ilike.%${q}%`)
                .order('event_date', { ascending: false })
                .limit(50);
            if (error) {
                setEventRows([]);
                return;
            }
            const past = (data || []).filter((e: any) => isEventPast(e.event_date));
            past.sort(
                (a: any, b: any) =>
                    new Date(b.event_date).getTime() - new Date(a.event_date).getTime()
            );
            setEventRows(past);
        }, 320);
        return () => clearTimeout(t);
    }, [eventQuery]);

    useEffect(() => {
        const t = setTimeout(() => {
            void SearchService.searchArtists(artistQ, 25).then((rows) => {
                setArtistRows(
                    rows.map((r) => ({
                        id: r.id,
                        name: r.name,
                        is_from_database: true,
                    }))
                );
            });
        }, 200);
        return () => clearTimeout(t);
    }, [artistQ]);

    useEffect(() => {
        const t = setTimeout(() => {
            void SearchService.searchVenues(venueQ, 25).then((rows) => {
                setVenueRows(
                    rows.map((r) => ({
                        id: r.id,
                        name: r.name,
                        is_from_database: true,
                    }))
                );
            });
        }, 200);
        return () => clearTimeout(t);
    }, [venueQ]);

    const categoryConfigs = useMemo(() => {
        const artistName = formData.selectedArtist?.name;
        const m: Record<number, CategoryConfig> = {
            2: {
                title: 'Artist Performance',
                subtitle: artistName
                    ? `How did ${artistName} deliver live?`
                    : 'How did the artist deliver live?',
                ratingKey: 'artistPerformanceRating',
                feedbackKey: 'artistPerformanceFeedback',
                suggestions: ARTIST_SUGGESTIONS,
            },
            3: {
                title: 'Production Quality',
                subtitle: 'Lights, visuals, sound mix — did production elevate the night?',
                ratingKey: 'productionRating',
                feedbackKey: 'productionFeedback',
                suggestions: PRODUCTION_SUGGESTIONS,
            },
            4: {
                title: 'Venue Experience',
                subtitle: formData.selectedVenue?.name
                    ? `What was ${formData.selectedVenue.name} like?`
                    : 'Staff, comfort, lines, vibe inside the venue.',
                ratingKey: 'venueRating',
                feedbackKey: 'venueFeedback',
                suggestions: VENUE_SUGGESTIONS,
            },
            5: {
                title: 'Location & Logistics',
                subtitle: 'Getting there, parking, transit, nearby spots.',
                ratingKey: 'locationRating',
                feedbackKey: 'locationFeedback',
                suggestions: LOCATION_SUGGESTIONS,
            },
            6: {
                title: 'Value for Ticket Price',
                subtitle: 'Given what you paid, did it feel worth it?',
                ratingKey: 'valueRating',
                feedbackKey: 'valueFeedback',
                suggestions: VALUE_SUGGESTIONS,
            },
        };
        return m;
    }, [formData.selectedArtist?.name, formData.selectedVenue?.name]);

    const applyPastEvent = async (ev: any) => {
        const eventDate = ev?.event_date ? String(ev.event_date).split('T')[0] : '';
        const artistName = ev?.artist_name_normalized || ev?.artist_name;
        const artist: ReviewArtist | null = artistName
            ? {
                  id: ev.artist_id || `manual-${artistName}`,
                  name: artistName,
                  is_from_database: !!ev.artist_id,
              }
            : null;
        let venue: ReviewVenue | null = null;
        const venueName = ev?.venue_name_normalized || ev?.venue_name;
        if (venueName && ev.venue_id) {
            const { data: venueData } = await supabase
                .from('venues')
                .select('id, name, identifier')
                .eq('id', ev.venue_id)
                .single();
            if (venueData) {
                venue = {
                    id: venueData.id,
                    name: venueData.name,
                    identifier: venueData.identifier,
                    is_from_database: true,
                };
            }
        }
        if (!venue && venueName) {
            venue = { id: ev.venue_id || `manual-${venueName}`, name: venueName, is_from_database: !!ev.venue_id };
        }
        setFormData({
            selectedArtist: artist,
            selectedVenue: venue,
            eventDate,
            reviewType: 'event',
        });
        setEventQuery('');
        setEventRows([]);
    };

    const flow = currentFlow || 'detailed';
    const stepLabels = getStepLabels(currentFlow);

    const averageRatingForSummary = useMemo(() => {
        if (flow === 'quick') return formData.rating;
        if (flow === 'standard') {
            if (formData.artistPerformanceRating > 0 && formData.venueRating > 0) {
                return Number(((formData.artistPerformanceRating + formData.venueRating) / 2).toFixed(1));
            }
            return formData.rating;
        }
        const parts = [
            formData.artistPerformanceRating,
            formData.productionRating,
            formData.venueRating,
            formData.locationRating,
            formData.valueRating,
        ].filter((n): n is number => typeof n === 'number' && n > 0);
        if (!parts.length) return formData.rating;
        return Number((parts.reduce((a, b) => a + b, 0) / parts.length).toFixed(1));
    }, [flow, formData]);

    const categoryBreakdown = useMemo(() => {
        if (flow === 'standard') {
            return [
                { label: 'Artist', rating: formData.artistPerformanceRating },
                { label: 'Venue', rating: formData.venueRating },
            ];
        }
        if (flow === 'detailed') {
            return [
                { label: 'Artist', rating: formData.artistPerformanceRating },
                { label: 'Production', rating: formData.productionRating },
                { label: 'Venue', rating: formData.venueRating },
                { label: 'Location', rating: formData.locationRating },
                { label: 'Value', rating: formData.valueRating },
            ];
        }
        return [];
    }, [flow, formData]);

    /** Final step: matches web `PrivacySubmitStep` — summary + public/private choice (not a bare switch). */
    const renderPrivacySubmitSection = () => (
        <View style={styles.section}>
            <SynthText variant="meta" color="brand" style={styles.center}>
                FINAL STEP
            </SynthText>
            <SynthText variant="h2" style={styles.center}>
                Review & share
            </SynthText>
            <SynthText variant="meta" color="secondary" style={[styles.center, styles.mb8]}>
                Take a final look at your ratings and choose who can see your review.
            </SynthText>
            {formData.selectedArtist?.name && formData.selectedVenue?.name ? (
                <SynthText variant="body" style={styles.center}>
                    {formData.selectedArtist.name} @ {formData.selectedVenue.name}
                </SynthText>
            ) : null}
            {formData.eventDate ? (
                <SynthText variant="meta" color="secondary" style={styles.center}>
                    {formData.eventDate}
                </SynthText>
            ) : null}
            <SynthText variant="body" style={[styles.mt12, styles.center]}>
                Overall {averageRatingForSummary.toFixed(1)} / 5
            </SynthText>
            {categoryBreakdown.length > 0 ? (
                <View style={styles.mt8}>
                    {categoryBreakdown.map(c => (
                        <SynthText key={c.label} variant="meta" color="secondary">
                            {c.label}: {c.rating ? c.rating.toFixed(1) : '—'}
                        </SynthText>
                    ))}
                </View>
            ) : null}
            <SynthText variant="body" style={styles.privacySectionTitle}>
                Who can see this review?
            </SynthText>
            <View style={styles.privacyGroup}>
                <Pressable
                    style={[styles.privacyCard, formData.isPublic && styles.privacyCardOn]}
                    onPress={() => updateFormData({ isPublic: true })}
                >
                    <SynthText variant="body" style={styles.privacyCardTitle}>
                        Public
                    </SynthText>
                    <SynthText variant="meta" color="secondary">
                        Everyone can see your review. Help the community decide where to go.
                    </SynthText>
                </Pressable>
                <Pressable
                    style={[styles.privacyCard, !formData.isPublic && styles.privacyCardOn]}
                    onPress={() => updateFormData({ isPublic: false })}
                >
                    <SynthText variant="body" style={styles.privacyCardTitle}>
                        Private
                    </SynthText>
                    <SynthText variant="meta" color="secondary">
                        Only you can see this review. You can always share it later.
                    </SynthText>
                </Pressable>
            </View>
            <SynthText variant="meta" color="secondary" style={[styles.center, styles.mt12]}>
                By submitting, you agree to our terms of service and community guidelines.
            </SynthText>
        </View>
    );

    const handleSubmit = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        const res = await submitEventReviewFromForm(userId, formData, currentFlow);
        setLoading(false);
        if (!res.ok) {
            Alert.alert('Could not save', res.message);
            return;
        }
        void AsyncStorage.removeItem(mobileReviewDraftStorageKey(userId));
        const outEvent = res.eventId ?? initialEventId ?? undefined;
        onSubmitted?.(outEvent);
    }, [userId, formData, currentFlow, setLoading, onSubmitted, initialEventId]);

    const pickPhotos = async () => {
        if (!userId) return;
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
            Alert.alert('Photos', 'Photo access is needed to attach images.');
            return;
        }
        const r = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: true,
            selectionLimit: 5 - formData.photos.length,
            quality: 0.85,
        });
        if (r.canceled || !r.assets?.length) return;
        setUploadingPhoto(true);
        const next = [...formData.photos];
        for (const a of r.assets) {
            if (next.length >= 5) break;
            if (!a.uri) continue;
            const url = await uploadReviewPhotoFromUri(userId!, a.uri);
            if (url) next.push(url);
        }
        setUploadingPhoto(false);
        updateFormData({ photos: next });
    };

    const renderCategory = (config: CategoryConfig, extras?: React.ReactNode) => {
        const rVal = formData[config.ratingKey] as number;
        const fbVal = formData[config.feedbackKey] as string;
        return (
            <View style={styles.section}>
                <SynthText variant="meta" color="brand">
                    {config.title.toUpperCase()}
                </SynthText>
                <SynthText variant="accent" style={styles.mt8}>
                    {config.subtitle}
                </SynthText>
                <StarPicker value={rVal} onChange={(v) => updateFormData({ [config.ratingKey]: v } as any)} />
                {(errors as any)[config.ratingKey] ? (
                    <SynthText variant="meta" style={styles.err}>
                        {(errors as any)[config.ratingKey]}
                    </SynthText>
                ) : null}
                <SynthText variant="meta" color="secondary" style={styles.mt12}>
                    Notes (optional)
                </SynthText>
                <TextInput
                    style={styles.area}
                    multiline
                    placeholder="Add specifics…"
                    placeholderTextColor={SynthTokens.colors.neutral600}
                    value={fbVal}
                    onChangeText={(t) => updateFormData({ [config.feedbackKey]: t } as any)}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                    {config.suggestions.map((s) => (
                        <Pressable
                            key={s.id}
                            style={styles.chip}
                            onPress={() =>
                                updateFormData({
                                    [config.feedbackKey]: s.description || s.label,
                                } as any)
                            }
                        >
                            <SynthText variant="meta">{s.label}</SynthText>
                        </Pressable>
                    ))}
                </ScrollView>
                {config.ratingKey === 'venueRating' || config.ratingKey === 'locationRating' ? (
                    previousVenueReview ? (
                        <Pressable
                            style={styles.chip}
                            onPress={() => {
                                const u: Partial<ReviewFormData> = {};
                                if (config.ratingKey === 'venueRating') {
                                    const vr = (previousVenueReview as any).venue_rating;
                                    if (vr) u.venueRating = Number(vr);
                                    if ((previousVenueReview as any).venue_feedback) {
                                        u.venueFeedback = (previousVenueReview as any).venue_feedback;
                                    }
                                } else {
                                    const lr = (previousVenueReview as any).location_rating;
                                    if (lr) u.locationRating = Number(lr);
                                    if ((previousVenueReview as any).location_feedback) {
                                        u.locationFeedback = (previousVenueReview as any).location_feedback;
                                    }
                                }
                                updateFormData(u);
                            }}
                        >
                            <SynthText variant="meta">Copy from your last review here</SynthText>
                        </Pressable>
                    ) : null
                ) : null}
                {extras}
            </View>
        );
    };

    const renderStep = () => {
        if (currentStep === 1) {
            return (
                <View style={styles.section}>
                    <SynthText variant="meta" color="brand" style={styles.center}>
                        Get Started
                    </SynthText>
                    <SynthText variant="h2" style={styles.center}>
                        How much time do you want to spend?
                    </SynthText>
                    <SynthText variant="meta" color="secondary" style={[styles.center, styles.mb8]}>
                        Choose the review style that works best for you.
                    </SynthText>
                    {(
                        [
                            {
                                v: '1min' as const,
                                minutes: '1',
                                t: '1 Minute',
                                sub: 'Quick Review',
                                d: 'Overall rating + brief text',
                            },
                            {
                                v: '3min' as const,
                                minutes: '3',
                                t: '3 Minutes',
                                sub: 'Standard Review',
                                d: 'Key ratings + text + photos',
                            },
                            {
                                v: '5min' as const,
                                minutes: '5',
                                t: '5 Minutes',
                                sub: 'Detailed Review',
                                d: 'Full category breakdown + story',
                            },
                        ] as const
                    ).map((opt) => {
                        const sel = formData.reviewDuration === opt.v;
                        return (
                            <Pressable
                                key={opt.v}
                                style={[styles.durationCard, sel && styles.durationCardOn]}
                                onPress={() => {
                                    updateFormData({ reviewDuration: opt.v });
                                    setTimeout(() => nextStep(), 120);
                                }}
                            >
                                <View style={styles.durationCardInner}>
                                    <View style={[styles.durationBadge, sel && styles.durationBadgeOn]}>
                                        <SynthText variant="h2" style={styles.durationBadgeTxt}>
                                            {opt.minutes}
                                        </SynthText>
                                        <SynthText variant="meta" color="secondary" style={styles.durationBadgeSub}>
                                            min
                                        </SynthText>
                                    </View>
                                    <View style={styles.durationTextCol}>
                                        <SynthText variant="accent">{opt.t}</SynthText>
                                        <SynthText variant="meta" color="brand">
                                            {opt.sub}
                                        </SynthText>
                                        <SynthText variant="meta" color="secondary">
                                            {opt.d}
                                        </SynthText>
                                    </View>
                                </View>
                            </Pressable>
                        );
                    })}
                    {errors.reviewDuration ? (
                        <SynthText variant="meta" style={styles.err}>
                            {errors.reviewDuration}
                        </SynthText>
                    ) : null}
                </View>
            );
        }

        switch (flow) {
            case 'quick':
                if (currentStep === 2) {
                    return (
                        <View style={styles.section}>
                            <SynthText variant="h2">Event details</SynthText>
                            <SynthText variant="meta" color="secondary" style={styles.mb8}>
                                Search a past show or pick artist + venue
                            </SynthText>
                            <SynthText variant="meta">Past event</SynthText>
                            <TextInput
                                style={styles.input}
                                placeholder="Search artist, venue, title…"
                                placeholderTextColor={SynthTokens.colors.neutral600}
                                value={eventQuery}
                                onChangeText={setEventQuery}
                            />
                            <FlatList
                                data={eventRows.slice(0, 8)}
                                keyExtractor={(it) => it.id}
                                scrollEnabled={false}
                                renderItem={({ item }) => (
                                    <Pressable style={styles.listRow} onPress={() => void applyPastEvent(item)}>
                                        <SynthText variant="body" numberOfLines={2}>
                                            {(item.artist_name_normalized || '') +
                                                ' @ ' +
                                                (item.venue_name_normalized || '')}{' '}
                                            · {String(item.event_date).split('T')[0]}
                                        </SynthText>
                                    </Pressable>
                                )}
                            />
                            <SynthText variant="meta" style={styles.mt12}>
                                Artist
                            </SynthText>
                            <TextInput
                                style={styles.input}
                                value={artistQ}
                                onChangeText={setArtistQ}
                                placeholder="Search artist"
                                placeholderTextColor={SynthTokens.colors.neutral600}
                            />
                            {artistRows.slice(0, 6).map((a) => (
                                <Pressable
                                    key={a.id}
                                    style={styles.listRow}
                                    onPress={() => updateFormData({ selectedArtist: a })}
                                >
                                    <SynthText variant="body">{a.name}</SynthText>
                                </Pressable>
                            ))}
                            <SynthText variant="meta" style={styles.mt12}>
                                Venue
                            </SynthText>
                            <TextInput
                                style={styles.input}
                                value={venueQ}
                                onChangeText={setVenueQ}
                                placeholder="Search venue"
                                placeholderTextColor={SynthTokens.colors.neutral600}
                            />
                            {venueRows.slice(0, 6).map((v) => (
                                <Pressable
                                    key={v.id}
                                    style={styles.listRow}
                                    onPress={() => updateFormData({ selectedVenue: v })}
                                >
                                    <SynthText variant="body">{v.name}</SynthText>
                                </Pressable>
                            ))}
                            <SynthText variant="meta" style={styles.mt12}>
                                Date (YYYY-MM-DD)
                            </SynthText>
                            <TextInput
                                style={styles.input}
                                value={formData.eventDate}
                                onChangeText={(t) => updateFormData({ eventDate: t })}
                                placeholder="2025-03-01"
                                placeholderTextColor={SynthTokens.colors.neutral600}
                            />
                            {errors.selectedArtist ? (
                                <SynthText variant="meta" style={styles.err}>
                                    {errors.selectedArtist}
                                </SynthText>
                            ) : null}
                            {errors.selectedVenue ? (
                                <SynthText variant="meta" style={styles.err}>
                                    {errors.selectedVenue}
                                </SynthText>
                            ) : null}
                            {errors.eventDate ? (
                                <SynthText variant="meta" style={styles.err}>
                                    {errors.eventDate}
                                </SynthText>
                            ) : null}
                        </View>
                    );
                }
                if (currentStep === 3) {
                    const max = 200;
                    return (
                        <View style={styles.section}>
                            <SynthText variant="h2">Quick review</SynthText>
                            <StarPicker
                                value={formData.rating}
                                onChange={(v) => updateFormData({ rating: v })}
                            />
                            {errors.rating ? (
                                <SynthText variant="meta" style={styles.err}>
                                    {errors.rating}
                                </SynthText>
                            ) : null}
                            <TextInput
                                style={styles.area}
                                multiline
                                placeholder="What stood out?"
                                placeholderTextColor={SynthTokens.colors.neutral600}
                                value={formData.reviewText}
                                maxLength={max}
                                onChangeText={(t) => updateFormData({ reviewText: t })}
                            />
                            <SynthText variant="meta" color="secondary">
                                {formData.reviewText.length}/{max}
                            </SynthText>
                            {errors.reviewText ? (
                                <SynthText variant="meta" style={styles.err}>
                                    {errors.reviewText}
                                </SynthText>
                            ) : null}
                            <SynthText variant="meta" color="secondary" style={styles.mt12}>
                                Video link (optional)
                            </SynthText>
                            <TextInput
                                style={styles.input}
                                autoCapitalize="none"
                                placeholder="https://…"
                                placeholderTextColor={SynthTokens.colors.neutral600}
                                value={formData.videos[0] ?? ''}
                                onChangeText={(t) => updateFormData({ videos: t.trim() ? [t.trim()] : [] })}
                            />
                        </View>
                    );
                }
                if (currentStep === 4) {
                    return (
                        <View>
                            {renderPrivacySubmitSection()}
                            {errors.reviewText ? (
                                <SynthText variant="meta" style={styles.err}>
                                    {errors.reviewText}
                                </SynthText>
                            ) : null}
                        </View>
                    );
                }
                break;
            default:
                break;
        }

        if (flow === 'standard') {
            if (currentStep === 2) {
                return (
                    <View style={styles.section}>
                        <SynthText variant="h2">Event details</SynthText>
                        <SynthText variant="meta">Past event</SynthText>
                        <TextInput
                            style={styles.input}
                            placeholder="Search…"
                            placeholderTextColor={SynthTokens.colors.neutral600}
                            value={eventQuery}
                            onChangeText={setEventQuery}
                        />
                        <FlatList
                            data={eventRows.slice(0, 8)}
                            keyExtractor={(it) => it.id}
                            scrollEnabled={false}
                            renderItem={({ item }) => (
                                <Pressable style={styles.listRow} onPress={() => void applyPastEvent(item)}>
                                    <SynthText variant="body" numberOfLines={2}>
                                        {(item.artist_name_normalized || '') +
                                            ' @ ' +
                                            (item.venue_name_normalized || '')}
                                    </SynthText>
                                </Pressable>
                            )}
                        />
                        <TextInput
                            style={styles.input}
                            value={artistQ}
                            onChangeText={setArtistQ}
                            placeholder="Artist"
                            placeholderTextColor={SynthTokens.colors.neutral600}
                        />
                        {artistRows.slice(0, 5).map((a) => (
                            <Pressable key={a.id} style={styles.listRow} onPress={() => updateFormData({ selectedArtist: a })}>
                                <SynthText variant="body">{a.name}</SynthText>
                            </Pressable>
                        ))}
                        <TextInput
                            style={styles.input}
                            value={venueQ}
                            onChangeText={setVenueQ}
                            placeholder="Venue"
                            placeholderTextColor={SynthTokens.colors.neutral600}
                        />
                        {venueRows.slice(0, 5).map((v) => (
                            <Pressable key={v.id} style={styles.listRow} onPress={() => updateFormData({ selectedVenue: v })}>
                                <SynthText variant="body">{v.name}</SynthText>
                            </Pressable>
                        ))}
                        <TextInput
                            style={styles.input}
                            value={formData.eventDate}
                            onChangeText={(t) => updateFormData({ eventDate: t })}
                            placeholder="Date YYYY-MM-DD"
                            placeholderTextColor={SynthTokens.colors.neutral600}
                        />
                        {!!errors.selectedArtist && (
                            <SynthText variant="meta" style={styles.err}>
                                {errors.selectedArtist}
                            </SynthText>
                        )}
                        {!!errors.selectedVenue && (
                            <SynthText variant="meta" style={styles.err}>
                                {errors.selectedVenue}
                            </SynthText>
                        )}
                        {!!errors.eventDate && (
                            <SynthText variant="meta" style={styles.err}>
                                {errors.eventDate}
                            </SynthText>
                        )}
                    </View>
                );
            }
            if (currentStep === 3) return renderCategory(categoryConfigs[2]!);
            if (currentStep === 4)
                return renderCategory(categoryConfigs[4]!, previousVenueReview ? undefined : undefined);
            if (currentStep === 5) {
                const max = 400;
                return (
                    <View style={styles.section}>
                        <SynthText variant="h2">Review content</SynthText>
                        <TextInput
                            style={styles.area}
                            multiline
                            value={formData.reviewText}
                            maxLength={max}
                            onChangeText={(t) => updateFormData({ reviewText: t })}
                            placeholder="Tell the story"
                            placeholderTextColor={SynthTokens.colors.neutral600}
                        />
                        <SynthText variant="meta" color="secondary">
                            {formData.reviewText.length}/{max}
                        </SynthText>
                        {errors.reviewText ? (
                            <SynthText variant="meta" style={styles.err}>
                                {errors.reviewText}
                            </SynthText>
                        ) : null}
                        <Pressable style={styles.primaryBtn} onPress={pickPhotos} disabled={uploadingPhoto || formData.photos.length >= 5}>
                            {uploadingPhoto ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <SynthText variant="body" style={styles.primaryBtnText}>
                                    Add photos ({formData.photos.length}/5)
                                </SynthText>
                            )}
                        </Pressable>
                        <SynthText variant="meta" color="secondary" style={styles.mt12}>
                            Video link (optional)
                        </SynthText>
                        <TextInput
                            style={styles.input}
                            autoCapitalize="none"
                            placeholder="https://…"
                            placeholderTextColor={SynthTokens.colors.neutral600}
                            value={formData.videos[0] ?? ''}
                            onChangeText={(t) => updateFormData({ videos: t.trim() ? [t.trim()] : [] })}
                        />
                    </View>
                );
            }
            if (currentStep === 6) {
                return renderPrivacySubmitSection();
            }
        }

        if (flow === 'detailed') {
            if (currentStep === 2) {
                return (
                    <View style={styles.section}>
                        <SynthText variant="h2">Event details</SynthText>
                        <TextInput
                            style={styles.input}
                            placeholder="Search past events…"
                            placeholderTextColor={SynthTokens.colors.neutral600}
                            value={eventQuery}
                            onChangeText={setEventQuery}
                        />
                        <FlatList
                            data={eventRows.slice(0, 8)}
                            keyExtractor={(it) => it.id}
                            scrollEnabled={false}
                            renderItem={({ item }) => (
                                <Pressable style={styles.listRow} onPress={() => void applyPastEvent(item)}>
                                    <SynthText variant="body" numberOfLines={2}>
                                        {(item.artist_name_normalized || '') +
                                            ' @ ' +
                                            (item.venue_name_normalized || '')}
                                    </SynthText>
                                </Pressable>
                            )}
                        />
                        <TextInput
                            style={styles.input}
                            value={artistQ}
                            onChangeText={setArtistQ}
                            placeholder="Artist"
                            placeholderTextColor={SynthTokens.colors.neutral600}
                        />
                        {artistRows.slice(0, 5).map((a) => (
                            <Pressable key={a.id} style={styles.listRow} onPress={() => updateFormData({ selectedArtist: a })}>
                                <SynthText variant="body">{a.name}</SynthText>
                            </Pressable>
                        ))}
                        <TextInput
                            style={styles.input}
                            value={venueQ}
                            onChangeText={setVenueQ}
                            placeholder="Venue"
                            placeholderTextColor={SynthTokens.colors.neutral600}
                        />
                        {venueRows.slice(0, 5).map((v) => (
                            <Pressable key={v.id} style={styles.listRow} onPress={() => updateFormData({ selectedVenue: v })}>
                                <SynthText variant="body">{v.name}</SynthText>
                            </Pressable>
                        ))}
                        <TextInput
                            style={styles.input}
                            value={formData.eventDate}
                            onChangeText={(t) => updateFormData({ eventDate: t })}
                            placeholder="Date YYYY-MM-DD"
                            placeholderTextColor={SynthTokens.colors.neutral600}
                        />
                        {!!errors.selectedArtist && (
                            <SynthText variant="meta" style={styles.err}>
                                {errors.selectedArtist}
                            </SynthText>
                        )}
                        {!!errors.selectedVenue && (
                            <SynthText variant="meta" style={styles.err}>
                                {errors.selectedVenue}
                            </SynthText>
                        )}
                        {!!errors.eventDate && (
                            <SynthText variant="meta" style={styles.err}>
                                {errors.eventDate}
                            </SynthText>
                        )}
                    </View>
                );
            }
            if (currentStep === 3) return renderCategory(categoryConfigs[2]!);
            if (currentStep === 4) return renderCategory(categoryConfigs[3]!);
            if (currentStep === 5) return renderCategory(categoryConfigs[4]!);
            if (currentStep === 6) return renderCategory(categoryConfigs[5]!);
            if (currentStep === 7) {
                return renderCategory(
                    categoryConfigs[6]!,
                    <View style={styles.mt12}>
                        <SynthText variant="meta">Ticket price paid (private)</SynthText>
                        <TextInput
                            style={styles.input}
                            keyboardType="decimal-pad"
                            value={formData.ticketPricePaid}
                            onChangeText={(t) => updateFormData({ ticketPricePaid: t })}
                            placeholder="e.g. 78.50"
                            placeholderTextColor={SynthTokens.colors.neutral600}
                        />
                        {errors.ticketPricePaid ? (
                            <SynthText variant="meta" style={styles.err}>
                                {errors.ticketPricePaid}
                            </SynthText>
                        ) : null}
                    </View>
                );
            }
            if (currentStep === 8) {
                const max = 500;
                return (
                    <View style={styles.section}>
                        <SynthText variant="h2">Review content</SynthText>
                        <TextInput
                            style={styles.area}
                            multiline
                            value={formData.reviewText}
                            maxLength={max}
                            onChangeText={(t) => updateFormData({ reviewText: t })}
                        />
                        <SynthText variant="meta" color="secondary">
                            {formData.reviewText.length}/{max}
                        </SynthText>
                        {errors.reviewText ? (
                            <SynthText variant="meta" style={styles.err}>
                                {errors.reviewText}
                            </SynthText>
                        ) : null}
                        <Pressable style={styles.primaryBtn} onPress={pickPhotos} disabled={uploadingPhoto || formData.photos.length >= 5}>
                            {uploadingPhoto ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <SynthText variant="body" style={styles.primaryBtnText}>
                                    Add photos ({formData.photos.length}/5)
                                </SynthText>
                            )}
                        </Pressable>
                        <SynthText variant="meta" color="secondary" style={styles.mt12}>
                            Video link (optional)
                        </SynthText>
                        <TextInput
                            style={styles.input}
                            autoCapitalize="none"
                            placeholder="https://…"
                            placeholderTextColor={SynthTokens.colors.neutral600}
                            value={formData.videos[0] ?? ''}
                            onChangeText={(t) => updateFormData({ videos: t.trim() ? [t.trim()] : [] })}
                        />
                    </View>
                );
            }
            if (currentStep === 9) {
                return renderPrivacySubmitSection();
            }
        }

        return null;
    };

    const stepContent = renderStep();

    const onBack = () => {
        if (currentStep <= 1) onClose();
        else prevStep();
    };

    const showContinue =
        currentStep > 1 &&
        !(flow === 'quick' && currentStep === 4) &&
        !(flow === 'standard' && currentStep === 6) &&
        !(flow === 'detailed' && currentStep === 9);

    const showSubmit =
        (flow === 'quick' && currentStep === 4) ||
        (flow === 'standard' && currentStep === 6) ||
        (flow === 'detailed' && currentStep === 9);

    return (
        <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <Pressable onPress={onBack} style={styles.back} accessibilityLabel="Back">
                    <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
                </Pressable>
                <View style={styles.headerMid}>
                    <SynthText variant="meta" color="secondary" style={styles.center}>
                        {currentFlow ? `${stepLabels[currentStep - 1] ?? 'Review'}` : 'Review'}
                    </SynthText>
                    <SynthText variant="meta" color="secondary" style={styles.center}>
                        Step {currentStep} / {totalSteps}
                    </SynthText>
                </View>
                <View style={styles.back} />
            </View>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                {stepContent}
            </ScrollView>
            <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
                {showContinue ? (
                    <Pressable style={styles.primaryBtn} onPress={() => nextStep()}>
                        <SynthText variant="body" style={styles.primaryBtnText}>
                            Continue
                        </SynthText>
                    </Pressable>
                ) : null}
                {showSubmit ? (
                    <Pressable
                        style={[styles.primaryBtn, isLoading && styles.primaryBtnDisabled]}
                        onPress={() => void handleSubmit()}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <SynthText variant="body" style={styles.primaryBtnText}>
                                Submit Review
                            </SynthText>
                        )}
                    </Pressable>
                ) : null}
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
    },
    headerMid: { flex: 1 },
    back: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    center: { textAlign: 'center' },
    scroll: { padding: 20, paddingBottom: 120 },
    section: { gap: 8 },
    mt8: { marginTop: 8 },
    mt12: { marginTop: 12 },
    mb8: { marginBottom: 8 },
    input: {
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 16,
        backgroundColor: '#fff',
        color: SynthTokens.colors.neutral900,
    },
    area: {
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        borderRadius: 12,
        padding: 14,
        minHeight: 120,
        textAlignVertical: 'top',
        fontSize: 16,
        backgroundColor: '#fff',
        color: SynthTokens.colors.neutral900,
    },
    listRow: {
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
    },
    starRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
    starHit: { padding: 4, marginRight: 2 },
    chipScroll: { marginTop: 8, maxHeight: 44 },
    chip: {
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginRight: 8,
        backgroundColor: '#fff',
    },
    durationCard: {
        borderWidth: 2,
        borderColor: SynthTokens.colors.neutral200,
        borderRadius: 16,
        padding: 14,
        marginTop: 12,
        backgroundColor: '#fff',
    },
    durationCardOn: {
        borderColor: SynthTokens.colors.brandPink500,
        backgroundColor: SynthTokens.colors.brandPink050,
    },
    durationCardInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    durationBadge: {
        width: 64,
        height: 64,
        borderRadius: 14,
        backgroundColor: SynthTokens.colors.neutral100,
        borderWidth: 2,
        borderColor: SynthTokens.colors.neutral200,
        alignItems: 'center',
        justifyContent: 'center',
    },
    durationBadgeOn: {
        borderColor: SynthTokens.colors.brandPink500,
        backgroundColor: SynthTokens.colors.neutral0,
    },
    durationBadgeTxt: {
        fontSize: 22,
        fontWeight: '800',
        color: SynthTokens.colors.brandPink500,
        lineHeight: 26,
    },
    durationBadgeSub: {
        fontSize: 11,
        marginTop: -2,
    },
    durationTextCol: {
        flex: 1,
        minWidth: 0,
    },
    err: { color: SynthTokens.colors.error },
    privacySectionTitle: {
        marginTop: 16,
        fontSize: 16,
        fontWeight: '600',
        color: SynthTokens.colors.neutral900,
    },
    privacyGroup: { gap: 12, marginTop: 8 },
    privacyCard: {
        borderWidth: 2,
        borderColor: SynthTokens.colors.neutral200,
        borderRadius: 12,
        padding: 14,
        backgroundColor: SynthTokens.colors.neutral0,
    },
    privacyCardOn: {
        borderColor: SynthTokens.colors.brandPink500,
        backgroundColor: SynthTokens.colors.brandPink050,
    },
    privacyCardTitle: { fontWeight: '600', marginBottom: 4, color: SynthTokens.colors.neutral900 },
    rowBetween: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 16,
    },
    footer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 20,
        paddingTop: 12,
        backgroundColor: SynthTokens.colors.neutral50,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: SynthTokens.colors.neutral200,
    },
    primaryBtn: {
        backgroundColor: SynthTokens.colors.brandPink500,
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
    },
    primaryBtnText: { color: '#fff', fontWeight: '600' },
    primaryBtnDisabled: { opacity: 0.7 },
});
