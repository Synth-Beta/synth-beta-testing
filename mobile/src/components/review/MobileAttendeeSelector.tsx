import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    TextInput,
    Pressable,
    StyleSheet,
    ActivityIndicator,
    Switch,
} from 'react-native';
import { Users, X, Phone } from 'lucide-react-native';
import { supabase } from '../../integrations/supabase/client';
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
}

interface UserResult {
    user_id: string;
    name: string;
    avatar_url?: string;
}

export function MobileAttendeeSelector({ value, onChange, userId, metOnSynth, onMetOnSynthChange }: Props) {
    const [searchQ, setSearchQ] = useState('');
    const [results, setResults] = useState<UserResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [phoneNum, setPhoneNum] = useState('');
    const [phoneName, setPhoneName] = useState('');
    const [showPhone, setShowPhone] = useState(false);

    useEffect(() => {
        const q = searchQ.trim();
        if (!q) { setResults([]); return; }
        const t = setTimeout(async () => {
            setSearching(true);
            try {
                const { data } = await supabase
                    .from('users')
                    .select('user_id, name, avatar_url')
                    .ilike('name', `%${q}%`)
                    .neq('user_id', userId)
                    .order('name', { ascending: true })
                    .limit(10);
                setResults(data || []);
            } finally {
                setSearching(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [searchQ, userId]);

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

    const hasUserAttendees = value.some(a => a.type === 'user');

    return (
        <View style={styles.container}>
            <View style={styles.titleRow}>
                <Users size={18} color={SynthTokens.colors.brandPink500} />
                <SynthText variant="accent">Who tagged along? (Optional)</SynthText>
            </View>

            {/* User search */}
            <TextInput
                style={styles.input}
                placeholder="Search Synth users to tag…"
                placeholderTextColor={SynthTokens.colors.neutral600}
                value={searchQ}
                onChangeText={setSearchQ}
                autoCapitalize="none"
            />
            {searching && <ActivityIndicator size="small" color={SynthTokens.colors.brandPink500} style={styles.spinner} />}
            {results.map(u => {
                const already = value.some(a => a.type === 'user' && a.user_id === u.user_id);
                return (
                    <Pressable
                        key={u.user_id}
                        style={[styles.resultRow, already && styles.resultRowDimmed]}
                        onPress={() => !already && addUser(u)}
                        disabled={already}
                    >
                        <SynthText variant="body">{u.name}</SynthText>
                        {already && <SynthText variant="meta" color="brand">Added</SynthText>}
                    </Pressable>
                );
            })}
            {searchQ.length > 0 && !searching && results.length === 0 && (
                <SynthText variant="meta" color="secondary" style={styles.noResults}>
                    No users found
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
                        thumbColor="#fff"
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
        backgroundColor: '#fff',
        color: SynthTokens.colors.neutral900,
    },
    spinner: { alignSelf: 'center' },
    resultRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
    },
    resultRowDimmed: { opacity: 0.5 },
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
        backgroundColor: '#fff',
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
        color: '#fff',
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
