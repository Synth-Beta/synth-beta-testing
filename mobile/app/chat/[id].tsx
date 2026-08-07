import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, View, FlatList, TextInput, Pressable, KeyboardAvoidingView, Platform, Text, ActivityIndicator, Alert, Keyboard, InteractionManager, DeviceEventEmitter } from 'react-native';
import { CHAT_READ_EVENT } from '../../src/hooks/useUnreadMessageCount';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, Send, Image as ImageIcon, Star, MapPin, Calendar, Music, FileText } from 'lucide-react-native';
import { Image } from 'expo-image';
import { SafeImage } from '../../src/components/SafeImage';
import { LinearGradient } from 'expo-linear-gradient';
import { ChatImageSourceSheet } from '../../src/components/chat/ChatImageSourceSheet';
import { GenreChatEventsRail } from '../../src/components/chat/GenreChatEventsRail';
import { SynthText } from '../../src/components/SynthText';
import { launchChatImagePicker, type ChatImagePickerSource } from '../../src/utils/launchChatImagePicker';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { ChatService, Message } from '../../src/services/chatService';
import { EventService, type EventDetail } from '../../src/services/eventService';
import { supabase } from '../../src/integrations/supabase/client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveChatImageDisplayUrl } from '../../src/utils/chatImageStorage';

const PINK = SynthTokens.colors.brandPink500;
const CHAT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

type ReviewCardInfo = {
    headline: string;
    subtitle: string;
    rating: number | null;
    artist_name: string | null;
    venue_name: string | null;
    venue_city: string | null;
    event_date: string | null;
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

/** Security: Private chat-images bucket — resolve signed URL at render time. */
function ChatImageBubble({ imageUrl, storagePath }: { imageUrl?: string | null; storagePath?: string | null }) {
    const [uri, setUri] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        resolveChatImageDisplayUrl(imageUrl, storagePath).then((resolved) => {
            if (!cancelled) setUri(resolved);
        });
        return () => {
            cancelled = true;
        };
    }, [imageUrl, storagePath]);

    if (!uri) return null;

    return (
        <SafeImage
            uri={uri}
            style={styles.chatImage}
            contentFit="cover"
            recyclingKey={uri}
            cachePolicy="memory-disk"
        />
    );
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
    const { id, title: titleParam } = useLocalSearchParams<{ id: string; title?: string }>();
    const [messages, setMessages] = useState<Message[]>([]);
    const [chatTitle, setChatTitle] = useState(() => (typeof titleParam === 'string' ? titleParam.trim() : '') || '');
    const [inputText, setInputText] = useState('');
    const [userId, setUserId] = useState<string | null>(null);
    const [eventById, setEventById] = useState<Record<string, EventDetail | null>>({});
    const [reviewById, setReviewById] = useState<Record<string, ReviewCardInfo>>({});
    const [uploadingImage, setUploadingImage] = useState(false);
    const [imageSourceSheetVisible, setImageSourceSheetVisible] = useState(false);
    const [isGroupChat, setIsGroupChat] = useState(false);
    const [entityType, setEntityType] = useState<string | null>(null);
    const [entityId, setEntityId] = useState<string | null>(null);
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const flatListRef = useRef<FlatList>(null);
    const stickToBottomRef = useRef(true);

    /** Inverted list: index 0 renders at the bottom — newest message first. */
    const listMessages = useMemo(() => [...messages].reverse(), [messages]);

    const scrollToLatest = useCallback((animated = false) => {
        if (!flatListRef.current || listMessages.length === 0) return;
        flatListRef.current.scrollToOffset({ offset: 0, animated });
    }, [listMessages.length]);

    const loadMessages = useCallback(async () => {
        const {
            data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        if (!user) return;
        setUserId(user.id);

        const data = await ChatService.getMessages(id, user.id);
        setMessages(data);
        stickToBottomRef.current = true;
    }, [id]);

    useEffect(() => {
        void loadMessages();
    }, [loadMessages]);

    useFocusEffect(
        useCallback(() => {
            void loadMessages();
            if (id) {
                supabase
                    .rpc('mark_chat_as_read', { p_chat_id: id })
                    .then(({ error }) => {
                        if (error) {
                            console.error('[chat] mark_chat_as_read failed:', id, error.message, error.details, error.hint, error.code);
                            void supabase.from('client_error_log').insert({
                                context: 'mark_chat_as_read',
                                error_message: error.message,
                                error_details: { chat_id: id, code: error.code, details: error.details, hint: error.hint },
                                platform: Platform.OS,
                            });
                        } else {
                            // Tell the tab bar's unread badge to recompute now, rather than
                            // waiting on a realtime round-trip that can silently miss events
                            // (e.g. switching tabs doesn't background the app, so the
                            // AppState foreground safety net never fires for this case).
                            DeviceEventEmitter.emit(CHAT_READ_EVENT);
                        }
                    });
            }
        }, [loadMessages, id])
    );

    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        void supabase
            .from('chats')
            .select('is_group_chat, entity_type, entity_id')
            .eq('id', id)
            .maybeSingle()
            .then(({ data }) => {
                if (!cancelled) {
                    setIsGroupChat(!!data?.is_group_chat);
                    setEntityType(data?.entity_type ?? null);
                    setEntityId(data?.entity_id ?? null);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [id]);

    useEffect(() => {
        const fromRoute = typeof titleParam === 'string' ? titleParam.trim() : '';
        if (fromRoute) {
            setChatTitle(fromRoute);
            return;
        }
        if (!userId || !id) return;
        let cancelled = false;
        void ChatService.getChatDisplayName(id, userId).then(name => {
            if (!cancelled && name) setChatTitle(name);
        });
        return () => {
            cancelled = true;
        };
    }, [id, userId, titleParam]);

    // Open on the most recent messages (inverted list: offset 0 = newest at bottom).
    useEffect(() => {
        if (listMessages.length === 0) return;
        const task = InteractionManager.runAfterInteractions(() => {
            requestAnimationFrame(() => {
                if (stickToBottomRef.current) {
                    scrollToLatest(false);
                }
            });
        });
        return () => task.cancel();
    }, [listMessages.length, id, scrollToLatest]);

    // Realtime: append new messages as they arrive in this chat
    useEffect(() => {
        if (!userId) return;
        const channel = supabase
            .channel(`chat-thread-${id}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${id}` },
                () => {
                    stickToBottomRef.current = true;
                    void loadMessages();
                    setTimeout(() => scrollToLatest(true), 150);
                }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [id, userId, loadMessages, scrollToLatest]);

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
            events ( title, artist_name, venue_name, venue_city, event_date )
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
                        artist_name: ev?.artist_name ?? null,
                        venue_name: ev?.venue_name ?? null,
                        venue_city: ev?.venue_city ?? null,
                        event_date: ev?.event_date ?? null,
                    };
                });
                revIds.forEach(rid => {
                    if (!nextReviews[rid]) {
                        nextReviews[rid] = { headline: 'Shared review', subtitle: '', rating: null, artist_name: null, venue_name: null, venue_city: null, event_date: null };
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

    // Share/event cards change height after load — keep pinned to latest when appropriate.
    useEffect(() => {
        if (!stickToBottomRef.current || messages.length === 0) return;
        const t = setTimeout(() => scrollToLatest(false), 120);
        return () => clearTimeout(t);
    }, [eventById, reviewById, messages.length, scrollToLatest]);

    const handleSend = async () => {
        if (!inputText.trim() || !userId) return;

        const success = await ChatService.sendMessage(id, userId, inputText);
        if (success) {
            setInputText('');
            stickToBottomRef.current = true;
            await loadMessages();
            setTimeout(() => scrollToLatest(true), 200);
        }
    };

    const runImagePick = async (source: ChatImagePickerSource) => {
        try {
            const result = await launchChatImagePicker(source);
            if (result == null) {
                Alert.alert(
                    'Permission required',
                    source === 'camera'
                        ? 'Camera access is needed to take photos.'
                        : 'Photo library access is needed to send images.'
                );
                return;
            }

            if (result.canceled || !result.assets?.[0]) return;

            const asset = result.assets[0];
            if (!userId || !asset.uri) return;

            if (asset.fileSize != null && asset.fileSize > CHAT_IMAGE_MAX_BYTES) {
                Alert.alert('File too large', 'Images must be under 8MB.');
                return;
            }

            setUploadingImage(true);
            try {
                const imageMeta = await ChatService.uploadChatImage(asset.uri, userId, {
                    mimeType: asset.mimeType,
                    fileName: asset.fileName,
                });
                if (!imageMeta) {
                    Alert.alert('Upload failed', 'Could not upload image. Please try again.');
                    return;
                }

                const { error } = await supabase.from('messages').insert({
                    chat_id: id,
                    sender_id: userId,
                    content: '[Image]',
                    message_type: 'image',
                    is_encrypted: false,
                    metadata: imageMeta,
                });

                if (!error) {
                    await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', id);
                    stickToBottomRef.current = true;
                    await loadMessages();
                    setTimeout(() => scrollToLatest(true), 200);
                } else {
                    console.error('[chat] insert image message:', error);
                    Alert.alert('Send failed', 'Could not send image. Please try again.');
                }
            } finally {
                setUploadingImage(false);
            }
        } catch (err) {
            console.error('[chat] image picker:', err);
            Alert.alert(
                'Could not open photos',
                source === 'camera'
                    ? 'The camera could not be opened. Please try again.'
                    : 'The photo library could not be opened. Please try again.'
            );
        }
    };

    const handlePickImage = () => {
        if (uploadingImage) return;
        Keyboard.dismiss();
        setImageSourceSheetVisible(true);
    };

    const openEvent = async (eventId: string) => {
        const routeId = await EventService.toEventRouteId(eventId);
        router.push(`/event/${routeId}`);
    };

    const renderStars = (rating: number) =>
        Array.from({ length: 5 }, (_, i) => (
            <Star
                key={i}
                size={13}
                color={'#F59E0B'}
                fill={i < Math.round(rating) ? ('#F59E0B') : 'transparent'}
            />
        ));

    const isPast = (iso?: string | null) => !!iso && new Date(iso) < new Date();

    const shouldShowSenderHeader = useCallback(
        (item: Message, listIndex: number) => {
            if (!isGroupChat || item.is_mine) return false;
            const olderAbove = listMessages[listIndex + 1];
            if (!olderAbove) return true;
            if (olderAbove.sender_id !== item.sender_id) return true;
            const groupable: Message['message_type'][] = ['text', 'review_share', 'event_share', 'image'];
            return !groupable.includes(olderAbove.message_type);
        },
        [isGroupChat, listMessages]
    );

    const renderSenderHeader = (item: Message) => {
        const name = item.sender_name || 'User';
        const initial = name.trim().charAt(0).toUpperCase() || 'U';
        return (
            <View style={styles.senderRow}>
                {item.sender_avatar ? (
                    <Image source={{ uri: item.sender_avatar }} style={styles.senderAvatar} contentFit="cover" />
                ) : (
                    <View style={styles.senderAvatarFallback}>
                        <Text style={styles.senderAvatarInitial}>{initial}</Text>
                    </View>
                )}
                <Text style={styles.senderName}>{name}</Text>
            </View>
        );
    };

    const renderMessage = ({ item, index }: { item: Message; index: number }) => {
        const showSender = shouldShowSenderHeader(item, index);
        const senderHeader = showSender ? renderSenderHeader(item) : null;
        const meta = item.metadata ?? {};
        const reviewId = resolveReviewId(item);

        // ── IMAGE MESSAGE ─────────────────────────────────────────────────────
        const inlineMeta = (item.metadata ?? {}) as Record<string, unknown>;
        const imageUrl =
            (typeof inlineMeta.image_url === 'string' && inlineMeta.image_url.trim()) ||
            (typeof inlineMeta.imageUrl === 'string' && inlineMeta.imageUrl.trim()) ||
            null;
        const storagePath =
            (typeof inlineMeta.storage_path === 'string' && inlineMeta.storage_path.trim()) || null;
        if (item.message_type === 'image' && (imageUrl || storagePath)) {
            return (
                <View style={[styles.messageWrapper, item.is_mine ? styles.myMessageWrapper : styles.theirMessageWrapper]}>
                    {senderHeader}
                    <ChatImageBubble imageUrl={imageUrl} storagePath={storagePath} />
                    <SynthText variant="meta" color="secondary" style={styles.messageTime}>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </SynthText>
                </View>
            );
        }

        // ── REVIEW SHARE ──────────────────────────────────────────────────────
        if (item.message_type === 'review_share' && reviewId) {
            const loading = !Object.prototype.hasOwnProperty.call(reviewById, reviewId);
            const rc = reviewById[reviewId];
            const customNote =
                (typeof meta.custom_message === 'string' && meta.custom_message.trim()) ||
                (!isPlaceholderContent(item.content) ? item.content.trim() : '');
            const snippet = rc?.subtitle || (typeof meta.review_text === 'string' ? meta.review_text : '');
            const headline = rc?.headline || 'Shared Review';
            const past = isPast(rc?.event_date);
            return (
                <View style={[styles.messageWrapper, item.is_mine ? styles.myMessageWrapper : styles.theirMessageWrapper]}>
                    {senderHeader}
                    <Pressable onPress={() => router.push(`/review/${reviewId}`)} style={styles.shareCard}>
                        {/* Gradient header band */}
                        <LinearGradient
                            colors={['#EC4899', '#9333EA']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.shareCardHeader}
                        >
                            <View style={styles.shareCardHeaderIcon}>
                                <FileText size={16} color="#fff" />
                            </View>
                            <Text style={styles.shareCardHeaderLabel}>Concert Review</Text>
                            {past && (
                                <View style={styles.shareCardBadge}>
                                    <Text style={styles.shareCardBadgeText}>Past Event</Text>
                                </View>
                            )}
                        </LinearGradient>

                        {/* Card body */}
                        <View style={styles.shareCardBody}>
                            {loading ? (
                                <ActivityIndicator color={PINK} style={{ marginVertical: 12 }} />
                            ) : (
                                <>
                                    {customNote ? (
                                        <View style={styles.shareCustomNote}>
                                            <Text style={styles.shareCustomNoteText}>"{customNote}"</Text>
                                        </View>
                                    ) : null}
                                    <Text style={styles.shareCardTitle} numberOfLines={2}>{headline}</Text>
                                    {rc?.artist_name ? (
                                        <Text style={styles.shareCardArtist}>{rc.artist_name}</Text>
                                    ) : null}
                                    {rc?.rating != null ? (
                                        <View style={styles.ratingRow}>
                                            {renderStars(rc.rating)}
                                            <Text style={styles.ratingText}>{rc.rating.toFixed(1)}</Text>
                                        </View>
                                    ) : null}
                                    {snippet ? (
                                        <View style={styles.shareSnippetBox}>
                                            <Text style={styles.shareSnippetText} numberOfLines={4}>"{snippet}"</Text>
                                        </View>
                                    ) : null}
                                    {rc?.event_date ? (
                                        <View style={styles.shareMetaRow}>
                                            <Calendar size={13} color={PINK} />
                                            <Text style={styles.shareMetaText}>{formatEventWhen(rc.event_date)}</Text>
                                        </View>
                                    ) : null}
                                    {rc?.venue_name ? (
                                        <View style={styles.shareMetaRow}>
                                            <MapPin size={13} color={PINK} />
                                            <Text style={styles.shareMetaText} numberOfLines={1}>
                                                {[rc.venue_name, rc.venue_city].filter(Boolean).join(', ')}
                                            </Text>
                                        </View>
                                    ) : null}
                                </>
                            )}
                            <Text style={styles.shareViewDetails}>View Full Review →</Text>
                        </View>
                    </Pressable>
                    <SynthText variant="meta" color="secondary" style={styles.messageTime}>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </SynthText>
                </View>
            );
        }

        // ── EVENT SHARE ───────────────────────────────────────────────────────
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
        const eventPlace = ev?.venue_city || (ev?.venue_name ?? '');
        const artistName = ev?.artist_name || (typeof meta.artist_name === 'string' ? meta.artist_name : '');
        const past = isPast(ev?.event_date);

        if (isEventShare && eventId && item.message_type !== 'review_share' && item.message_type !== 'system') {
            const loading = !Object.prototype.hasOwnProperty.call(eventById, eventId);
            const showHint =
                (customNote || (!isPlaceholderContent(item.content) ? item.content : '')).trim() || null;
            return (
                <View style={[styles.messageWrapper, item.is_mine ? styles.myMessageWrapper : styles.theirMessageWrapper]}>
                    {senderHeader}
                    <Pressable onPress={() => void openEvent(eventId)} style={styles.shareCard}>
                        {/* Gradient header band */}
                        <LinearGradient
                            colors={['#EC4899', '#9333EA']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.shareCardHeader}
                        >
                            <View style={styles.shareCardHeaderIcon}>
                                <Music size={16} color="#fff" />
                            </View>
                            <Text style={styles.shareCardHeaderLabel}>Shared Event</Text>
                            <View style={styles.shareCardBadge}>
                                <Text style={styles.shareCardBadgeText}>{past ? 'Past Event' : 'Upcoming'}</Text>
                            </View>
                        </LinearGradient>

                        {/* Card body */}
                        <View style={styles.shareCardBody}>
                            {loading ? (
                                <ActivityIndicator color={PINK} style={{ marginVertical: 12 }} />
                            ) : (
                                <>
                                    {ev?.image_url ? (
                                        <Image source={{ uri: ev.image_url }} style={styles.shareImage} contentFit="cover" />
                                    ) : null}
                                    {showHint ? (
                                        <View style={styles.shareCustomNote}>
                                            <Text style={styles.shareCustomNoteText}>"{showHint}"</Text>
                                        </View>
                                    ) : null}
                                    <Text style={styles.shareCardTitle} numberOfLines={2}>{eventTitle}</Text>
                                    {artistName ? (
                                        <Text style={styles.shareCardArtist}>{artistName}</Text>
                                    ) : null}
                                    {eventWhen ? (
                                        <View style={styles.shareMetaRow}>
                                            <Calendar size={13} color={PINK} />
                                            <Text style={styles.shareMetaText}>{eventWhen}</Text>
                                        </View>
                                    ) : null}
                                    {eventPlace ? (
                                        <View style={styles.shareMetaRow}>
                                            <MapPin size={13} color={PINK} />
                                            <Text style={styles.shareMetaText} numberOfLines={1}>{eventPlace}</Text>
                                        </View>
                                    ) : null}
                                </>
                            )}
                            <Text style={styles.shareViewDetails}>View Full Details →</Text>
                        </View>
                    </Pressable>
                    <SynthText variant="meta" color="secondary" style={styles.messageTime}>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </SynthText>
                </View>
            );
        }

        // ── PLAIN TEXT MESSAGE ────────────────────────────────────────────────
        return (
            <View style={[styles.messageWrapper, item.is_mine ? styles.myMessageWrapper : styles.theirMessageWrapper]}>
                {senderHeader}
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
        <View style={styles.screenRoot}>
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft size={24} color={SynthTokens.colors.neutral900} />
                </Pressable>
                <SynthText variant="h2" style={styles.headerTitle} numberOfLines={1}>
                    {chatTitle || 'Messages'}
                </SynthText>
                <View style={{ width: 40 }} />
            </View>

            {entityType === 'genre' && entityId && <GenreChatEventsRail genreChatId={entityId} />}

            <FlatList
                ref={flatListRef}
                data={listMessages}
                renderItem={({ item, index }) => renderMessage({ item, index })}
                keyExtractor={item => item.id}
                inverted
                contentContainerStyle={styles.messageList}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={() => {
                    if (stickToBottomRef.current) {
                        scrollToLatest(false);
                    }
                }}
                onScroll={e => {
                    const y = e.nativeEvent.contentOffset.y;
                    stickToBottomRef.current = y < 80;
                }}
                scrollEventThrottle={100}
            />

            <View style={[styles.inputArea, { paddingBottom: insets.bottom + 8 }]}>
                <Pressable
                    style={styles.iconButton}
                    onPress={handlePickImage}
                    disabled={uploadingImage}
                >
                    {uploadingImage
                        ? <ActivityIndicator size="small" color={PINK} />
                        : <ImageIcon size={22} color={SynthTokens.colors.neutral600} />
                    }
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

        <ChatImageSourceSheet
            visible={imageSourceSheetVisible}
            onClose={() => setImageSourceSheetVisible(false)}
            onChoose={source => void runImagePick(source)}
        />
        </View>
    );
}

const styles = StyleSheet.create({
    screenRoot: {
        flex: 1,
    },
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
        flex: 1,
        fontSize: 18,
        fontWeight: 'bold',
        textAlign: 'center',
        marginHorizontal: 4,
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
    chatImage: {
        width: 220,
        height: 220,
        borderRadius: 16,
        backgroundColor: SynthTokens.colors.neutral100,
    },
    // ── Share cards ──────────────────────────────────────────────────────────
    shareCard: {
        maxWidth: 300,
        minWidth: 260,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#FBCFE8',
        overflow: 'hidden',
        backgroundColor: SynthTokens.colors.neutral0,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
    },
    shareCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 8,
    },
    shareCardHeaderIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.20)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    shareCardHeaderLabel: {
        flex: 1,
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    shareCardBadge: {
        backgroundColor: 'rgba(255,255,255,0.22)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.50)',
    },
    shareCardBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    shareCardBody: {
        padding: 12,
        gap: 0,
    },
    shareCustomNote: {
        backgroundColor: SynthTokens.colors.neutral50,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#FBCFE8',
    },
    shareCustomNoteText: {
        fontSize: 13,
        color: '#374151',
        fontStyle: 'italic',
    },
    shareCardTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: SynthTokens.colors.neutral900,
        marginBottom: 2,
    },
    shareCardArtist: {
        fontSize: 13,
        fontWeight: '600',
        color: SynthTokens.colors.brandPink500,
        marginBottom: 6,
    },
    shareSnippetBox: {
        backgroundColor: 'rgba(251,207,232,0.25)',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginTop: 6,
        marginBottom: 4,
        borderWidth: 1,
        borderColor: '#FBCFE8',
    },
    shareSnippetText: {
        fontSize: 13,
        color: '#374151',
        fontStyle: 'italic',
    },
    shareImage: {
        width: '100%',
        height: 130,
        borderRadius: 10,
        marginBottom: 10,
        backgroundColor: SynthTokens.colors.neutral100,
    },
    shareMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 5,
    },
    shareMetaText: {
        flex: 1,
        fontSize: 12,
        color: SynthTokens.colors.neutral600,
    },
    shareViewDetails: {
        marginTop: 10,
        fontSize: 12,
        fontWeight: '600',
        color: SynthTokens.colors.brandPink500,
        textAlign: 'right',
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        marginTop: 4,
        marginBottom: 2,
    },
    ratingText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#374151',
        marginLeft: 4,
    },
    senderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    senderAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    senderAvatarFallback: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: SynthTokens.colors.brandPink500,
        alignItems: 'center',
        justifyContent: 'center',
    },
    senderAvatarInitial: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
    senderName: {
        fontSize: 14,
        fontWeight: '700',
        color: SynthTokens.colors.neutral900,
    },
});
