import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator, Linking, Platform } from 'react-native';
import { MapPin, Star, ExternalLink } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { TravelTrackerService, type TravelReviewPin } from '../../services/travelTrackerService';
import { useRouter } from 'expo-router';

const PINK = SynthTokens.colors.brandPink500;

function openMaps(lat: number, lng: number, label: string) {
    const q = encodeURIComponent(`${lat},${lng}(${label})`);
    const url =
        Platform.OS === 'ios'
            ? `maps:0,0?q=${q}`
            : `geo:0,0?q=${lat},${lng}(${encodeURIComponent(label)})`;
    void Linking.openURL(url);
}

export function PassportTravelTrackerPanel({ userId }: { userId: string }) {
    const router = useRouter();
    const [pins, setPins] = useState<TravelReviewPin[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            setLoading(true);
            const rows = await TravelTrackerService.getReviewsWithCoordinates(userId);
            if (!cancelled) {
                setPins(rows);
                setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [userId]);

    if (loading) {
        return (
            <View style={styles.section}>
                <View style={styles.titleRow}>
                    <MapPin size={22} color={PINK} />
                    <SynthText variant="h2" style={styles.sectionTitle}>
                        Travel tracker
                    </SynthText>
                </View>
                <ActivityIndicator color={PINK} style={{ marginVertical: 16 }} />
            </View>
        );
    }

    if (pins.length === 0) {
        return (
            <View style={styles.section}>
                <View style={styles.titleRow}>
                    <MapPin size={22} color={PINK} />
                    <SynthText variant="h2" style={styles.sectionTitle}>
                        Travel tracker
                    </SynthText>
                </View>
                <SynthText variant="body" color="secondary" style={styles.empty}>
                    Reviews with venue locations will appear here so you can see where you have been.
                </SynthText>
            </View>
        );
    }

    const showLabel = `${pins.length} ${pins.length === 1 ? 'show' : 'shows'}`;

    return (
        <View style={styles.section}>
            <View style={styles.titleRow}>
                <MapPin size={22} color={PINK} />
                <SynthText variant="h2" style={styles.sectionTitle}>
                    Travel tracker
                </SynthText>
            </View>
            <View style={styles.showsRow}>
                <View style={styles.showsPill}>
                    <SynthText variant="meta" style={styles.showsPillText}>
                        {showLabel}
                    </SynthText>
                </View>
            </View>
            <SynthText variant="meta" color="secondary" style={styles.sub}>
                Shows on the map — tap a pin to open maps or view the event.
            </SynthText>
            {pins.map(pin => (
                <View key={pin.id} style={styles.card}>
                    <View style={styles.cardTop}>
                        <SynthText variant="body" style={styles.venue} numberOfLines={2}>
                            {pin.venue_name || 'Venue'}
                        </SynthText>
                        {pin.rating != null ? (
                            <View style={styles.starRow}>
                                <Star size={14} color={PINK} fill={PINK} />
                                <SynthText variant="meta">{pin.rating.toFixed(1)}</SynthText>
                            </View>
                        ) : null}
                    </View>
                    <SynthText variant="meta" color="secondary">
                        {new Date(pin.event_date).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                        })}
                        {pin.venue_state ? ` · ${pin.venue_state}` : ''}
                    </SynthText>
                    {pin.review_text ? (
                        <SynthText variant="meta" color="secondary" numberOfLines={2} style={styles.snippet}>
                            {pin.review_text}
                        </SynthText>
                    ) : null}
                    <View style={styles.actions}>
                        <Pressable style={styles.linkBtn} onPress={() => openMaps(pin.latitude, pin.longitude, pin.venue_name || 'Venue')}>
                            <ExternalLink size={16} color={PINK} />
                            <SynthText variant="meta" style={styles.linkTxt}>
                                Open in maps
                            </SynthText>
                        </Pressable>
                        {pin.event_id ? (
                            <Pressable style={styles.linkBtn} onPress={() => router.push(`/event/${pin.event_id}`)}>
                                <SynthText variant="meta" style={styles.linkTxt}>
                                    Event
                                </SynthText>
                            </Pressable>
                        ) : null}
                    </View>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    section: { marginTop: 20 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    sectionTitle: { fontSize: 18, fontWeight: '800' },
    sub: { marginBottom: 12, lineHeight: 20 },
    empty: { lineHeight: 22, marginTop: 4 },
    showsRow: { marginBottom: 6 },
    showsPill: {
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        backgroundColor: SynthTokens.colors.neutral50,
    },
    showsPillText: { fontWeight: '700' },
    card: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        padding: 14,
        marginBottom: 10,
        backgroundColor: SynthTokens.colors.neutral0,
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
    venue: { flex: 1, fontWeight: '700' },
    starRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    snippet: { marginTop: 8, lineHeight: 20 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
    linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    linkTxt: { color: PINK, fontWeight: '700' },
});
