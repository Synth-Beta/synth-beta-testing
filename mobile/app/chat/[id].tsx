import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, FlatList, TextInput, Pressable, KeyboardAvoidingView, Platform, Text, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Send, Image as ImageIcon, Star, MapPin, Calendar } from 'lucide-react-native';
import { Image } from 'expo-image';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { ChatService, Message } from '../../src/services/chatService';
import { EventService, type EventDetail } from '../../src/services/eventService';
import { supabase } from '../../src/integrations/supabase/client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PINK = SynthTokens.colors.brandPink500;

type ReviewCardInfo = {
    headline: string;
    subtitle: string;
    rating: number | null;
};

function formatEventWhen(iso: string | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function isPlaceholderContent(s: string): boolean {
    const t = s.trim();
    return t === 'Message' || t === '[Unable to decrypt message]' || t === '[Encrypted message]';
}

/** Match web UnifiedChatView: column first, then metadata (web shares often use metadata.event_id only). */
function resolveEventId(m: Message): string | null {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const fromCol =
        m.shared_event_id != null && String(m.shared_event_id).trim() !== ''
            ? String(m.shared_event_id).trim()
            : null;
    const fromMeta = meta.event_id != null ? String(meta.event_id).trim() : null;
    const id = fromCol ?? (fromMeta || null);
    return id || null;
}

function resolveReviewId(m: Message): string | null {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const fromCol =
        m.shared_review_id != null && String(m.shared_review_id).trim() !== ''
            ? String(m.shared_review_id).trim()
            : null;
    const fromMeta = meta.review_id != null ? String(meta.review_id).trim() : null;
    const id = fromCol ?? (fromMeta || null);
    return id || null;
}

export default function ChatThreadScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [userId, setUserId] = useState<string | null>(null);
    const [eventById, setEventById] = useState<Record<string, EventDetail | null>>({});
    const [reviewById, setReviewById] = useState<Record<string, ReviewCardInfo>>({});
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const flatListRef = useRef<FlatList>(null);

    const loadMessages = useCallback(async () => {
        const {
            data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        if (!user) return;
        setUserId(user.id);

        const data = await ChatService.getMessages(id, user.id);
        setMessages(data);
    }, [id]);

    useEffect(() => {
        void loadMessages();
    }, [loadMessages]);

    // Realtime: append new messages as they arrive in this chat
    useEffect(() => {
        if (!userId) return;
        const channel = supabase
            .channel(`chat-thread-${id}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${id}` },
                () => {
                    void loadMessages();
                    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
                }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [id, userId, loadMessages]);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const evIds = [
                ...new Set(
                    messages
                        .filter(m => {
                            if (m.message_type === 'system') return false;
                            if (m.message_type === 'review_share' && resolveReviewId(m)) return false;
                            const eid = resolveEventId(m);
                            if (!eid) return false;
                            const isEventShare = m.message_type === 'event_share' || !!eid;
                            return isEventShare;
                        })
                        .map(m => resolveEventId(m) as string)
                ),
            ];
            const revIds = [
                ...new Set(
                    messages
                        .map(m => resolveReviewId(m))
                        .filter((id): id is string => typeof id === 'string' && id.length > 0)
                ),
            ];

            const nextEvents: Record<string, EventDetail | null> = {};
            await Promise.all(
                evIds.map(async eid => {
                    nextEvents[eid] = await EventService.getEventById(eid);
                })
            );

            const nextReviews: Record<string, ReviewCardInfo> = {};
            if (revIds.length > 0) {
                const { data: revRows } = await supabase
                    .from('reviews')
                    .select(
                        `
            id,
            review_text,
            rating,
            events ( title, artist_name, venue_name )
          `
                    )
                    .in('id', revIds);
                (revRows || []).forEach((row: any) => {
                    const ev = row.events;
                    const headline =
                        (ev?.title as string) ||
                        (ev?.artist_name && ev?.venue_name
                            ? `${ev.artist_name} @ ${ev.venue_name}`
                            : 'Shared review');
                    const subtitle =
                        typeof row.review_text === 'string' && row.review_text.trim()
                            ? row.review_text.trim().slice(0, 120) + (row.review_text.length > 120 ? '…' : '')
                            : '';
                    nextReviews[row.id as string] = {
                        headline,
                        subtitle,
                        rating: typeof row.rating === 'number' ? row.rating : null,
                    };
                });
                revIds.forEach(rid => {
                    if (!nextReviews[rid]) {
                        nextReviews[rid] = { headline: 'Shared review', subtitle: '', rating: null };
                    }
                });
            }

            if (!cancelled) {
                setEventById(nextEvents);
                setReviewById(nextReviews);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [messages]);

    const handleSend = async () => {
        if (!inputText.trim() || !userId) return;

        const success = await ChatService.sendMessage(id, userId, inputText);
        if (success) {
            setInputText('');
            await loadMessages();
            setTimeout(() => flatListRef.current?.scrollToEnd(), 200);
        }
    };

    const openEvent = async (eventId: string) => {
        const routeId = await EventService.toEventRouteId(eventId);
        router.push(`/event/${routeId}`);
    };

    const renderMessage = ({ item }: { item: Message }) => {
        const meta = item.metadata ?? {};
        const reviewId = resolveReviewId(item);
        if (item.message_type === 'review_share' && reviewId) {
            const showReviewSpinner = !Object.prototype.hasOwnProperty.call(reviewById, reviewId);
            const rc = reviewById[reviewId];
            const snippet =
                rc?.subtitle ||
                (typeof meta.review_text === 'string' && meta.review_text) ||
                (typeof meta.custom_message === 'string' && meta.custom_message) ||
                (!isPlaceholderContent(item.content) ? item.content : '');
            const headline = rc?.headline || 'Review';
            return (
                <View
                    style={[
                        styles.messageWrapper,
                        item.is_mine ? styles.myMessageWrapper : styles.theirMessageWrapper,
                    ]}
                >
                    <Pressable
                        onPress={() => router.push(`/review/${reviewId}`)}
                        style={[styles.shareCard, item.is_mine ? styles.shareCardMine : styles.shareCardTheirs]}
                    >
                        <Text style={[styles.shareLabel, item.is_mine ? styles.shareLabelOnPink : styles.shareLabelMuted]}>REVIEW</Text>
                        {showReviewSpinner ? (
                            <ActivityIndicator color={item.is_mine ? SynthTokens.colors.neutral0 : PINK} style={{ marginVertical: 8 }} />
                        ) : (
                            <>
                                <SynthText
                                    variant="body"
                                    style={item.is_mine ? styles.shareTitleLight : styles.shareTitleDark}
                                    numberOfLines={2}
                                >
                                    {headline}
                                </SynthText>
                                {rc && rc.rating != null ? (
                                    <View style={styles.ratingRow}>
                                        <Star size={14} color={item.is_mine ? SynthTokens.colors.neutral0 : PINK} fill={PINK} />
                                        <Text style={[styles.ratingText, item.is_mine && styles.ratingTextLight]}>
                                            {rc.rating.toFixed(1)}
                                        </Text>
                                    </View>
                                ) : null}
                            </>
                        )}
                        {snippet ? (
                            <SynthText variant="meta" color="secondary" style={styles.shareHint} numberOfLines={4}>
                                {snippet}
                            </SynthText>
                        ) : null}
                    </Pressable>
                    <SynthText variant="meta" color="secondary" style={styles.messageTime}>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </SynthText>
                </View>
            );
        }

        const eventId = resolveEventId(item);
        const isEventShare = item.message_type === 'event_share' || !!eventId;
        const ev = eventId ? eventById[eventId] : undefined;
        const customNote = typeof meta.custom_message === 'string' ? meta.custom_message.trim() : '';

        const eventTitle =
            ev?.title ||
            (typeof meta.title === 'string' && meta.title) ||
            (typeof meta.event_title === 'string' && meta.event_title) ||
            (typeof meta.artist_name === 'string' && typeof meta.venue_name === 'string'
                ? `${meta.artist_name} @ ${meta.venue_name}`
                : null) ||
            (ev?.artist_name && ev?.venue_name ? `${ev.artist_name} @ ${ev.venue_name}` : null) ||
            'Shared event';

        const eventWhen = formatEventWhen(ev?.event_date);
        const eventPlace = ev?.venue_city || ev?.venue_name || '';

        if (isEventShare && eventId && item.message_type !== 'review_share' && item.message_type !== 'system') {
            const showEventSpinner = !Object.prototype.hasOwnProperty.call(eventById, eventId);
            const showHint =
                (customNote || (!isPlaceholderContent(item.content) ? item.content : '')).trim() || null;
            return (
                <View
                    style={[
                        styles.messageWrapper,
                        item.is_mine ? styles.myMessageWrapper : styles.theirMessageWrapper,
                    ]}
                >
                    <Pressable
                        onPress={() => void openEvent(eventId)}
                        style={[styles.shareCard, item.is_mine ? styles.shareCardMine : styles.shareCardTheirs]}
                    >
                        <Text style={[styles.shareLabel, item.is_mine ? styles.shareLabelOnPink : styles.shareLabelMuted]}>
                            UPCOMING EVENT
                        </Text>
                        {showEventSpinner ? (
                            <ActivityIndicator color={item.is_mine ? SynthTokens.colors.neutral0 : PINK} style={{ marginVertical: 8 }} />
                        ) : (
                            <>
                                {ev?.image_url ? (
                                    <Image source={{ uri: ev.image_url }} style={styles.shareImage} contentFit="cover" />
                                ) : null}
                                <SynthText variant="body" style={item.is_mine ? styles.shareTitleLight : styles.shareTitleDark}>
                                    {eventTitle}
                                </SynthText>
                                {eventWhen ? (
                                    <View style={styles.shareMetaRow}>
                                        <Calendar size={14} color={item.is_mine ? 'rgba(255,255,255,0.85)' : PINK} />
                                        <SynthText
                                            variant="meta"
                                            style={[styles.shareMetaText, item.is_mine ? styles.shareMetaOnPink : styles.shareMetaDark]}
                                        >
                                            {eventWhen}
                                        </SynthText>
                                    </View>
                                ) : null}
                                {eventPlace ? (
                                    <View style={styles.shareMetaRow}>
                                        <MapPin size={14} color={item.is_mine ? 'rgba(255,255,255,0.85)' : SynthTokens.colors.neutral600} />
                                        <SynthText
                                            variant="meta"
                                            style={[styles.shareMetaText, item.is_mine ? styles.shareMetaOnPink : styles.shareMetaDark]}
                                            numberOfLines={2}
                                        >
                                            {eventPlace}
                                        </SynthText>
                                    </View>
                                ) : null}
                            </>
                        )}
                        {showHint ? (
                            <SynthText variant="meta" color="secondary" style={styles.shareHint} numberOfLines={3}>
                                “{showHint}”
                            </SynthText>
                        ) : null}
                    </Pressable>
                    <SynthText variant="meta" color="secondary" style={styles.messageTime}>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </SynthText>
                </View>
            );
        }

        return (
            <View
                style={[
                    styles.messageWrapper,
                    item.is_mine ? styles.myMessageWrapper : styles.theirMessageWrapper,
                ]}
            >
                <View style={[styles.messageBubble, item.is_mine ? styles.myBubble : styles.theirBubble]}>
                    <SynthText variant="meta" color={item.is_mine ? 'white' : 'primary'}>
                        {item.content}
                    </SynthText>
                </View>
                <SynthText variant="meta" color="secondary" style={styles.messageTime}>
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </SynthText>
            </View>
        );
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft size={24} color={SynthTokens.colors.neutral900} />
                </Pressable>
                <SynthText variant="h2" style={styles.headerTitle}>
                    Chat
                </SynthText>
                <View style={{ width: 40 }} />
            </View>

            <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={renderMessage}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.messageList}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
            />

            <View style={[styles.inputArea, { paddingBottom: insets.bottom + 8 }]}>
                <Pressable style={styles.iconButton}>
                    <ImageIcon size={22} color={SynthTokens.colors.neutral600} />
                </Pressable>
                <TextInput
                    placeholder="Message..."
                    style={styles.input}
                    value={inputText}
                    onChangeText={setInputText}
                    multiline
                />
                <Pressable
                    onPress={() => void handleSend()}
                    style={[styles.sendButton, !inputText.trim() && styles.sendDisabled]}
                    disabled={!inputText.trim()}
                >
                    <Send size={20} color="white" />
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: SynthTokens.colors.neutral50,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SynthTokens.spacing.md,
        backgroundColor: SynthTokens.colors.neutral0,
        borderBottomWidth: 1,
        borderBottomColor: SynthTokens.colors.neutral200,
        paddingBottom: 8,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    messageList: {
        padding: SynthTokens.spacing.md,
    },
    messageWrapper: {
        marginBottom: SynthTokens.spacing.md,
        maxWidth: '88%',
    },
    myMessageWrapper: {
        alignSelf: 'flex-end',
        alignItems: 'flex-end',
    },
    theirMessageWrapper: {
        alignSelf: 'flex-start',
        alignItems: 'flex-start',
    },
    messageBubble: {
        paddingHorizontal: SynthTokens.spacing.md,
        paddingVertical: 10,
        borderRadius: 20,
    },
    myBubble: {
        backgroundColor: SynthTokens.colors.brandPink500,
        borderBottomRightRadius: 4,
    },
    theirBubble: {
        backgroundColor: SynthTokens.colors.neutral100,
        borderBottomLeftRadius: 4,
    },
    messageTime: {
        fontSize: 10,
        marginTop: 4,
    },
    inputArea: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SynthTokens.spacing.md,
        paddingTop: 8,
        backgroundColor: SynthTokens.colors.neutral0,
        borderTopWidth: 1,
        borderTopColor: SynthTokens.colors.neutral200,
    },
    input: {
        flex: 1,
        backgroundColor: SynthTokens.colors.neutral100,
        borderRadius: 20,
        paddingHorizontal: SynthTokens.spacing.md,
        paddingVertical: 8,
        marginHorizontal: SynthTokens.spacing.sm,
        fontSize: 16,
        maxHeight: 100,
    },
    iconButton: {
        padding: 8,
    },
    sendButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: SynthTokens.colors.brandPink500,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendDisabled: {
        opacity: 0.5,
    },
    shareCard: {
        maxWidth: '100%',
        minWidth: 260,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        overflow: 'hidden',
    },
    shareCardMine: {
        backgroundColor: SynthTokens.colors.brandPink600,
        borderColor: SynthTokens.colors.brandPink700,
    },
    shareCardTheirs: {
        backgroundColor: SynthTokens.colors.neutral0,
    },
    shareImage: {
        width: '100%',
        height: 120,
        borderRadius: 12,
        marginBottom: 10,
        backgroundColor: SynthTokens.colors.neutral100,
    },
    shareLabel: {
        fontSize: 10,
        fontWeight: '800',
        marginBottom: 6,
        letterSpacing: 0.8,
    },
    shareLabelOnPink: {
        color: 'rgba(255,255,255,0.92)',
    },
    shareLabelMuted: {
        color: SynthTokens.colors.brandPink500,
    },
    shareTitleLight: {
        color: SynthTokens.colors.neutral0,
        fontWeight: '700',
    },
    shareTitleDark: {
        color: SynthTokens.colors.neutral900,
        fontWeight: '700',
    },
    shareHint: {
        marginTop: 8,
    },
    shareMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 6,
    },
    shareMetaText: {
        flex: 1,
        fontSize: 13,
    },
    shareMetaOnPink: {
        color: 'rgba(255,255,255,0.92)',
    },
    shareMetaDark: {
        color: SynthTokens.colors.neutral600,
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 6,
    },
    ratingText: {
        fontSize: 14,
        fontWeight: '600',
        color: SynthTokens.colors.neutral900,
    },
    ratingTextLight: {
        color: SynthTokens.colors.neutral0,
    },
});
