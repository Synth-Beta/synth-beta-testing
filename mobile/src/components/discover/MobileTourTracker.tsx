import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    StyleSheet,
    View,
    TextInput,
    Pressable,
    FlatList,
    ActivityIndicator,
    Text,
} from 'react-native';
import { Image } from 'expo-image';
import { Music } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { SearchService, type ArtistSearchRow } from '../../services/searchService';
import { TourTrackerService, type TourEvent } from '../../services/tourTrackerService';

const PINK = SynthTokens.colors.brandPink500;

export function MobileTourTracker() {
    const [query, setQuery] = useState('');
    const [artists, setArtists] = useState<ArtistSearchRow[]>([]);
    const [artistsLoading, setArtistsLoading] = useState(false);
    const [selected, setSelected] = useState<ArtistSearchRow | null>(null);
    const [tourEvents, setTourEvents] = useState<TourEvent[]>([]);
    const [tourLoading, setTourLoading] = useState(false);
    const tourLoadSeqRef = useRef(0);

    useEffect(() => {
        const q = query.trim();
        if (q.length < 2) {
            setArtists([]);
            return;
        }
        let cancelled = false;
        setArtistsLoading(true);
        const t = setTimeout(() => {
            void SearchService.searchArtists(q, 24).then(rows => {
                if (!cancelled) setArtists(rows);
            }).finally(() => {
                if (!cancelled) setArtistsLoading(false);
            });
        }, 350);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [query]);

    const loadTour = useCallback(async (artist: ArtistSearchRow) => {
        const seq = ++tourLoadSeqRef.current;
        setSelected(artist);
        setTourLoading(true);
        try {
            const events = await TourTrackerService.getArtistTourEvents(artist.id);
            if (seq !== tourLoadSeqRef.current) return;
            setTourEvents(events);
        } finally {
            if (seq === tourLoadSeqRef.current) {
                setTourLoading(false);
            }
        }
    }, []);

    const route = useMemo(() => TourTrackerService.calculateTourRoute(tourEvents), [tourEvents]);

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
            />
            {artistsLoading ? (
                <ActivityIndicator color={PINK} style={styles.loader} />
            ) : artists.length > 0 && !selected ? (
                <FlatList
                    data={artists}
                    keyExtractor={a => a.id}
                    style={styles.list}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                        <Pressable style={styles.artistRow} onPress={() => void loadTour(item)}>
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
                    )}
                />
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
                                setSelected(null);
                                setTourEvents([]);
                                setQuery('');
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
                                data={route.events}
                                keyExtractor={e => e.id}
                                scrollEnabled={false}
                                style={styles.eventList}
                                renderItem={({ item }) => (
                                    <View style={styles.eventRow}>
                                        <SynthText variant="meta" style={styles.eventDate}>
                                            {formatEventDate(item.event_date)}
                                        </SynthText>
                                        <SynthText variant="meta" numberOfLines={2}>
                                            {(item.venue_name || 'Venue').trim()}
                                            {item.venue_city ? ` · ${item.venue_city}` : ''}
                                        </SynthText>
                                    </View>
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
    list: { maxHeight: 220 },
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
    eventDate: { fontWeight: '700', color: PINK },
});
