/**
 * ShareToChatModal — bottom sheet for sharing an event or review into a Synth chat.
 * Mirrors web UniversalShareModal / ReviewShareModal.
 *
 * Usage:
 *   <ShareToChatModal
 *     visible={open}
 *     onClose={() => setOpen(false)}
 *     type="event"          // 'event' | 'review'
 *     entityId={eventId}    // UUID of the event or review
 *     title="Artist @ Venue"
 *     currentUserId={userId}
 *   />
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    Share,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { Check, Link2, MessageCircle, Search, Send, Share2, Users, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { InAppShareService, type ShareTarget } from '../../services/inAppShareService';
import { getExpoSiteUrl } from '../../utils/siteUrl';

const PINK = SynthTokens.colors.brandPink500;

interface ShareToChatModalProps {
    visible: boolean;
    onClose: () => void;
    /** 'event' or 'review' */
    type: 'event' | 'review';
    /** UUID of the event or review to share */
    entityId: string;
    /** Display title shown in the modal header */
    title?: string;
    currentUserId: string;
}

function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
    const letter = (name || '?').charAt(0).toUpperCase();
    return url ? (
        <Image
            source={{ uri: url }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            contentFit="cover"
        />
    ) : (
        <View
            style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: PINK,
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.4 }}>{letter}</Text>
        </View>
    );
}

export function ShareToChatModal({
    visible,
    onClose,
    type,
    entityId,
    title,
    currentUserId,
}: ShareToChatModalProps) {
    const insets = useSafeAreaInsets();
    const [targets, setTargets] = useState<ShareTarget[]>([]);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [query, setQuery] = useState('');
    const [customMessage, setCustomMessage] = useState('');
    const [sent, setSent] = useState(false);
    const inputRef = useRef<TextInput>(null);

    const shareUrl = `${getExpoSiteUrl()}/share?${type}=${encodeURIComponent(entityId)}`;

    const handleCopyLink = async () => {
        try {
            await Clipboard.setStringAsync(shareUrl);
            Alert.alert('Copied', 'Link copied to clipboard.');
        } catch (err) {
            console.error('[ShareToChatModal] copy link', err);
            Alert.alert('Copy failed', 'Could not copy link. Please try again.');
        }
    };

    const handleShareExternally = async () => {
        try {
            // iOS reads `url`; Android typically uses `message`.
            const message = title?.trim()
                ? `${title.trim()}\n\n${shareUrl}`
                : shareUrl;
            await Share.share(
                Platform.OS === 'ios'
                    ? { title: title || 'Synth', message, url: shareUrl }
                    : { title: title || 'Synth', message }
            );
        } catch (err: any) {
            // ignore user cancel
            if (err?.message && /cancel/i.test(String(err.message))) return;
            console.error('[ShareToChatModal] external share', err);
        }
    };

    const loadTargets = useCallback(async () => {
        setLoading(true);
        try {
            const [groups, friends] = await Promise.all([
                InAppShareService.getGroupChatTargets(currentUserId),
                InAppShareService.getFriendTargets(currentUserId),
            ]);
            setTargets([...groups, ...friends]);
        } catch (err) {
            console.error('[ShareToChatModal] loadTargets', err);
        } finally {
            setLoading(false);
        }
    }, [currentUserId]);

    useEffect(() => {
        if (visible) {
            setSent(false);
            setSelected(new Set());
            setQuery('');
            setCustomMessage('');
            void loadTargets();
        }
    }, [visible, loadTargets]);

    const toggleTarget = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleSend = async () => {
        if (!selected.size || !entityId || !currentUserId || sending) return;
        Keyboard.dismiss();
        setSending(true);
        const msg = customMessage.trim() || undefined;
        let successCount = 0;

        for (const targetId of selected) {
            const isFriend = targetId.startsWith('friend-');
            const friendUserId = isFriend ? targetId.replace('friend-', '') : null;

            let result;
            if (type === 'event') {
                result = isFriend
                    ? await InAppShareService.shareEventToFriend(entityId, friendUserId!, currentUserId, msg)
                    : await InAppShareService.shareEventToChat(entityId, targetId, currentUserId, msg);
            } else {
                result = isFriend
                    ? await InAppShareService.shareReviewToFriend(entityId, friendUserId!, currentUserId, msg)
                    : await InAppShareService.shareReviewToChat(entityId, targetId, currentUserId, msg);
            }

            if (result.success) successCount++;
        }

        setSending(false);
        if (successCount > 0) {
            setSent(true);
            setTimeout(() => {
                onClose();
            }, 900);
        } else {
            Alert.alert('Share failed', 'Could not send to any selected chat. Please try again.');
        }
    };

    const filtered = targets.filter(t =>
        !query || t.name.toLowerCase().includes(query.toLowerCase())
    );

    const groups = filtered.filter(t => t.type === 'group');
    const friends = filtered.filter(t => t.type === 'friend');

    const renderTarget = ({ item }: { item: ShareTarget }) => {
        const isSelected = selected.has(item.id);
        return (
            <Pressable
                onPress={() => toggleTarget(item.id)}
                style={[styles.targetRow, isSelected && styles.targetRowSelected]}
            >
                <View style={styles.targetLeft}>
                    {item.type === 'group' ? (
                        <View style={[styles.groupIconBg, isSelected && styles.groupIconBgSelected]}>
                            <Users size={18} color={isSelected ? '#fff' : PINK} />
                        </View>
                    ) : (
                        <Avatar name={item.name} url={item.avatar_url} size={38} />
                    )}
                    <SynthText
                        variant="body"
                        style={[styles.targetName, isSelected && styles.targetNameSelected]}
                        numberOfLines={1}
                    >
                        {item.name}
                    </SynthText>
                </View>
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected ? <Check size={14} color="#fff" /> : null}
                </View>
            </Pressable>
        );
    };

    const renderSectionHeader = (label: string, count: number) =>
        count > 0 ? (
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>{label}</Text>
            </View>
        ) : null;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <Pressable style={styles.backdrop} onPress={onClose} />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.kvWrapper}
            >
                <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
                    {/* Handle */}
                    <View style={styles.handle} />

                    {/* Header */}
                    <View style={styles.header}>
                        <View style={{ flex: 1 }}>
                            <SynthText variant="h2" style={styles.headerTitle}>
                                Share to Chat
                            </SynthText>
                            {title ? (
                                <SynthText variant="meta" color="secondary" numberOfLines={1} style={styles.headerSub}>
                                    {title}
                                </SynthText>
                            ) : null}
                        </View>
                        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
                            <X size={22} color={SynthTokens.colors.neutral600} />
                        </Pressable>
                    </View>

                    {/* Search */}
                    <View style={styles.searchRow}>
                        <Search size={16} color={SynthTokens.colors.neutral400} />
                        <TextInput
                            ref={inputRef}
                            style={styles.searchInput}
                            placeholder="Search chats or friends…"
                            placeholderTextColor={SynthTokens.colors.neutral400}
                            value={query}
                            onChangeText={setQuery}
                            autoCorrect={false}
                        />
                        {query ? (
                            <Pressable onPress={() => setQuery('')} hitSlop={8}>
                                <X size={14} color={SynthTokens.colors.neutral400} />
                            </Pressable>
                        ) : null}
                    </View>

                    {/* Target list */}
                    {loading ? (
                        <View style={styles.centered}>
                            <ActivityIndicator color={PINK} />
                        </View>
                    ) : targets.length === 0 ? (
                        <View style={styles.centered}>
                            <MessageCircle size={36} color={SynthTokens.colors.neutral200} />
                            <SynthText variant="body" color="secondary" style={{ marginTop: 12, textAlign: 'center' }}>
                                No chats or friends yet.{'\n'}Start a conversation first.
                            </SynthText>
                        </View>
                    ) : (
                        <FlatList
                            data={[]}
                            renderItem={null}
                            ListHeaderComponent={
                                <>
                                    {renderSectionHeader('GROUP CHATS', groups.length)}
                                    {groups.map(item => (
                                        <View key={item.id}>{renderTarget({ item })}</View>
                                    ))}
                                    {renderSectionHeader('FRIENDS', friends.length)}
                                    {friends.map(item => (
                                        <View key={item.id}>{renderTarget({ item })}</View>
                                    ))}
                                    {filtered.length === 0 ? (
                                        <View style={styles.centered}>
                                            <SynthText variant="meta" color="secondary">No results for "{query}"</SynthText>
                                        </View>
                                    ) : null}
                                </>
                            }
                            style={styles.list}
                            keyboardShouldPersistTaps="handled"
                        />
                    )}

                    {/* Custom message + send */}
                    {!loading && targets.length > 0 ? (
                        <View style={styles.footer}>
                            <View style={styles.externalRow}>
                                <Pressable style={styles.externalBtn} onPress={() => void handleShareExternally()}>
                                    <Share2 size={18} color={SynthTokens.colors.neutral600} />
                                    <Text style={styles.externalText}>Share externally</Text>
                                </Pressable>
                                <Pressable style={styles.externalBtn} onPress={() => void handleCopyLink()}>
                                    <Link2 size={18} color={SynthTokens.colors.neutral600} />
                                    <Text style={styles.externalText}>Copy link</Text>
                                </Pressable>
                            </View>
                            <View style={styles.messageRow}>
                                <TextInput
                                    style={styles.messageInput}
                                    placeholder="Add a message… (optional)"
                                    placeholderTextColor={SynthTokens.colors.neutral400}
                                    value={customMessage}
                                    onChangeText={setCustomMessage}
                                    multiline
                                    maxLength={300}
                                />
                            </View>
                            <Pressable
                                style={[
                                    styles.sendBtn,
                                    (!selected.size || sending) && styles.sendBtnDisabled,
                                    sent && styles.sendBtnSent,
                                ]}
                                onPress={() => void handleSend()}
                                disabled={!selected.size || sending}
                            >
                                {sending ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : sent ? (
                                    <Check size={20} color="#fff" />
                                ) : (
                                    <>
                                        <Send size={18} color="#fff" />
                                        <Text style={styles.sendBtnText}>
                                            Send{selected.size > 1 ? ` (${selected.size})` : ''}
                                        </Text>
                                    </>
                                )}
                            </Pressable>
                        </View>
                    ) : null}
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    kvWrapper: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },
    sheet: {
        backgroundColor: SynthTokens.colors.neutral0,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '85%',
        minHeight: 300,
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: -4 },
        elevation: 20,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: SynthTokens.colors.neutral200,
        alignSelf: 'center',
        marginTop: 10,
        marginBottom: 4,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
    },
    headerTitle: {
        fontWeight: '700',
        fontSize: 18,
    },
    headerSub: {
        marginTop: 2,
    },
    closeBtn: {
        padding: 4,
        marginLeft: 8,
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 4,
        backgroundColor: SynthTokens.colors.neutral100,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: SynthTokens.colors.neutral900,
        padding: 0,
    },
    list: {
        flexGrow: 0,
        maxHeight: 280,
    },
    sectionHeader: {
        paddingHorizontal: 20,
        paddingTop: 14,
        paddingBottom: 4,
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: SynthTokens.colors.neutral400,
        letterSpacing: 0.8,
    },
    targetRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 12,
        marginHorizontal: 8,
    },
    targetRowSelected: {
        backgroundColor: 'rgba(204,36,134,0.06)',
    },
    targetLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    groupIconBg: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(204,36,134,0.10)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    groupIconBgSelected: {
        backgroundColor: PINK,
    },
    targetName: {
        flex: 1,
        fontWeight: '500',
    },
    targetNameSelected: {
        color: PINK,
        fontWeight: '600',
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: SynthTokens.colors.neutral200,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxSelected: {
        borderColor: PINK,
        backgroundColor: PINK,
    },
    footer: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: SynthTokens.colors.neutral200,
        paddingHorizontal: 16,
        paddingTop: 12,
        gap: 10,
    },
    externalRow: {
        flexDirection: 'row',
        gap: 10,
    },
    externalBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: SynthTokens.colors.neutral100,
        borderRadius: 12,
        paddingVertical: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: SynthTokens.colors.neutral200,
    },
    externalText: {
        fontSize: 14,
        fontWeight: '600',
        color: SynthTokens.colors.neutral600,
    },
    messageRow: {
        backgroundColor: SynthTokens.colors.neutral100,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    messageInput: {
        fontSize: 15,
        color: SynthTokens.colors.neutral900,
        maxHeight: 80,
        padding: 0,
    },
    sendBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: PINK,
        borderRadius: 14,
        paddingVertical: 14,
    },
    sendBtnDisabled: {
        backgroundColor: SynthTokens.colors.neutral200,
    },
    sendBtnSent: {
        backgroundColor: '#22c55e',
    },
    sendBtnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 16,
    },
    centered: {
        paddingVertical: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
