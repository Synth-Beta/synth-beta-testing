import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    TextInput,
    Pressable,
    StyleSheet,
    ActivityIndicator,
    Switch,
    ScrollView,
    Image,
} from 'react-native';
import { Users, X, Phone, Check } from 'lucide-react-native';
import { supabase } from '../../integrations/supabase/client';
import { getFriendsForProfile } from '../../services/friendsService';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';

export type Attendee =
    | { type: 'user'; user_id: string; name: string; avatar_url?: string }
    | { type: 'phone'; phone: string; name?: string };

interface Props {
    value: Attendee[];
    onChange: (attendees: Attendee[]) => void;
    userId: string;
    metOnSynth: boolean;
    onMetOnSynthChange: (v: boolean) => void;
    /** Lets the screen scroll the picker above the keyboard when search is focused. */
    onSearchFocus?: () => void;
}

interface UserResult {
    user_id: string;
    name: string;
    username?: string;
    avatar_url?: string;
}

function matches(u: UserResult, q: string): boolean {
    return u.name.toLowerCase().includes(q) || (u.username ?? '').toLowerCase().includes(q);
}

function Avatar({ u, size }: { u: UserResult; size: number }) {
    if (u.avatar_url) {
        return <Image source={{ uri: u.avatar_url }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
    }
    return (
        <View style={[styles.initials, { width: size, height: size, borderRadius: size / 2 }]}>
            <SynthText variant="meta" style={styles.initialsText}>{u.name.trim().charAt(0).toUpperCase() || '?'}</SynthText>
        </View>
    );
}

export function MobileAttendeeSelector({ value, onChange, userId, metOnSynth, onMetOnSynthChange, onSearchFocus }: Props) {
    const [searchQ, setSearchQ] = useState('');
    const [friends, setFriends] = useState<UserResult[]>([]);
    const [friendsLoaded, setFriendsLoaded] = useState(false);
    const [results, setResults] = useState<UserResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [phoneNum, setPhoneNum] = useState('');
    const [phoneName, setPhoneName] = useState('');
    const [showPhone, setShowPhone] = useState(false);

    // Friends first: they are who you went with, so show them without any typing.
    useEffect(() => {
        let cancelled = false;
        void getFriendsForProfile(userId).then((list) => {
            if (cancelled) return;
            setFriends(list.map((f) => ({
                user_id: f.user_id,
                name: f.name,
                username: f.username,
                avatar_url: f.avatar_url ?? undefined,
            })));
            setFriendsLoaded(true);
        });
        return () => { cancelled = true; };
    }, [userId]);

    const q = searchQ.trim().toLowerCase();
    const friendMatches = q ? friends.filter((f) => matches(f, q)) : friends;

    // Everyone else only after 2+ characters, by name or @username, never repeating friends.
    useEffect(() => {
        // Strip PostgREST filter syntax so a typed comma or bracket can't break the query.
        const term = searchQ.trim().replace(/^@/, '').replace(/[,()%*\\]/g, '');
        if (term.length < 2) { setResults([]); return; }
        const t = setTimeout(async () => {
            setSearching(true);
            try {
                const { data } = await supabase
                    .from('users')
                    .select('user_id, name, username, avatar_url')
                    .or(`name.ilike.%${term}%,username.ilike.%${term}%`)
                    .neq('user_id', userId)
                    .order('name', { ascending: true })
                    .limit(10);
                const friendIds = new Set(friends.map((f) => f.user_id));
                setResults(((data || []) as UserResult[]).filter((u) => !friendIds.has(u.user_id)));
            } finally {
                setSearching(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [searchQ, userId, friends]);

    const addUser = useCallback((u: UserResult) => {
        const already = value.some(a => a.type === 'user' && a.user_id === u.user_id);
        if (!already) onChange([...value, { type: 'user', user_id: u.user_id, name: u.name, avatar_url: u.avatar_url }]);
        setSearchQ('');
        setResults([]);
    }, [value, onChange]);

    const addPhone = useCallback(() => {
        const p = phoneNum.trim();
        if (!p) return;
        const already = value.some(a => a.type === 'phone' && a.phone === p);
        if (!already) onChange([...value, { type: 'phone', phone: p, name: phoneName.trim() || undefined }]);
        setPhoneNum('');
        setPhoneName('');
        setShowPhone(false);
    }, [phoneNum, phoneName, value, onChange]);

    const remove = useCallback((i: number) => {
        onChange(value.filter((_, idx) => idx !== i));
    }, [value, onChange]);

    const isAdded = (u: UserResult) => value.some(a => a.type === 'user' && a.user_id === u.user_id);
    const toggleUser = (u: UserResult) => {
        if (isAdded(u)) onChange(value.filter(a => !(a.type === 'user' && a.user_id === u.user_id)));
        else addUser(u);
    };

    const renderRow = (u: UserResult) => (
        <Pressable key={u.user_id} style={styles.resultRow} onPress={() => toggleUser(u)}>
            <Avatar u={u} size={32} />
            <View style={styles.resultText}>
                <SynthText variant="body" numberOfLines={1}>{u.name}</SynthText>
                {u.username ? <SynthText variant="meta" color="secondary" numberOfLines={1}>@{u.username}</SynthText> : null}
            </View>
            {isAdded(u)
                ? <Check size={18} color={SynthTokens.colors.brandPink500} />
                : <SynthText variant="meta" color="brand">Add</SynthText>}
        </Pressable>
    );

    const hasUserAttendees = value.some(a => a.type === 'user');

    return (
        <View style={styles.container}>
            <View style={styles.titleRow}>
                <Users size={18} color={SynthTokens.colors.brandPink500} />
                <SynthText variant="accent">Who tagged along? (Optional)</SynthText>
            </View>

            {/* Friends: one tap, no typing */}
            {!q && friends.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendStrip}>
                    {friends.map((f) => (
                        <Pressable key={f.user_id} style={styles.friendBubble} onPress={() => toggleUser(f)}>
                            <View>
                                <Avatar u={f} size={52} />
                                {isAdded(f) && (
                                    <View style={styles.bubbleCheck}>
                                        <Check size={12} color="#FFFDFA" />
                                    </View>
                                )}
                            </View>
                            <SynthText variant="meta" numberOfLines={1} style={styles.bubbleName}>
                                {f.name.split(' ')[0]}
                            </SynthText>
                            {f.username ? (
                                <SynthText variant="meta" color="secondary" numberOfLines={1} style={styles.bubbleName}>
                                    @{f.username}
                                </SynthText>
                            ) : null}
                        </Pressable>
                    ))}
                </ScrollView>
            )}
            {!q && friendsLoaded && friends.length === 0 && (
                <SynthText variant="meta" color="secondary">
                    No friends on Synth yet. Search anyone by name or @username.
                </SynthText>
            )}

            <TextInput
                style={styles.input}
                placeholder={friends.length > 0 ? 'Search friends or anyone on Synth…' : 'Search by name or @username…'}
                placeholderTextColor={SynthTokens.colors.neutral600}
                value={searchQ}
                onChangeText={setSearchQ}
                onFocus={onSearchFocus}
                autoCapitalize="none"
                autoCorrect={false}
            />
            {q.length > 0 && friendMatches.length > 0 && (
                <View>
                    <SynthText variant="meta" color="secondary" style={styles.sectionLabel}>Friends</SynthText>
                    {friendMatches.map(renderRow)}
                </View>
            )}
            {results.length > 0 && (
                <View>
                    <SynthText variant="meta" color="secondary" style={styles.sectionLabel}>Others on Synth</SynthText>
                    {results.map(renderRow)}
                </View>
            )}
            {searching && <ActivityIndicator size="small" color={SynthTokens.colors.brandPink500} style={styles.spinner} />}
            {q.length >= 2 && !searching && friendMatches.length === 0 && results.length === 0 && (
                <SynthText variant="meta" color="secondary" style={styles.noResults}>
                    No one found. Add them by phone below.
                </SynthText>
            )}

            {/* Selected attendees chips */}
            {value.length > 0 && (
                <View style={styles.chips}>
                    {value.map((a, i) => (
                        <View key={i} style={styles.chip}>
                            {a.type === 'phone' && <Phone size={12} color={SynthTokens.colors.neutral600} />}
                            <SynthText variant="meta" style={styles.chipLabel}>
                                {a.type === 'user' ? a.name : (a.name || a.phone)}
                            </SynthText>
                            <Pressable onPress={() => remove(i)} hitSlop={8}>
                                <X size={12} color={SynthTokens.colors.neutral600} />
                            </Pressable>
                        </View>
                    ))}
                </View>
            )}

            {/* Phone fallback toggle */}
            {!showPhone ? (
                <Pressable onPress={() => setShowPhone(true)} style={styles.phoneToggle}>
                    <Phone size={14} color={SynthTokens.colors.neutral600} />
                    <SynthText variant="meta" color="secondary">Add someone not on Synth</SynthText>
                </Pressable>
            ) : (
                <View style={styles.phoneSection}>
                    <TextInput
                        style={styles.input}
                        placeholder="Phone number (+1234567890)"
                        placeholderTextColor={SynthTokens.colors.neutral600}
                        value={phoneNum}
                        onChangeText={setPhoneNum}
                        keyboardType="phone-pad"
                        autoComplete="tel"
                    />
                    <TextInput
                        style={styles.input}
                        placeholder="Name (optional)"
                        placeholderTextColor={SynthTokens.colors.neutral600}
                        value={phoneName}
                        onChangeText={setPhoneName}
                    />
                    <View style={styles.phoneButtons}>
                        <Pressable style={styles.phoneAddBtn} onPress={addPhone} disabled={!phoneNum.trim()}>
                            <SynthText variant="meta" style={styles.phoneAddTxt}>Add Contact</SynthText>
                        </Pressable>
                        <Pressable onPress={() => { setShowPhone(false); setPhoneNum(''); setPhoneName(''); }}>
                            <SynthText variant="meta" color="secondary">Cancel</SynthText>
                        </Pressable>
                    </View>
                </View>
            )}

            {/* Met on Synth — only when user attendees added */}
            {hasUserAttendees && (
                <View style={styles.metRow}>
                    <SynthText variant="meta" style={styles.metLabel}>
                        Did you meet or plan this on Synth?
                    </SynthText>
                    <Switch
                        value={metOnSynth}
                        onValueChange={onMetOnSynthChange}
                        trackColor={{ false: SynthTokens.colors.neutral200, true: SynthTokens.colors.brandPink500 }}
                        thumbColor="#FFFDFA"
                    />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: 10,
        marginTop: 16,
        padding: 16,
        backgroundColor: SynthTokens.colors.brandPink050,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: SynthTokens.colors.brandPink500 + '33',
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    input: {
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 15,
        backgroundColor: '#FFFDFA',
        color: SynthTokens.colors.neutral900,
    },
    spinner: { alignSelf: 'center' },
    resultRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
    },
    resultText: { flex: 1 },
    sectionLabel: { marginTop: 4, marginBottom: 2 },
    friendStrip: { gap: 14, paddingVertical: 4 },
    friendBubble: { alignItems: 'center', width: 60 },
    bubbleName: { marginTop: 4, maxWidth: 60, textAlign: 'center' },
    bubbleCheck: {
        position: 'absolute',
        right: -2,
        bottom: -2,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: SynthTokens.colors.brandPink500,
        borderWidth: 2,
        borderColor: '#FFFDFA',
        alignItems: 'center',
        justifyContent: 'center',
    },
    initials: {
        backgroundColor: SynthTokens.colors.neutral200,
        alignItems: 'center',
        justifyContent: 'center',
    },
    initialsText: { fontWeight: '600' },
    noResults: { textAlign: 'center', marginTop: 4 },
    chips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#FFFDFA',
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },
    chipLabel: {
        maxWidth: 120,
    },
    phoneToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
        alignSelf: 'flex-start',
    },
    phoneSection: { gap: 8 },
    phoneButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    phoneAddBtn: {
        backgroundColor: SynthTokens.colors.brandPink500,
        borderRadius: 10,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    phoneAddTxt: {
        color: '#FFFDFA',
        fontWeight: '600',
    },
    metRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 8,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: SynthTokens.colors.neutral200,
    },
    metLabel: {
        flex: 1,
        marginRight: 12,
    },
});
