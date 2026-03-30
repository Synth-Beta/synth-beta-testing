import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, FlatList, TextInput, Pressable, KeyboardAvoidingView, Platform, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Send, Image as ImageIcon } from 'lucide-react-native';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { ChatService, Message } from '../../src/services/chatService';
import { supabase } from '../../src/integrations/supabase/client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ChatThreadScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [userId, setUserId] = useState<string | null>(null);
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        loadMessages();
    }, [id]);

    const loadMessages = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);

        const data = await ChatService.getMessages(id, user.id);
        setMessages(data);
    };

    const handleSend = async () => {
        if (!inputText.trim() || !userId) return;

        const success = await ChatService.sendMessage(id, userId, inputText);
        if (success) {
            setInputText('');
            loadMessages();
            setTimeout(() => flatListRef.current?.scrollToEnd(), 200);
        }
    };

    const renderMessage = ({ item }: { item: Message }) => {
        const meta = item.metadata ?? {};
        const eventTitle =
            (typeof meta.title === 'string' && meta.title) ||
            (typeof meta.event_title === 'string' && meta.event_title) ||
            (typeof meta.artist_name === 'string' && typeof meta.venue_name === 'string'
                ? `${meta.artist_name} @ ${meta.venue_name}`
                : null) ||
            'Shared event';

        if (item.message_type === 'event_share' && item.shared_event_id) {
            return (
                <View
                    style={[
                        styles.messageWrapper,
                        item.is_mine ? styles.myMessageWrapper : styles.theirMessageWrapper,
                    ]}
                >
                    <Pressable
                        onPress={() => router.push(`/event/${item.shared_event_id}`)}
                        style={[styles.shareCard, item.is_mine ? styles.shareCardMine : styles.shareCardTheirs]}
                    >
                        <Text style={[styles.shareLabel, item.is_mine ? styles.shareLabelOnPink : styles.shareLabelMuted]}>EVENT</Text>
                        <SynthText variant="body" style={item.is_mine ? styles.shareTitleLight : styles.shareTitleDark}>
                            {eventTitle}
                        </SynthText>
                        {item.content && item.content !== 'Message' ? (
                            <SynthText variant="meta" color="secondary" style={styles.shareHint} numberOfLines={3}>
                                {item.content}
                            </SynthText>
                        ) : null}
                    </Pressable>
                    <SynthText variant="meta" color="secondary" style={styles.messageTime}>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </SynthText>
                </View>
            );
        }

        if (item.message_type === 'review_share' && item.shared_review_id) {
            const snippet =
                (typeof meta.review_text === 'string' && meta.review_text) ||
                (typeof meta.custom_message === 'string' && meta.custom_message) ||
                item.content;
            return (
                <View
                    style={[
                        styles.messageWrapper,
                        item.is_mine ? styles.myMessageWrapper : styles.theirMessageWrapper,
                    ]}
                >
                    <Pressable
                        onPress={() => router.push(`/review/${item.shared_review_id}`)}
                        style={[styles.shareCard, item.is_mine ? styles.shareCardMine : styles.shareCardTheirs]}
                    >
                        <Text style={[styles.shareLabel, item.is_mine ? styles.shareLabelOnPink : styles.shareLabelMuted]}>REVIEW</Text>
                        <SynthText variant="body" style={item.is_mine ? styles.shareTitleLight : styles.shareTitleDark} numberOfLines={3}>
                            {snippet}
                        </SynthText>
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
                <SynthText variant="h2" style={styles.headerTitle}>Chat</SynthText>
                <View style={{ width: 40 }} />
            </View>

            <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={renderMessage}
                keyExtractor={(item) => item.id}
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
                    onPress={handleSend}
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
        maxWidth: '80%',
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
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },
    shareCardMine: {
        backgroundColor: SynthTokens.colors.brandPink600,
        borderColor: SynthTokens.colors.brandPink700,
    },
    shareCardTheirs: {
        backgroundColor: SynthTokens.colors.neutral0,
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
});
