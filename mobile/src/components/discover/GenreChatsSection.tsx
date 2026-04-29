/**
 * GenreChatsSection — horizontal scroll of genre community chat cards.
 * Shown at the bottom of the Discover tab (below Calendar + Tour Tracker).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MessageCircle, Users } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { GenreChatService, type GenreChatInfo, type GenreConfig } from '../../services/genreChatService';

const PINK = SynthTokens.colors.brandPink500;

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

    return (
        <View style={[styles.card, { borderTopColor: genre.color }]}>
            {/* Emoji + name */}
            <Text style={styles.cardEmoji}>{genre.emoji}</Text>
            <SynthText variant="body" style={styles.cardName} numberOfLines={1}>
                {genre.name}
            </SynthText>
            <SynthText variant="meta" color="secondary" style={styles.cardDesc} numberOfLines={2}>
                {genre.description}
            </SynthText>

            {/* Member count */}
            <View style={styles.memberRow}>
                <Users size={12} color={SynthTokens.colors.neutral400} />
                <Text style={styles.memberText}>
                    {`${formatCount(memberCount)} ${memberCount === 1 ? 'member' : 'members'}`}
                </Text>
            </View>

            {/* Action button */}
            {isJoined && chatId ? (
                <View style={styles.joinedActions}>
                    <View style={[styles.joinedBadge, { backgroundColor: `${genre.color}18` }]}>
                        <Text style={[styles.joinedBadgeText, { color: genre.color }]}>✓ Joined</Text>
                    </View>
                    <Pressable
                        onPress={() => onNavigate(chatId)}
                        style={[styles.chatBtn, { borderColor: genre.color }]}
                    >
                        <MessageCircle size={13} color={genre.color} />
                        <Text style={[styles.chatBtnText, { color: genre.color }]}>Open</Text>
                    </Pressable>
                </View>
            ) : (
                <Pressable
                    onPress={() => onJoin(genre.id)}
                    disabled={joining}
                    style={[styles.joinBtn, { backgroundColor: genre.color }]}
                >
                    {joining ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Text style={styles.joinBtnText}>Join</Text>
                    )}
                </Pressable>
            )}
        </View>
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
                router.push(`/chat/${chatId}` as any);
            } else {
                Alert.alert('Error', 'Could not join chat. Please try again.');
            }
        } catch {
            Alert.alert('Error', 'Could not join chat. Please try again.');
        } finally {
            setJoiningId(null);
        }
    };

    const handleNavigate = (chatId: string) => {
        router.push(`/chat/${chatId}` as any);
    };

    return (
        <View style={styles.container}>
            {/* Section header */}
            <View style={styles.header}>
                <View>
                    <SynthText variant="h2" style={styles.title}>Genre Communities</SynthText>
                    <SynthText variant="meta" color="secondary" style={styles.subtitle}>
                        Join chats with fans who share your taste
                    </SynthText>
                </View>
            </View>

            {loading ? (
                <View style={styles.loadingRow}>
                    <ActivityIndicator color={PINK} />
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

const CARD_W = 148;

const styles = StyleSheet.create({
    container: {
        marginTop: 28,
        marginBottom: 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: SynthTokens.colors.neutral900,
    },
    subtitle: {
        marginTop: 2,
        fontSize: 13,
    },
    loadingRow: {
        height: 180,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollContent: {
        paddingRight: SynthTokens.spacing.md,
        gap: 12,
    },
    card: {
        width: CARD_W,
        backgroundColor: SynthTokens.colors.neutral0,
        borderRadius: 18,
        borderTopWidth: 3,
        padding: 14,
        gap: 6,
        shadowColor: '#000',
        shadowOpacity: 0.07,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral100,
    },
    cardEmoji: {
        fontSize: 28,
        marginBottom: 2,
    },
    cardName: {
        fontWeight: '700',
        fontSize: 14,
        color: SynthTokens.colors.neutral900,
    },
    cardDesc: {
        fontSize: 11,
        lineHeight: 15,
        color: SynthTokens.colors.neutral500,
        flexShrink: 1,
    },
    memberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    memberText: {
        fontSize: 11,
        color: SynthTokens.colors.neutral400,
        fontWeight: '500',
    },
    joinBtn: {
        marginTop: 6,
        borderRadius: 10,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 34,
    },
    joinBtnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 13,
    },
    joinedActions: {
        marginTop: 6,
        gap: 6,
    },
    joinedBadge: {
        borderRadius: 8,
        paddingVertical: 5,
        alignItems: 'center',
    },
    joinedBadgeText: {
        fontWeight: '700',
        fontSize: 12,
    },
    chatBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        borderRadius: 8,
        paddingVertical: 5,
        borderWidth: 1.5,
    },
    chatBtnText: {
        fontWeight: '700',
        fontSize: 12,
    },
});
