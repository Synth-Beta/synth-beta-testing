import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ChevronRight, Locate, MapPin, Navigation, Star, X } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { TravelTrackerService, type TravelCityGroup, type TravelReviewPin } from '../../services/travelTrackerService';
import { SectionError, SkeletonBlock, EmptyState } from './PassportPrimitives';

const PINK = SynthTokens.colors.brandPink500;
const MAP_HEIGHT = 340;

/**
 * Muted charcoal Google style (Android). iOS uses Apple Maps dark mode via
 * userInterfaceStyle so both platforms read as the same "night atlas" look
 * that lets the pink journey pop.
 */
const DARK_MAP_STYLE = [
    { elementType: 'geometry', stylers: [{ color: '#181B20' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#8A8F98' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#181B20' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#23272E' }] },
    { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#2C313A' }] },
    { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0E1116' }] },
    { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#1B1F25' }] },
];

function openDirections(lat: number, lng: number, label: string) {
    const q = encodeURIComponent(`${lat},${lng}(${label})`);
    const url = Platform.OS === 'ios' ? `maps:0,0?q=${q}` : `geo:0,0?q=${lat},${lng}(${encodeURIComponent(label)})`;
    void Linking.openURL(url);
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Frosted pill — real blur on iOS, translucent ink on Android (expo-blur is iOS-first). */
function GlassPill({ children, style }: { children: React.ReactNode; style?: object }) {
    if (Platform.OS === 'ios') {
        return (
            <BlurView intensity={36} tint="dark" style={[styles.glass, style]}>
                {children}
            </BlurView>
        );
    }
    return <View style={[styles.glass, styles.glassAndroid, style]}>{children}</View>;
}

function GlowMarker({ selected, count }: { selected: boolean; count: number }) {
    return (
        <View style={styles.markerHit}>
            <View style={[styles.markerGlow, selected && styles.markerGlowSelected]} />
            <View style={[styles.markerCore, selected && styles.markerCoreSelected]} />
            {count > 1 ? (
                <View style={styles.markerBadge}>
                    <SynthText variant="meta" style={styles.markerBadgeTxt}>
                        {count > 9 ? '9+' : count}
                    </SynthText>
                </View>
            ) : null}
        </View>
    );
}

export function PassportTravelMap({ userId }: { userId: string }) {
    const router = useRouter();
    const mapRef = useRef<MapView | null>(null);
    const [pins, setPins] = useState<TravelReviewPin[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [listExpanded, setListExpanded] = useState(false);
    const cardAnim = useRef(new Animated.Value(0)).current;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const rows = await TravelTrackerService.getReviewsWithCoordinates(userId);
            setPins(rows);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        void load();
    }, [load]);

    // One dot per city/metro area — keeps the map readable when several shows share a city.
    const cityGroups = useMemo(() => TravelTrackerService.groupByCity(pins), [pins]);
    const groupCoords = useMemo(
        () => cityGroups.map(g => ({ latitude: g.latitude, longitude: g.longitude })),
        [cityGroups]
    );

    const stats = useMemo(() => {
        const venues = new Set<string>();
        const places = new Set<string>();
        for (const p of pins) {
            if (p.venue_name) venues.add(p.venue_name.toLowerCase());
            const place = p.venue_city || p.venue_state;
            if (place) places.add(place.toLowerCase());
        }
        return { shows: pins.length, venues: venues.size, places: places.size };
    }, [pins]);

    const selected = useMemo(
        () => (selectedKey ? cityGroups.find(g => g.key === selectedKey) ?? null : null),
        [selectedKey, cityGroups]
    );

    const fitAll = useCallback(
        (animated = true) => {
            const m = mapRef.current;
            if (!m || groupCoords.length === 0) return;
            m.fitToCoordinates(groupCoords, {
                edgePadding: { top: 70, right: 60, bottom: selected ? 170 : 60, left: 60 },
                animated,
            });
        },
        [groupCoords, selected]
    );

    useEffect(() => {
        // Slight delay helps on initial mount (same trick as TourTrackerMap).
        const t = setTimeout(() => fitAll(false), 60);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupCoords.length]);

    useEffect(() => {
        Animated.timing(cardAnim, {
            toValue: selected ? 1 : 0,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [selected, cardAnim]);

    const selectGroup = useCallback(
        (group: TravelCityGroup, centerMap: boolean) => {
            void Haptics.selectionAsync();
            setSelectedKey(prev => (prev === group.key && !centerMap ? null : group.key));
            if (centerMap) {
                mapRef.current?.animateToRegion(
                    { latitude: group.latitude, longitude: group.longitude, latitudeDelta: 0.35, longitudeDelta: 0.35 },
                    350
                );
            }
        },
        []
    );

    if (loading) {
        return (
            <View style={styles.section}>
                <Header count={null} />
                <SkeletonBlock height={MAP_HEIGHT} radius={18} />
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.section}>
                <Header count={null} />
                <SectionError message={error} onRetry={() => void load()} />
            </View>
        );
    }

    if (pins.length === 0) {
        return (
            <View style={styles.section}>
                <Header count={0} />
                <EmptyState
                    title="No pins on your map yet"
                    hint="Review a show and its venue drops a pin here — your live-music world, one stamp at a time."
                />
            </View>
        );
    }

    const visibleGroups = listExpanded ? cityGroups : cityGroups.slice(0, 4);

    return (
        <View style={styles.section}>
            <Header count={pins.length} />

            {Platform.OS !== 'web' ? (
                <View style={styles.mapShell}>
                    <MapView
                        ref={r => {
                            mapRef.current = r;
                        }}
                        style={StyleSheet.absoluteFillObject}
                        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                        customMapStyle={Platform.OS === 'android' ? DARK_MAP_STYLE : undefined}
                        userInterfaceStyle="dark"
                        pitchEnabled={false}
                        rotateEnabled={false}
                        toolbarEnabled={false}
                        onPress={() => setSelectedKey(null)}
                        initialRegion={{
                            latitude: cityGroups[0].latitude,
                            longitude: cityGroups[0].longitude,
                            latitudeDelta: 25,
                            longitudeDelta: 25,
                        }}
                    >
                        {cityGroups.map(group => {
                            const isSelected = group.key === selectedKey;
                            return (
                                <Marker
                                    key={group.key}
                                    coordinate={{ latitude: group.latitude, longitude: group.longitude }}
                                    anchor={{ x: 0.5, y: 0.5 }}
                                    onPress={e => {
                                        e.stopPropagation();
                                        selectGroup(group, false);
                                    }}
                                    tracksViewChanges={isSelected}
                                    zIndex={isSelected ? 2 : 1}
                                >
                                    <GlowMarker selected={isSelected} count={group.shows.length} />
                                </Marker>
                            );
                        })}
                    </MapView>

                    {/* Stats — frosted strip, top left */}
                    <GlassPill style={styles.statsPill}>
                        <SynthText variant="meta" style={styles.statsTxt}>
                            {stats.shows} {stats.shows === 1 ? 'show' : 'shows'}
                            <SynthText variant="meta" style={styles.statsDot}>{'  ·  '}</SynthText>
                            {stats.venues} {stats.venues === 1 ? 'venue' : 'venues'}
                            <SynthText variant="meta" style={styles.statsDot}>{'  ·  '}</SynthText>
                            {stats.places} {stats.places === 1 ? 'city' : 'cities'}
                        </SynthText>
                    </GlassPill>

                    {/* Recenter — frosted round button, top right */}
                    <Pressable
                        onPress={() => fitAll(true)}
                        style={styles.recenterWrap}
                        accessibilityRole="button"
                        accessibilityLabel="Show whole journey"
                    >
                        <GlassPill style={styles.recenterBtn}>
                            <Locate size={17} color="#fff" />
                        </GlassPill>
                    </Pressable>

                    {/* Selected show — sliding card pinned to the map's bottom edge */}
                    {selected ? (
                        <Animated.View
                            style={[
                                styles.detailCard,
                                {
                                    opacity: cardAnim,
                                    transform: [
                                        {
                                            translateY: cardAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [24, 0],
                                            }),
                                        },
                                    ],
                                },
                            ]}
                        >
                            <View style={styles.detailTopRow}>
                                <View style={{ flex: 1 }}>
                                    <SynthText variant="body" style={styles.detailVenue} numberOfLines={1}>
                                        {selected.city || selected.state || selected.shows[0].venue_name || 'Venue'}
                                    </SynthText>
                                    <SynthText variant="meta" color="secondary" numberOfLines={1}>
                                        {selected.shows.length === 1
                                            ? formatDate(selected.shows[0].event_date)
                                            : `${selected.shows.length} shows`}
                                        {selected.city && selected.state ? ` · ${selected.state}` : ''}
                                    </SynthText>
                                </View>
                                {selected.shows.length === 1 && selected.shows[0].rating != null ? (
                                    <View style={styles.ratingChip}>
                                        <Star size={13} color={PINK} fill={PINK} />
                                        <SynthText variant="meta" style={styles.ratingTxt}>
                                            {selected.shows[0].rating.toFixed(1)}
                                        </SynthText>
                                    </View>
                                ) : null}
                                <Pressable
                                    onPress={() => setSelectedKey(null)}
                                    hitSlop={10}
                                    style={styles.closeBtn}
                                    accessibilityRole="button"
                                    accessibilityLabel="Close"
                                >
                                    <X size={16} color={SynthTokens.colors.neutral600} />
                                </Pressable>
                            </View>

                            {selected.shows.length === 1 ? (
                                <>
                                    {selected.shows[0].review_text ? (
                                        <SynthText
                                            variant="meta"
                                            color="secondary"
                                            numberOfLines={2}
                                            style={styles.detailQuote}
                                        >
                                            “{selected.shows[0].review_text.trim()}”
                                        </SynthText>
                                    ) : null}

                                    <View style={styles.detailActions}>
                                        {selected.shows[0].event_id ? (
                                            <Pressable
                                                style={styles.primaryAction}
                                                onPress={() => router.push(`/event/${selected.shows[0].event_id}`)}
                                                accessibilityRole="button"
                                            >
                                                <SynthText variant="meta" style={styles.primaryActionTxt}>
                                                    View event
                                                </SynthText>
                                                <ChevronRight size={15} color="#fff" />
                                            </Pressable>
                                        ) : null}
                                        <Pressable
                                            style={styles.secondaryAction}
                                            onPress={() =>
                                                openDirections(
                                                    selected.latitude,
                                                    selected.longitude,
                                                    selected.shows[0].venue_name || 'Venue'
                                                )
                                            }
                                            accessibilityRole="button"
                                        >
                                            <Navigation size={14} color={PINK} />
                                            <SynthText variant="meta" style={styles.secondaryActionTxt}>
                                                Directions
                                            </SynthText>
                                        </Pressable>
                                    </View>
                                </>
                            ) : (
                                <ScrollView style={styles.detailList} showsVerticalScrollIndicator={false}>
                                    {selected.shows.map(show => (
                                        <Pressable
                                            key={show.id}
                                            style={styles.detailListRow}
                                            onPress={() => show.event_id && router.push(`/event/${show.event_id}`)}
                                            accessibilityRole="button"
                                        >
                                            <View style={{ flex: 1 }}>
                                                <SynthText variant="meta" style={styles.listVenue} numberOfLines={1}>
                                                    {show.venue_name || 'Venue'}
                                                </SynthText>
                                                <SynthText
                                                    variant="meta"
                                                    color="secondary"
                                                    numberOfLines={1}
                                                    style={styles.listSub}
                                                >
                                                    {formatDate(show.event_date)}
                                                </SynthText>
                                            </View>
                                            {show.rating != null ? (
                                                <View style={styles.listRating}>
                                                    <Star size={12} color={PINK} fill={PINK} />
                                                    <SynthText variant="meta" style={styles.listRatingTxt}>
                                                        {show.rating.toFixed(1)}
                                                    </SynthText>
                                                </View>
                                            ) : null}
                                            <ChevronRight size={14} color={SynthTokens.colors.neutral600} />
                                        </Pressable>
                                    ))}
                                </ScrollView>
                            )}
                        </Animated.View>
                    ) : null}
                </View>
            ) : null}

            {/* Compact place list — taps sync with the map */}
            <View style={styles.list}>
                {visibleGroups.map(group => {
                    const isSelected = group.key === selectedKey;
                    const primary = group.shows[0];
                    return (
                        <Pressable
                            key={group.key}
                            style={[styles.listRow, isSelected && styles.listRowSelected]}
                            onPress={() => selectGroup(group, true)}
                            accessibilityRole="button"
                        >
                            <View style={styles.listPinIcon}>
                                <MapPin size={15} color={PINK} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <SynthText variant="meta" style={styles.listVenue} numberOfLines={1}>
                                    {group.city || group.state || primary.venue_name || 'Venue'}
                                </SynthText>
                                <SynthText variant="meta" color="secondary" numberOfLines={1} style={styles.listSub}>
                                    {group.shows.length} {group.shows.length === 1 ? 'show' : 'shows'}
                                    {group.state ? ` · ${group.state}` : ''}
                                </SynthText>
                            </View>
                            {group.shows.length === 1 && primary.rating != null ? (
                                <View style={styles.listRating}>
                                    <Star size={12} color={PINK} fill={PINK} />
                                    <SynthText variant="meta" style={styles.listRatingTxt}>
                                        {primary.rating.toFixed(1)}
                                    </SynthText>
                                </View>
                            ) : group.shows.length > 1 ? (
                                <View style={styles.countPill}>
                                    <SynthText variant="meta" style={styles.countPillTxt}>
                                        {group.shows.length}
                                    </SynthText>
                                </View>
                            ) : null}
                        </Pressable>
                    );
                })}
                {cityGroups.length > 4 ? (
                    <Pressable style={styles.showMore} onPress={() => setListExpanded(v => !v)} accessibilityRole="button">
                        <SynthText variant="meta" style={styles.showMoreTxt}>
                            {listExpanded ? 'Show less' : `Show all ${cityGroups.length} places`}
                        </SynthText>
                    </Pressable>
                ) : null}
            </View>
        </View>
    );
}

function Header({ count }: { count: number | null }) {
    return (
        <View style={styles.titleRow}>
            <MapPin size={20} color={PINK} />
            <SynthText variant="h2" style={styles.sectionTitle}>
                Travel tracker
            </SynthText>
            {count != null && count > 0 ? (
                <View style={styles.countPill}>
                    <SynthText variant="meta" style={styles.countPillTxt}>
                        {count}
                    </SynthText>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    section: { marginTop: 20 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    sectionTitle: { fontSize: 18, fontWeight: '800' },
    countPill: {
        minWidth: 24,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: SynthTokens.colors.brandPink050,
        borderWidth: 1,
        borderColor: PINK,
        alignItems: 'center',
    },
    countPillTxt: { color: PINK, fontWeight: '800', fontSize: 12 },

    mapShell: {
        height: MAP_HEIGHT,
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: '#181B20',
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },

    glass: {
        borderRadius: 999,
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.22)',
    },
    glassAndroid: { backgroundColor: 'rgba(18, 20, 24, 0.78)' },

    statsPill: {
        position: 'absolute',
        top: 12,
        left: 12,
        paddingHorizontal: 14,
        paddingVertical: 7,
        backgroundColor: Platform.OS === 'ios' ? 'rgba(18,20,24,0.35)' : undefined,
    },
    statsTxt: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
    statsDot: { color: 'rgba(255,255,255,0.45)', fontSize: 12.5 },

    recenterWrap: { position: 'absolute', top: 12, right: 12 },
    recenterBtn: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Platform.OS === 'ios' ? 'rgba(18,20,24,0.35)' : undefined,
    },

    markerHit: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
    markerGlow: {
        position: 'absolute',
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: 'rgba(204, 36, 134, 0.30)',
    },
    markerGlowSelected: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: 'rgba(204, 36, 134, 0.45)',
    },
    markerCore: {
        width: 15,
        height: 15,
        borderRadius: 8,
        backgroundColor: PINK,
        borderWidth: 2.5,
        borderColor: '#fff',
    },
    markerCoreSelected: { width: 19, height: 19, borderRadius: 10 },
    markerBadge: {
        position: 'absolute',
        top: -3,
        right: -3,
        minWidth: 16,
        height: 16,
        borderRadius: 8,
        paddingHorizontal: 3,
        backgroundColor: SynthTokens.colors.neutral0,
        borderWidth: 1.5,
        borderColor: PINK,
        alignItems: 'center',
        justifyContent: 'center',
    },
    markerBadgeTxt: { color: PINK, fontWeight: '800', fontSize: 9, lineHeight: 11 },

    detailCard: {
        position: 'absolute',
        left: 10,
        right: 10,
        bottom: 10,
        borderRadius: 16,
        backgroundColor: SynthTokens.colors.neutral0,
        padding: 14,
        shadowColor: '#000',
        shadowOpacity: 0.28,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
    },
    detailTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    detailVenue: { fontWeight: '800', fontSize: 17 },
    ratingChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: SynthTokens.colors.brandPink050,
    },
    ratingTxt: { color: PINK, fontWeight: '800', fontSize: 13 },
    closeBtn: { padding: 2, marginTop: 2 },
    detailQuote: { marginTop: 8, lineHeight: 20, fontStyle: 'italic' },
    detailActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 },
    detailList: { maxHeight: 220, marginTop: 8 },
    detailListRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 9,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
    },
    primaryAction: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        backgroundColor: PINK,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
    },
    primaryActionTxt: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
    secondaryAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    secondaryActionTxt: { color: PINK, fontWeight: '700', fontSize: 13.5 },

    list: { marginTop: 12 },
    listRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        backgroundColor: SynthTokens.colors.neutral0,
        marginBottom: 8,
    },
    listRowSelected: { borderColor: PINK, backgroundColor: SynthTokens.colors.brandPink050 },
    listPinIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: PINK + '22',
    },
    listVenue: { fontWeight: '700' },
    listSub: { fontSize: 13 },
    listRating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    listRatingTxt: { fontWeight: '700', fontSize: 13 },
    showMore: { alignItems: 'center', paddingVertical: 10 },
    showMoreTxt: { color: PINK, fontWeight: '700' },
});
