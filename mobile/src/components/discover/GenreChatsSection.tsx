/**
 * GenreChatsSection — horizontal scroll of genre community chat cards.
 * Shown at the top of the Messages tab, above the chat list.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SkeletonBox } from '../skeletons';
import { SynthTokens } from '../../tokens/SynthTokens';
import { GenreChatService, pastelFromHex, type GenreChatInfo } from '../../services/genreChatService';
import { showToast } from '../Toast';
import { PressableScale } from '../../motion/PressableScale';

function formatCount(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
}

function GenreCard({
    info,
    onJoin,
    onNavigate,
    joining,
}: {
    info: GenreChatInfo;
    onJoin: (genreId: string) => void;
    onNavigate: (chatId: string) => void;
    joining: boolean;
}) {
    const { genre, chatId, memberCount, isJoined } = info;
    const joined = Boolean(isJoined && chatId);

    return (
        // The genre's own tint is the only surface cue: no border, no shadow.
        <Pressable
            onPress={() => (joined && chatId ? onNavigate(chatId) : undefined)}
            disabled={!joined}
            style={[styles.card, { backgroundColor: pastelFromHex(genre.color) }]}
            accessibilityRole={joined ? 'link' : undefined}
            accessibilityLabel={joined ? `Open ${genre.name} chat` : undefined}
        >
            {/* Same emoji mark the chat list uses for this community. */}
            <Text style={styles.cardEmoji}>{genre.emoji}</Text>
            <View style={styles.textCol}>
                <Text style={styles.cardName} numberOfLines={1}>
                    {genre.name}
                </Text>
                <Text style={styles.memberText} numberOfLines={1}>
                    {`${formatCount(memberCount)} ${memberCount === 1 ? 'member' : 'members'}`}
                </Text>
            </View>
            {joined && chatId ? (
                <PressableScale
                    haptic="light"
                    onPress={() => onNavigate(chatId)}
                    style={[styles.pillBtn, styles.openBtn]}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${genre.name} chat`}
                >
                    <Text style={styles.openBtnText}>Open</Text>
                </PressableScale>
            ) : (
                <PressableScale
                    haptic="light"
                    onPress={() => onJoin(genre.id)}
                    disabled={joining}
                    style={[styles.pillBtn, styles.joinBtn]}
                    accessibilityRole="button"
                    accessibilityLabel={`Join ${genre.name}`}
                >
                    {joining ? (
                        <ActivityIndicator size="small" color={SynthTokens.colors.neutral0} />
                    ) : (
                        <Text style={styles.joinBtnText}>Join</Text>
                    )}
                </PressableScale>
            )}
        </Pressable>
    );
}

interface Props {
    currentUserId: string;
}

export function GenreChatsSection({ currentUserId }: Props) {
    const router = useRouter();
    const [genres, setGenres] = useState<GenreChatInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [joiningId, setJoiningId] = useState<string | null>(null);

    const loadGenres = useCallback(async () => {
        const data = await GenreChatService.getGenreChats(currentUserId);
        setGenres(data);
        setLoading(false);
    }, [currentUserId]);

    useEffect(() => {
        void loadGenres();
    }, [loadGenres]);

    // Reload when user returns to the discover tab so join state stays accurate
    useFocusEffect(useCallback(() => {
        void loadGenres();
    }, [loadGenres]));

    const handleJoin = async (genreId: string) => {
        setJoiningId(genreId);
        try {
            const chatId = await GenreChatService.joinGenre(genreId, currentUserId);
            if (chatId) {
                setGenres(prev =>
                    prev.map(g =>
                        g.genre.id === genreId
                            ? { ...g, chatId, isJoined: true, memberCount: g.memberCount + 1 }
                            : g
                    )
                );
            } else {
                showToast('Try again in a moment.', { title: "Couldn't join" });
            }
        } catch {
            showToast('Try again in a moment.', { title: "Couldn't join" });
        } finally {
            setJoiningId(null);
        }
    };

    const handleNavigate = (chatId: string) => {
        router.push(`/chat/${chatId}` as any);
    };

    return (
        <View style={styles.container}>
            <Text style={styles.label}>Communities</Text>
            {loading ? (
                <View style={[styles.loadingRow, styles.scrollContent]}>
                    {[0, 1, 2].map((i) => (
                        <SkeletonBox key={i} width={CARD_W} height={CARD_H} borderRadius={14} />
                    ))}
                </View>
            ) : (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                >
                    {genres.map(info => (
                        <GenreCard
                            key={info.genre.id}
                            info={info}
                            onJoin={handleJoin}
                            onNavigate={handleNavigate}
                            joining={joiningId === info.genre.id}
                        />
                    ))}
                </ScrollView>
            )}
        </View>
    );
}

/** Row cards: ~1.6 fit on a phone, so the rail reads as scrollable and costs one row of height. */
const CARD_W = 224;
const CARD_H = 64;

const styles = StyleSheet.create({
    container: {
        marginTop: 16,
        marginBottom: 8,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: SynthTokens.colors.neutral600,
        marginBottom: 8,
    },
    loadingRow: {
        flexDirection: 'row',
        overflow: 'hidden',
    },
    scrollContent: {
        paddingRight: SynthTokens.spacing.md,
        gap: 8,
    },
    card: {
        width: CARD_W,
        height: CARD_H,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 14,
        paddingLeft: 12,
        paddingRight: 10,
    },
    cardEmoji: {
        fontSize: 22,
        lineHeight: 26,
    },
    textCol: {
        flex: 1,
        minWidth: 0,
    },
    cardName: {
        fontSize: 15,
        lineHeight: 20,
        fontWeight: '600',
        color: SynthTokens.colors.neutral900,
    },
    memberText: {
        fontSize: 12,
        lineHeight: 16,
        color: SynthTokens.colors.neutral600,
        fontVariant: ['tabular-nums'],
    },
    pillBtn: {
        height: 32,
        minWidth: 56,
        paddingHorizontal: 14,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Ink, not the genre color: white on amber/lime/cyan fails 4.5:1 at 13px.
    joinBtn: {
        backgroundColor: SynthTokens.colors.neutral900,
    },
    joinBtnText: {
        color: SynthTokens.colors.neutral0,
        fontWeight: '600',
        fontSize: 13,
    },
    openBtn: {
        backgroundColor: SynthTokens.colors.neutral0,
    },
    openBtnText: {
        color: SynthTokens.colors.neutral900,
        fontWeight: '600',
        fontSize: 13,
    },
});
