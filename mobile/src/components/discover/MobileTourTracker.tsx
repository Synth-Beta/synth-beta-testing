import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    StyleSheet,
    View,
    TextInput,
    Pressable,
    FlatList,
    ActivityIndicator,
    Text,
    ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { Music, MapPin, Calendar, Building2 as BuildingComplex } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { useRouter } from 'expo-router';
import { SearchService, type ArtistSearchRow } from '../../services/searchService';
import { TourTrackerService, type TourEvent } from '../../services/tourTrackerService';
import { EventService } from '../../services/eventService';
import { TourTrackerMap, groupTourStops } from './TourTrackerMap';

const PINK = SynthTokens.colors.brandPink500;

export function MobileTourTracker() {
    const [query, setQuery] = useState('');
    const [artists, setArtists] = useState<ArtistSearchRow[]>([]);
    const [artistsLoading, setArtistsLoading] = useState(false);
    const [selected, setSelected] = useState<ArtistSearchRow | null>(null);
    const [tourEvents, setTourEvents] = useState<TourEvent[]>([]);
    const [tourLoading, setTourLoading] = useState(false);
    const [selectedStopNumber, setSelectedStopNumber] = useState<number | null>(null);
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const [resultsOpen, setResultsOpen] = useState(false);
    const tourLoadSeqRef = useRef(0);
    const searchSeqRef = useRef(0);
    const skipSearchRef = useRef(false);
    const listRef = useRef<FlatList<TourEvent> | null>(null);
    const router = useRouter();

    const openEventPage = useCallback((eventId: string) => {
        void EventService.toEventRouteId(eventId).then((routeId) => {
            router.push(`/event/${routeId}` as any);
        });
    }, [router]);

    const runSearch = useCallback((q: string) => {
        const seq = ++searchSeqRef.current;
        setArtistsLoading(true);
        return SearchService.searchArtists(q, 24).then(rows => {
            if (seq !== searchSeqRef.current) return;
            setArtists(rows);
            setResultsOpen(true);
        }).finally(() => {
            if (seq === searchSeqRef.current) {
                setArtistsLoading(false);
            }
        });
    }, []);

    useEffect(() => {
        if (skipSearchRef.current) {
            skipSearchRef.current = false;
            return;
        }
        const q = query.trim();
        if (q.length < 2) {
            searchSeqRef.current += 1;
            setArtists([]);
            setResultsOpen(false);
            setArtistsLoading(false);
            return;
        }
        const t = setTimeout(() => {
            void runSearch(q);
        }, 350);
        return () => {
            clearTimeout(t);
        };
    }, [query, runSearch]);

    const loadTour = useCallback(async (artist: ArtistSearchRow) => {
        const seq = ++tourLoadSeqRef.current;
        searchSeqRef.current += 1;
        if (query !== artist.name) {
            skipSearchRef.current = true;
            setQuery(artist.name);
        }
        setResultsOpen(false);
        setArtists([]);
        setArtistsLoading(false);
        setSelected(artist);
        setTourLoading(true);
        try {
            const events = await TourTrackerService.getArtistTourEvents(artist.id);
            if (seq !== tourLoadSeqRef.current) return;
            setTourEvents(events);
            setSelectedStopNumber(null);
            setSelectedEventId(null);
        } finally {
            if (seq === tourLoadSeqRef.current) {
                setTourLoading(false);
            }
        }
    }, [query]);

    const route = useMemo(() => TourTrackerService.calculateTourRoute(tourEvents), [tourEvents]);
    const { eventIdToStopNumber } = useMemo(() => groupTourStops(tourEvents), [tourEvents]);

    const formatEventDate = (d: string) => {
        const x = new Date(d);
        return Number.isFinite(x.getTime())
            ? x.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            : 'Date TBA';
    };

    return (
        <View style={styles.wrap}>
            <SynthText variant="meta" color="secondary" style={styles.intro}>
                Search an artist to see upcoming tour stops with coordinates.
            </SynthText>
            <TextInput
                style={styles.input}
                placeholder="Artist name"
                placeholderTextColor={SynthTokens.colors.neutral400}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                autoCapitalize="words"
                selectTextOnFocus
                onFocus={() => {
                    const q = query.trim();
                    if (q.length >= 2) {
                        void runSearch(q);
                    }
                }}
            />
            {resultsOpen && (artistsLoading || artists.length > 0) ? (
                <ScrollView
                    style={styles.dropdown}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="always"
                >
                    {artistsLoading && artists.length === 0 ? (
                        <ActivityIndicator color={PINK} style={styles.loader} />
                    ) : (
                        artists.map(item => (
                            <Pressable key={item.id} style={styles.artistRow} onPress={() => void loadTour(item)}>
                                {item.image_url ? (
                                    <Image source={{ uri: item.image_url }} style={styles.avatar} />
                                ) : (
                                    <View style={[styles.avatar, styles.avatarPh]}>
                                        <Music size={20} color={SynthTokens.colors.neutral400} />
                                    </View>
                                )}
                                <SynthText variant="meta" style={styles.artistName} numberOfLines={1}>
                                    {item.name}
                                </SynthText>
                            </Pressable>
                        ))
                    )}
                </ScrollView>
            ) : null}

            {selected ? (
                <View style={styles.tourBlock}>
                    <View style={styles.selectedHead}>
                        <SynthText variant="h2" style={styles.selectedTitle} numberOfLines={1}>
                            {selected.name}
                        </SynthText>
                        <Pressable
                            onPress={() => {
                                tourLoadSeqRef.current += 1;
                                searchSeqRef.current += 1;
                                skipSearchRef.current = true;
                                setSelected(null);
                                setTourEvents([]);
                                setSelectedStopNumber(null);
                                setSelectedEventId(null);
                                setQuery('');
                                setArtists([]);
                                setResultsOpen(false);
                                setArtistsLoading(false);
                            }}
                        >
                            <SynthText variant="meta" style={styles.clear}>
                                Clear
                            </SynthText>
                        </Pressable>
                    </View>
                    {tourLoading ? (
                        <ActivityIndicator color={PINK} style={styles.loader} />
                    ) : tourEvents.length === 0 ? (
                        <SynthText variant="meta" color="secondary">
                            No upcoming shows with map coordinates for this artist.
                        </SynthText>
                    ) : (
                        <>
                            <TourTrackerMap
                                events={tourEvents}
                                selectedStopNumber={selectedStopNumber}
                                onSelectStopNumber={(n) => {
                                    if (selectedStopNumber === n) {
                                        const alreadySelected = selectedEventId
                                            ? route.events.find(e => e.id === selectedEventId && eventIdToStopNumber[e.id] === n)
                                            : undefined;
                                        const fallback = route.events.find(e => eventIdToStopNumber[e.id] === n);
                                        const toOpen = alreadySelected ?? fallback;
                                        if (toOpen) openEventPage(toOpen.id);
                                        return;
                                    }
                                    setSelectedStopNumber(n);
                                    const idx = route.events.findIndex(e => eventIdToStopNumber[e.id] === n);
                                    if (idx >= 0) {
                                        setSelectedEventId(route.events[idx].id);
                                        listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.2 });
                                    }
                                }}
                            />
                            <SynthText variant="meta" style={styles.routeHead}>
                                Route ({route.route.length} segment{route.route.length === 1 ? '' : 's'})
                            </SynthText>
                            {route.route.length > 0 ? (
                                <View style={styles.routeList}>
                                    {route.route.map((seg, i) => (
                                        <Text key={i} style={styles.routeLine} numberOfLines={2}>
                                            {i + 1}. {seg.from.city} → {seg.to.city}
                                        </Text>
                                    ))}
                                </View>
                            ) : (
                                <SynthText variant="meta" color="secondary">
                                    Single venue or missing coordinates between stops.
                                </SynthText>
                            )}
                            <FlatList
                                ref={(r) => {
                                    listRef.current = r;
                                }}
                                data={route.events}
                                keyExtractor={e => e.id}
                                scrollEnabled={false}
                                style={styles.eventList}
                                renderItem={({ item }) => (
                                    <Pressable
                                        onPress={() => {
                                            if (selectedEventId === item.id) {
                                                openEventPage(item.id);
                                                return;
                                            }
                                            setSelectedEventId(item.id);
                                            setSelectedStopNumber(eventIdToStopNumber[item.id] ?? null);
                                        }}
                                        accessibilityHint="Tap again to open this event"
                                        style={({ pressed }) => [
                                            styles.eventRow,
                                            pressed ? styles.pressedRow : null,
                                            selectedEventId === item.id
                                                ? styles.selectedRow
                                                : null,
                                        ]}
                                    >
                                        {(() => {
                                            const cityState = [item.venue_city?.trim(), item.venue_state?.trim()]
                                                .filter(Boolean)
                                                .join(', ');
                                            const venueName = (item.venue_name || '').trim();
                                            return (
                                                <>
                                                    <View style={styles.eventMetaRow}>
                                                        <Calendar size={16} color={PINK} />
                                                        <SynthText variant="meta" style={styles.eventDate}>
                                                            {formatEventDate(item.event_date)}
                                                        </SynthText>
                                                    </View>
                                                    {cityState ? (
                                                        <View style={styles.eventMetaRow}>
                                                            <MapPin size={16} color={PINK} />
                                                            <SynthText variant="meta" numberOfLines={1} style={styles.eventMetaTxt}>
                                                                {cityState}
                                                            </SynthText>
                                                        </View>
                                                    ) : null}
                                                    {venueName ? (
                                                        <View style={styles.eventMetaRow}>
                                                            <BuildingComplex size={16} color={PINK} />
                                                            <SynthText variant="meta" numberOfLines={1} style={styles.eventMetaTxt}>
                                                                {venueName}
                                                            </SynthText>
                                                        </View>
                                                    ) : null}
                                                </>
                                            );
                                        })()}
                                    </Pressable>
                                )}
                            />
                        </>
                    )}
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { gap: 10 },
    intro: { lineHeight: 20 },
    input: {
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 16,
        color: SynthTokens.colors.neutral900,
        backgroundColor: SynthTokens.colors.neutral0,
    },
    loader: { marginVertical: 8 },
    dropdown: {
        maxHeight: 280,
        backgroundColor: SynthTokens.colors.neutral0,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        borderRadius: 14,
        paddingHorizontal: 10,
    },
    artistRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: SynthTokens.colors.neutral100,
    },
    avatarPh: { alignItems: 'center', justifyContent: 'center' },
    artistName: { flex: 1, fontWeight: '600', fontSize: 16 },
    tourBlock: { gap: 8, marginTop: 4 },
    selectedHead: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    selectedTitle: { flex: 1, fontSize: 18 },
    clear: { color: PINK, fontWeight: '600' },
    routeHead: { fontWeight: '700', marginTop: 4 },
    routeList: { gap: 4 },
    routeLine: { fontSize: 14, color: SynthTokens.colors.neutral900 },
    eventList: { marginTop: 8 },
    eventRow: {
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
        gap: 4,
    },
    pressedRow: { opacity: 0.9 },
    selectedRow: {
        borderLeftWidth: 3,
        borderLeftColor: PINK,
        paddingLeft: 10,
        backgroundColor: 'rgba(204, 36, 134, 0.06)',
    },
    eventDate: { fontWeight: '700', color: PINK, flex: 1 },
    eventMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    // neutral700 does not exist - the scale is 0/50/100/200/400/600/900 - so this was
    // `undefined` at runtime and the text fell back to the default colour. neutral600 is
    // the muted-text token used for secondary copy elsewhere in this file.
    eventMetaTxt: { flex: 1, color: SynthTokens.colors.neutral600 },
});
