import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    StyleSheet,
    View,
    Pressable,
    ScrollView,
    SafeAreaView,
    TextInput,
    Text,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { SynthText } from '../../src/components/SynthText';
import { SynthButton } from '../../src/components/SynthButton';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { OnboardingProgress } from '../../src/components/OnboardingProgress';
import { supabase } from '../../src/integrations/supabase/client';
import { OnboardingService } from '../../src/services/onboardingService';
import { ACQUISITION_SOURCE_CANONICAL_ORDER, type AcquisitionSource } from '@synth/shared';

const PINK = SynthTokens.colors.brandPink500;

const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;
// Inclusive gender options. `value` is what's stored (lowercase, matches web + existing
// data); `label` is what's shown. Keep this list in sync with web + profile-edit.
const GENDER_OPTIONS = [
    { value: 'female', label: 'Female' },
    { value: 'male', label: 'Male' },
    { value: 'non-binary', label: 'Non-binary' },
    { value: 'transgender', label: 'Transgender' },
    { value: 'genderqueer', label: 'Genderqueer' },
    { value: 'agender', label: 'Agender' },
    { value: 'prefer-not-to-say', label: 'Prefer not to say' },
    { value: 'other', label: 'Other' },
] as const;

function calcAge(birthday: string): number | null {
    const d = new Date(birthday);
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    return age;
}

/** Sanitize text to valid username characters (lowercase, letters, numbers, _, .) */
function sanitizeUsername(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 30);
}

/** Suggest a username from display name (first + last initial, then random digits if needed) */
function suggestUsername(displayName: string): string {
    const base = displayName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 20);
    return base || '';
}

export default function ProfileSetupScreen() {
    const router = useRouter();

    const [name, setName] = useState('');
    const [userId, setUserId] = useState<string | null>(null);
    const [username, setUsername] = useState('');
    const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
    const [birthday, setBirthday] = useState('');
    const [birthdayError, setBirthdayError] = useState('');
    const [city, setCity] = useState('');
    const [gender, setGender] = useState('');
    const [saving, setSaving] = useState(false);
    const [acquisitionSource, setAcquisitionSource] = useState<AcquisitionSource | ''>('');
    const [acquisitionSourceOther, setAcquisitionSourceOther] = useState('');
    const [acquisitionSourceError, setAcquisitionSourceError] = useState('');

    const usernameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Pre-fill name from auth metadata and capture userId for self-exclusion in username check
    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return;
            setUserId(user.id);
            const displayName: string =
                user.user_metadata?.full_name ||
                user.user_metadata?.name ||
                '';
            if (displayName) {
                setName(displayName);
                const suggested = suggestUsername(displayName);
                if (suggested.length >= 3) {
                    setUsername(suggested);
                    scheduleUsernameCheck(suggested);
                }
            }
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const checkUsernameAvailability = useCallback(async (uname: string) => {
        if (!USERNAME_RE.test(uname)) {
            setUsernameStatus('invalid');
            return;
        }
        setUsernameStatus('checking');
        let query = supabase.from('users').select('user_id').eq('username', uname);
        if (userId) query = query.neq('user_id', userId);
        const { data } = await query.maybeSingle();
        setUsernameStatus(data ? 'taken' : 'available');
    }, [userId]);

    const scheduleUsernameCheck = useCallback((uname: string) => {
        if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current);
        if (uname.length < 3) { setUsernameStatus('idle'); return; }
        usernameCheckTimer.current = setTimeout(() => {
            void checkUsernameAvailability(uname);
        }, 600);
    }, [checkUsernameAvailability]);

    const selectAcquisitionSource = useCallback((source: AcquisitionSource) => {
        setAcquisitionSourceError('');
        setAcquisitionSource(source);
        if (source !== 'Other') {
            setAcquisitionSourceOther('');
        }
    }, []);

    const handleUsernameChange = (text: string) => {
        const sanitized = sanitizeUsername(text);
        setUsername(sanitized);
        scheduleUsernameCheck(sanitized);
    };

    const validateBirthday = (val: string): string => {
        // Accept YYYY-MM-DD
        if (!val.trim()) return 'Birthday is required';
        const d = new Date(val.trim());
        if (isNaN(d.getTime())) return 'Enter a valid date (YYYY-MM-DD)';
        const age = calcAge(val.trim());
        if (age === null || age < 13) return 'You must be at least 13 years old';
        if (age > 120) return 'Enter a valid birthday';
        return '';
    };

    const handleBirthdayBlur = () => {
        setBirthdayError(validateBirthday(birthday));
    };

    const canContinue =
        username.length >= 3 &&
        (usernameStatus === 'available' || usernameStatus === 'idle') &&
        !validateBirthday(birthday);

    const handleContinue = async () => {
        // Final birthday validation
        const bdErr = validateBirthday(birthday);
        if (bdErr) { setBirthdayError(bdErr); return; }

        // Final username check (exclude current user so back-navigation doesn't false-positive)
        if (usernameStatus !== 'available') {
            let freshQuery = supabase.from('users').select('user_id').eq('username', username);
            if (userId) freshQuery = freshQuery.neq('user_id', userId);
            const fresh = await freshQuery.maybeSingle();
            if (fresh.data) {
                setUsernameStatus('taken');
                return;
            }
        }

        const trimmedOtherSource = acquisitionSourceOther.trim();
        if (acquisitionSource === 'Other' && !trimmedOtherSource) {
            setAcquisitionSourceError('Please describe where you heard about Synth');
            return;
        }

        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await OnboardingService.saveProfileSetup(user.id, {
                    name: name.trim() || undefined,
                    username: username.trim() || undefined,
                    birthday: birthday.trim() || undefined,
                    location_city: city.trim() || undefined,
                    gender: gender || undefined,
                    acquisition_source: acquisitionSource || undefined,
                    other_acquisition_source:
                        acquisitionSource === 'Other' ? trimmedOtherSource : null,
                });
            }
        } catch (e) {
            console.warn('Profile setup write failed:', e);
            setSaving(false);
            Alert.alert('Something went wrong', 'Could not save your profile. Please try again.');
            return;
        } finally {
            setSaving(false);
        }

        router.push('/(onboarding)/connect');
    };

    const handleSkip = () => {
        router.push('/(onboarding)/connect');
    };

    const usernameHint = (() => {
        switch (usernameStatus) {
            case 'checking': return { text: 'Checking…', color: SynthTokens.colors.neutral600 };
            case 'available': return { text: '✓ Username available', color: '#16a34a' };
            case 'taken': return { text: 'Username already taken', color: '#dc2626' };
            case 'invalid': return { text: 'Only letters, numbers, _ and . allowed (3–30 chars)', color: '#dc2626' };
            default: return null;
        }
    })();

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft color={SynthTokens.colors.neutral900} size={28} />
                </Pressable>
                <OnboardingProgress totalSteps={5} currentStep={2} />
                <Pressable onPress={handleSkip} style={styles.skipButton}>
                    <SynthText variant="meta" color="secondary">Skip</SynthText>
                </Pressable>
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <SynthText variant="h1" style={styles.title}>Tell us about yourself</SynthText>
                    <SynthText variant="meta" color="secondary" style={styles.subtitle}>
                        Set up your profile to get personalized event recommendations
                    </SynthText>

                    {/* Name */}
                    <View style={styles.fieldBlock}>
                        <Text style={styles.label}>Display Name</Text>
                        <TextInput
                            style={styles.input}
                            value={name}
                            onChangeText={setName}
                            placeholder="Your name"
                            placeholderTextColor={SynthTokens.colors.neutral400}
                            autoCorrect={false}
                        />
                    </View>

                    {/* Username */}
                    <View style={styles.fieldBlock}>
                        <Text style={styles.label}>Username <Text style={styles.required}>*</Text></Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                style={[styles.input, styles.inputFlex, usernameStatus === 'taken' || usernameStatus === 'invalid' ? styles.inputError : null]}
                                value={username}
                                onChangeText={handleUsernameChange}
                                placeholder="username"
                                placeholderTextColor={SynthTokens.colors.neutral400}
                                autoCapitalize="none"
                                autoCorrect={false}
                                maxLength={30}
                            />
                            {usernameStatus === 'checking' ? (
                                <ActivityIndicator size="small" color={PINK} style={styles.inputSpinner} />
                            ) : null}
                        </View>
                        {usernameHint ? (
                            <Text style={[styles.hint, { color: usernameHint.color }]}>{usernameHint.text}</Text>
                        ) : null}
                    </View>

                    {/* Birthday */}
                    <View style={styles.fieldBlock}>
                        <Text style={styles.label}>Birthday <Text style={styles.required}>*</Text></Text>
                        <TextInput
                            style={[styles.input, birthdayError ? styles.inputError : null]}
                            value={birthday}
                            onChangeText={v => { setBirthday(v); if (birthdayError) setBirthdayError(''); }}
                            onBlur={handleBirthdayBlur}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor={SynthTokens.colors.neutral400}
                            keyboardType="numbers-and-punctuation"
                            maxLength={10}
                        />
                        {birthdayError ? (
                            <Text style={[styles.hint, { color: '#dc2626' }]}>{birthdayError}</Text>
                        ) : (
                            <Text style={styles.hint}>You must be at least 13 years old</Text>
                        )}
                    </View>

                    {/* City */}
                    <View style={styles.fieldBlock}>
                        <Text style={styles.label}>City</Text>
                        <TextInput
                            style={styles.input}
                            value={city}
                            onChangeText={setCity}
                            placeholder="Los Angeles, CA"
                            placeholderTextColor={SynthTokens.colors.neutral400}
                        />
                        <Text style={styles.hint}>Used for local event discovery</Text>
                    </View>

                    {/* Acquisition source */}
                    <View style={styles.fieldBlock}>
                        <Text style={styles.label}>How did you hear about Synth?</Text>
                        <View style={styles.optionsRow}>
                            {ACQUISITION_SOURCE_CANONICAL_ORDER.map(source => {
                                const selected = acquisitionSource === source;
                                return (
                                    <Pressable
                                        key={source}
                                        onPress={() => selectAcquisitionSource(source)}
                                        style={styles.optionWrapper}
                                    >
                                        <View style={[styles.optionChip, selected && styles.optionChipSelected]}>
                                            <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                                                {source}
                                            </Text>
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>
                        <Text style={styles.hint}>This helps us understand which communities find Synth most often.</Text>
                    </View>
                    {acquisitionSource === 'Other' && (
                        <View style={styles.fieldBlock}>
                            <Text style={styles.label}>Share a bit more</Text>
                            <TextInput
                                style={[styles.input, styles.otherInput, acquisitionSourceError ? styles.inputError : null]}
                                value={acquisitionSourceOther}
                                onChangeText={text => {
                                    setAcquisitionSourceOther(text);
                                    if (acquisitionSourceError) setAcquisitionSourceError('');
                                }}
                                placeholder="e.g., referred by DJ Alex / saw Synth at Embarcadero Festival"
                                placeholderTextColor={SynthTokens.colors.neutral400}
                                multiline
                            />
                            {acquisitionSourceError ? (
                                <Text style={[styles.hint, { color: '#dc2626' }]}>{acquisitionSourceError}</Text>
                            ) : (
                                <Text style={styles.hint}>Share any detail that helps us attribute this referral.</Text>
                            )}
                        </View>
                    )}

                    {/* Gender */}
                    <View style={styles.fieldBlock}>
                        <Text style={styles.label}>Gender (optional)</Text>
                        <View style={styles.genderRow}>
                            {GENDER_OPTIONS.map(g => (
                                <Pressable
                                    key={g.value}
                                    onPress={() => setGender(gender === g.value ? '' : g.value)}
                                    style={[styles.genderChip, gender === g.value && styles.genderChipSelected]}
                                >
                                    <Text style={[styles.genderChipTxt, gender === g.value && styles.genderChipTxtSelected]}>
                                        {g.label}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            <View style={styles.footer}>
                {saving ? (
                    <ActivityIndicator color={PINK} />
                ) : (
                    <SynthButton
                        title="Continue"
                        onPress={() => void handleContinue()}
                        disabled={!canContinue}
                    />
                )}
            </View>
        </SafeAreaView>
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
    },
    backButton: { padding: 8 },
    skipButton: { padding: 8 },
    content: {
        padding: SynthTokens.spacing.xl,
        paddingBottom: 24,
    },
    title: { marginBottom: 8 },
    subtitle: { marginBottom: 28 },
    fieldBlock: { marginBottom: 20 },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: SynthTokens.colors.neutral600,
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    required: { color: PINK },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    inputRow: { flexDirection: 'row', alignItems: 'center' },
    inputFlex: { flex: 1 },
    inputSpinner: { marginLeft: 10 },
    input: {
        backgroundColor: SynthTokens.colors.neutral0,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        borderRadius: SynthTokens.radius.medium,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 16,
        color: SynthTokens.colors.neutral900,
    },
    inputError: {
        borderColor: '#dc2626',
    },
    optionsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    optionWrapper: {
        marginRight: 8,
        marginBottom: 8,
    },
    optionChip: {
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        borderRadius: SynthTokens.radius.full,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: SynthTokens.colors.neutral0,
    },
    optionChipSelected: {
        borderColor: PINK,
        backgroundColor: 'rgba(204,36,134,0.08)',
    },
    optionText: {
        color: SynthTokens.colors.neutral900,
        fontSize: 13,
        fontWeight: '600',
    },
    optionTextSelected: {
        color: PINK,
    },
    bioInput: {
        minHeight: 88,
        paddingTop: 12,
    },
    otherInput: {
        minHeight: 64,
        paddingTop: 12,
    },
    hint: {
        fontSize: 12,
        color: SynthTokens.colors.neutral600,
        marginTop: 5,
    },
    genderRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    genderChip: {
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 99,
        borderWidth: 1.5,
        borderColor: SynthTokens.colors.neutral200,
        backgroundColor: SynthTokens.colors.neutral0,
    },
    genderChipSelected: {
        borderColor: PINK,
        backgroundColor: 'rgba(204,36,134,0.08)',
    },
    genderChipTxt: {
        fontSize: 14,
        fontWeight: '600',
        color: SynthTokens.colors.neutral600,
    },
    genderChipTxtSelected: { color: PINK },
    footer: {
        padding: SynthTokens.spacing.xl,
        paddingBottom: SynthTokens.spacing.xl + 20,
    },
});
