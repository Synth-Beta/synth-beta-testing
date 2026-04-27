/**
 * New Chat screen — pick one friend for a DM, or pick 2+ to create a group chat.
 * Navigated to from the "New Chat +" button on the Messages tab.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Check, ArrowLeft } from 'lucide-react-native';
import { supabase } from '../src/integrations/supabase/client';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';
import { getFriendsForProfile, type ProfileFriend } from '../src/services/friendsService';
import { ChatService } from '../src/services/chatService';

const PINK = SynthTokens.colors.brandPink500;

function initials(name: string): string {
    return name
        .split(/\s+/)
        .map(p => p[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

export default function NewChatScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [selfId, setSelfId] = useState<string | null>(null);
    const [friends, setFriends] = useState<ProfileFriend[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<ProfileFriend[]>([]);
    const [groupName, setGroupName] = useState('');
    const [creating, setCreating] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const load = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        if (!user) { setLoading(false); return; }
        setSelfId(user.id);
        const data = await getFriendsForProfile(user.id);
        setFriends(data);
        setLoading(false);
    }, []);

    useEffect(() => { void load(); }, [load]);

    const filteredFriends = searchQuery.trim()
        ? friends.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : friends;

    const toggleSelect = (friend: ProfileFriend) => {
        setSelected(prev => {
            const already = prev.find(f => f.user_id === friend.user_id);
            return already ? prev.filter(f => f.user_id !== friend.user_id) : [...prev, friend];
        });
    };

    const handleStart = async () => {
        if (!selfId || selected.length === 0 || creating) return;
        setCreating(true);

        try {
            if (selected.length === 1) {
                // Direct chat
                const chatId = await ChatService.ensureDirectChat(selfId, selected[0].user_id);
                if (chatId) {
                    router.replace(`/chat/${chatId}` as any);
                } else {
                    Alert.alert('Error', 'Could not create chat. Please try again.');
                }
            } else {
                // Group chat
                const name = groupName.trim() || selected.map(f => f.name).join(', ');
                const userIds = selected.map(f => f.user_id);

                const { data: chatId, error } = await supabase.rpc('create_group_chat', {
                    chat_name: name,
                    user_ids: userIds,
                    admin_id: selfId,
                });

                if (error || !chatId) {
                    console.error('[new-chat] create_group_chat:', error);
                    Alert.alert('Error', error?.message || 'Could not create group chat. Please try again.');
                } else {
                    router.replace(`/chat/${chatId}` as any);
                }
            }
        } catch (e) {
            console.warn('[new-chat] handleStart:', e);
            Alert.alert('Error', 'Something went wrong. Please try again.');
        } finally {
            setCreating(false);
        }
    };

    const isGroup = selected.length >= 2;
    const ctaLabel = selected.length === 0
        ? 'Select friends'
        : selected.length === 1
            ? 'Start Chat'
            : 'Create Group Chat';

    return (
        <View style={[styles.root, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
                    <ArrowLeft size={22} color={SynthTokens.colors.neutral900} />
                </Pressable>
                <SynthText variant="h2" style={styles.title}>New Chat</SynthText>
                <View style={styles.backBtn} />
            </View>

            {/* Search */}
            <View style={styles.searchRow}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search friends…"
                    placeholderTextColor={SynthTokens.colors.neutral400}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    returnKeyType="search"
                    clearButtonMode="while-editing"
                />
            </View>

            {/* Selected chips */}
            {selected.length > 0 && (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.chipsScroll}
                    contentContainerStyle={styles.chipsContent}
                >
                    {selected.map(f => (
                        <Pressable
                            key={f.user_id}
                            style={styles.chip}
                            onPress={() => toggleSelect(f)}
                        >
                            <Text style={styles.chipText}>{f.name.split(' ')[0]}</Text>
                            <X size={12} color="#fff" />
                        </Pressable>
                    ))}
                </ScrollView>
            )}

            {/* Group name input (shown when 2+ selected) */}
            {isGroup && (
                <View style={styles.groupNameRow}>
                    <TextInput
                        style={styles.groupNameInput}
                        placeholder="Group name (optional)"
                        placeholderTextColor={SynthTokens.colors.neutral400}
                        value={groupName}
                        onChangeText={setGroupName}
                        maxLength={60}
                    />
                </View>
            )}

            {/* Friend list */}
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={PINK} />
                </View>
            ) : filteredFriends.length === 0 ? (
                <View style={styles.center}>
                    <SynthText variant="meta" color="secondary">
                        {friends.length === 0 ? 'No friends yet. Add friends first!' : 'No results.'}
                    </SynthText>
                </View>
            ) : (
                <FlatList
                    data={filteredFriends}
                    keyExtractor={item => item.user_id}
                    contentContainerStyle={styles.listContent}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => {
                        const isSelected = !!selected.find(f => f.user_id === item.user_id);
                        return (
                            <Pressable
                                style={({ pressed }) => [
                                    styles.friendRow,
                                    isSelected && styles.friendRowSelected,
                                    pressed && styles.friendRowPressed,
                                ]}
                                onPress={() => toggleSelect(item)}
                            >
                                {/* Avatar */}
                                {item.avatar_url ? (
                                    <Image
                                        source={{ uri: item.avatar_url }}
                                        style={styles.avatar}
                                        contentFit="cover"
                                    />
                                ) : (
                                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                                        <Text style={styles.avatarInitials}>{initials(item.name)}</Text>
                                    </View>
                                )}

                                {/* Name + bio */}
                                <View style={styles.friendInfo}>
                                    <Text style={styles.friendName}>{item.name}</Text>
                                    {item.bio ? (
                                        <Text style={styles.friendBio} numberOfLines={1}>{item.bio}</Text>
                                    ) : null}
                                </View>

                                {/* Checkbox */}
                                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                    {isSelected && <Check size={14} color="#fff" strokeWidth={3} />}
                                </View>
                            </Pressable>
                        );
                    }}
                />
            )}

            {/* CTA button */}
            <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
                <Pressable
                    onPress={handleStart}
                    disabled={selected.length === 0 || creating}
                    style={({ pressed }) => [
                        styles.ctaBtn,
                        selected.length === 0 && styles.ctaBtnDisabled,
                        pressed && selected.length > 0 && styles.ctaBtnPressed,
                    ]}
                >
                    {creating ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.ctaBtnText}>{ctaLabel}</Text>
                    )}
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: SynthTokens.colors.neutral0,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SynthTokens.spacing.md,
        paddingVertical: 12,
    },
    backBtn: {
        width: 38,
        height: 38,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: SynthTokens.colors.neutral900,
    },
    searchRow: {
        paddingHorizontal: SynthTokens.spacing.md,
        paddingBottom: 10,
    },
    searchInput: {
        backgroundColor: SynthTokens.colors.neutral100,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 15,
        color: SynthTokens.colors.neutral900,
    },
    chipsScroll: {
        flexGrow: 0,
        marginBottom: 4,
    },
    chipsContent: {
        paddingHorizontal: SynthTokens.spacing.md,
        gap: 8,
        paddingVertical: 4,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: PINK,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    chipText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 13,
    },
    groupNameRow: {
        paddingHorizontal: SynthTokens.spacing.md,
        paddingBottom: 10,
    },
    groupNameInput: {
        backgroundColor: SynthTokens.colors.neutral50,
        borderWidth: 1.5,
        borderColor: PINK + '60',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 15,
        color: SynthTokens.colors.neutral900,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    listContent: {
        paddingHorizontal: SynthTokens.spacing.md,
        paddingBottom: 8,
    },
    friendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral100,
        gap: 12,
    },
    friendRowSelected: {
        backgroundColor: PINK + '08',
        marginHorizontal: -SynthTokens.spacing.md,
        paddingHorizontal: SynthTokens.spacing.md,
    },
    friendRowPressed: {
        opacity: 0.75,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        flexShrink: 0,
    },
    avatarPlaceholder: {
        backgroundColor: PINK + '20',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarInitials: {
        fontSize: 16,
        fontWeight: '700',
        color: PINK,
    },
    friendInfo: {
        flex: 1,
        minWidth: 0,
    },
    friendName: {
        fontSize: 16,
        fontWeight: '700',
        color: SynthTokens.colors.neutral900,
    },
    friendBio: {
        fontSize: 13,
        color: SynthTokens.colors.neutral500,
        marginTop: 2,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: SynthTokens.colors.neutral300,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    checkboxSelected: {
        backgroundColor: PINK,
        borderColor: PINK,
    },
    ctaWrap: {
        paddingHorizontal: SynthTokens.spacing.md,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: SynthTokens.colors.neutral200,
    },
    ctaBtn: {
        backgroundColor: PINK,
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: PINK,
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
    },
    ctaBtnDisabled: {
        backgroundColor: SynthTokens.colors.neutral300,
        shadowOpacity: 0,
        elevation: 0,
    },
    ctaBtnPressed: {
        opacity: 0.85,
    },
    ctaBtnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 17,
    },
});
