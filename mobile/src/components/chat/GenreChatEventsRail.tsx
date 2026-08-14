import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Music } from 'lucide-react-native';
import { getUpcomingEventsForGenreChat } from '@synth/shared';
import { supabase } from '../../integrations/supabase/client';
import { SynthTokens } from '../../tokens/SynthTokens';
import { GENRE_CONFIGS } from '../../services/genreChatService';
import { resolveApproxUserLocation } from '../../hooks/useApproxUserLocation';

interface GenreEventRow {
    id: string;
    title?: string | null;
    artist_name?: string | null;
    venue_name?: string | null;
    venue_city?: string | null;
    event_date: string;
    distanceMiles?: number | null;
}

interface GenreChatEventsRailProps {
    genreChatId: string;
}

function formatRailDate(iso: string): string {
    const d = new Date(iso);
    return Number.isFinite(d.getTime())
        ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : '';
}

/** Persistent "Upcoming Shows" strip inside a genre chat, matched via GENRE_CHAT_TAG_MAP. */
export function GenreChatEventsRail({ genreChatId }: GenreChatEventsRailProps) {
    const router = useRouter();
    const [events, setEvents] = useState<GenreEventRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        void resolveApproxUserLocation()
            .then((near) =>
                getUpcomingEventsForGenreChat(
                    supabase,
                    genreChatId,
                    10,
                    near ? { latitude: near.latitude, longitude: near.longitude, radiusMiles: 40 } : undefined
                )
            )
            .then((rows) => {
                if (!cancelled) {
                    setEvents(rows as unknown as GenreEventRow[]);
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [genreChatId]);

    if (!loading && events.length === 0) return null;

    const genre = GENRE_CONFIGS.find((g) => g.id === genreChatId);
    const title = genre ? `${genre.emoji} Upcoming ${genre.name} Shows` : 'Upcoming Shows';

    return (
        <View style={styles.section}>
            <Text style={styles.title}>{title}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                {events.map((e) => {
                    const distanceLabel =
                        typeof e.distanceMiles === 'number'
                            ? `${Math.round(e.distanceMiles)} mi`
                            : e.venue_city || undefined;
                    return (
                        <TouchableOpacity
                            key={e.id}
                            style={styles.card}
                            onPress={() => router.push(`/event/${e.id}` as any)}
                        >
                            <View style={styles.iconWrap}>
                                <Music size={20} color={SynthTokens.colors.brandPink500} />
                            </View>
                            <Text style={styles.name} numberOfLines={1}>
                                {e.artist_name || e.title || 'Show'}
                            </Text>
                            <Text style={styles.meta} numberOfLines={1}>
                                {e.venue_name || ''}
                            </Text>
                            <Text style={styles.meta} numberOfLines={1}>
                                {formatRailDate(e.event_date)}
                            </Text>
                            {distanceLabel && (
                                <Text style={styles.meta} numberOfLines={1}>
                                    {distanceLabel}
                                </Text>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const CARD_W = 136;

const styles = StyleSheet.create({
    section: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
        paddingBottom: 10,
        paddingTop: 8,
    },
    title: {
        fontSize: 14,
        fontWeight: '700',
        color: SynthTokens.colors.neutral900,
        marginBottom: 8,
        marginLeft: 16,
    },
    row: { paddingHorizontal: 16, gap: 10 },
    card: {
        width: CARD_W,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(236, 72, 153, 0.25)',
        backgroundColor: '#fff',
        paddingHorizontal: 10,
        paddingTop: 10,
        paddingBottom: 8,
        alignItems: 'center',
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(236, 72, 153, 0.12)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6,
    },
    name: { fontSize: 13, fontWeight: '600', color: SynthTokens.colors.neutral900, textAlign: 'center', width: '100%' },
    meta: { fontSize: 11, color: SynthTokens.colors.neutral600, textAlign: 'center', width: '100%', marginTop: 1 },
});
