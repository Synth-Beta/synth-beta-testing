import React, { useContext, useState, useEffect, useRef, useCallback } from 'react';
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
import { InviteService, normalizeInviteCode } from '../../src/services/inviteService';
import { getCurrentLatLng, reverseGeocode } from '../../src/services/locationService';
import { ACQUISITION_SOURCE_CANONICAL_ORDER, type AcquisitionSource, needsContactEmail, describeProfileSaveError, validateOnboardingProfile, normalizeBirthday, isPlaceholderName } from '@synth/shared';
import type { User } from '@supabase/supabase-js';
import { ContactEmailContext } from '../_layout';
import { startProfileSave } from '../../src/services/pendingProfileSave';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Local copy of the form, written before the background save and cleared once it lands, so
// quitting the app mid-save never loses what the user typed.
const snapshotKey = (userId: string) => `synth.onboardingProfileSnapshot:${userId}`;
import { trackOnboardingStep, trackOnboardingBlock } from '../../src/services/onboardingTelemetry';

const PINK = SynthTokens.colors.brandPink500;

const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

/** Sanitize text to valid username characters (lowercase, letters, numbers, _, .) */
function sanitizeUsername(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 30);
}

/** Suggest a username from display name (first + last initial, then random digits if needed) */

function isPlaceholderUsername(username: string | null | undefined): boolean {
    return !username || /^user_[0-9a-f]{8}$/.test(username);
}

function suggestUsername(displayName: string): string {
    const base = displayName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 20);
    return base || '';
}

/** Three short numeric boxes (MM / DD / YYYY) with auto-advance: far easier on a phone than typing YYYY-MM-DD. */
function BirthdayInput({ value, onChange, hasError }: { value: string; onChange: (v: string) => void; hasError: boolean }) {
    const [m, setM] = useState('');
    const [d, setD] = useState('');
    const [y, setY] = useState('');
    const dRef = useRef<TextInput>(null);
    const yRef = useRef<TextInput>(null);

    // Prefill from a stored YYYY-MM-DD value.
    useEffect(() => {
        const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (mt && `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` !== value) {
            setY(mt[1]);
            setM(mt[2]);
            setD(mt[3]);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const emit = (nm: string, nd: string, ny: string) =>
        onChange(nm && nd && ny.length === 4 ? `${ny}-${nm.padStart(2, '0')}-${nd.padStart(2, '0')}` : '');
    const digits = (t: string, max: number) => t.replace(/\D/g, '').slice(0, max);
    const boxStyle = [styles.input, hasError ? styles.inputError : null, { textAlign: 'center' as const }];

    return (
        <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
                style={[...boxStyle, { flex: 1 }]}
                value={m}
                onChangeText={t => { const v = digits(t, 2); setM(v); emit(v, d, y); if (v.length === 2) dRef.current?.focus(); }}
                placeholder="MM"
                placeholderTextColor={SynthTokens.colors.neutral400}
                keyboardType="number-pad"
                maxLength={2}
                accessibilityLabel="Birthday month"
            />
            <TextInput
                ref={dRef}
                style={[...boxStyle, { flex: 1 }]}
                value={d}
                onChangeText={t => { const v = digits(t, 2); setD(v); emit(m, v, y); if (v.length === 2) yRef.current?.focus(); }}
                placeholder="DD"
                placeholderTextColor={SynthTokens.colors.neutral400}
                keyboardType="number-pad"
                maxLength={2}
                accessibilityLabel="Birthday day"
            />
            <TextInput
                ref={yRef}
                style={[...boxStyle, { flex: 2 }]}
                value={y}
                onChangeText={t => { const v = digits(t, 4); setY(v); emit(m, d, v); }}
                placeholder="YYYY"
                placeholderTextColor={SynthTokens.colors.neutral400}
                keyboardType="number-pad"
                maxLength={4}
                accessibilityLabel="Birthday year"
            />
        </View>
    );
}

export default function ProfileSetupScreen() {
    const router = useRouter();
    const { markContactEmailSaved } = useContext(ContactEmailContext);

    const [name, setName] = useState('');
    const [userId, setUserId] = useState<string | null>(null);
    const [authUser, setAuthUser] = useState<User | null>(null);
    const [username, setUsername] = useState('');
    const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error'>('idle');
    const [usernameError, setUsernameError] = useState('');
    const [nameError, setNameError] = useState('');
    const scrollRef = useRef<ScrollView>(null);
    const fieldY = useRef<Record<string, number>>({});
    const checkSeq = useRef(0);
    const [birthday, setBirthday] = useState('');
    const [birthdayError, setBirthdayError] = useState('');
    const [city, setCity] = useState('');
    const [locatingCity, setLocatingCity] = useState(false);
    const [locateCityError, setLocateCityError] = useState('');
    const [gender, setGender] = useState('');
    const [saving, setSaving] = useState(false);
    const [acquisitionSource, setAcquisitionSource] = useState<AcquisitionSource | ''>('');
    const [acquisitionSourceOther, setAcquisitionSourceOther] = useState('');
    const [acquisitionSourceError, setAcquisitionSourceError] = useState('');
    const [contactEmail, setContactEmail] = useState('');
    const [contactEmailError, setContactEmailError] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [inviteCodeError, setInviteCodeError] = useState('');

    // Opened a friend's invite link before signing up: the code was saved by _layout.
    useEffect(() => {
        void InviteService.getPending().then((code) => code && setInviteCode(code));
    }, []);

    const usernameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Pre-fill from what's already stored, falling back to auth metadata, and capture
    // userId for self-exclusion in the username check. Anyone who dropped out partway
    // through onboarding and reopened the app used to land on a blank form and retype
    // everything - the row already had their answers, nothing read them back.
    useEffect(() => {
        let cancelled = false;

        void (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || cancelled) return;
            setUserId(user.id);
            setAuthUser(user);

            const draft = await OnboardingService.loadProfileDraft(user.id);
            if (cancelled) return;

            // The signup trigger seeds name/username when the row is created, so a
            // stored value is only worth showing if a human actually chose it.
            const storedName = isPlaceholderName(draft?.name, user.email) ? '' : (draft?.name ?? '');
            const storedUsername = isPlaceholderUsername(draft?.username)
                ? ''
                : (draft?.username ?? '');

            const displayName: string =
                storedName ||
                user.user_metadata?.full_name ||
                user.user_metadata?.name ||
                '';
            if (displayName) setName(displayName);

            const resolvedUsername = storedUsername || suggestUsername(displayName);
            if (resolvedUsername.length >= 3) {
                setUsername(resolvedUsername);
                scheduleUsernameCheck(resolvedUsername, user.id);
            }

            if (draft?.birthday) setBirthday(draft.birthday);
            if (draft?.gender) setGender(draft.gender);
            if (draft?.location_city) setCity(draft.location_city);
            if (draft?.contact_email) setContactEmail(draft.contact_email);
            if (
                draft?.acquisition_source &&
                (ACQUISITION_SOURCE_CANONICAL_ORDER as readonly string[]).includes(draft.acquisition_source)
            ) {
                setAcquisitionSource(draft.acquisition_source as AcquisitionSource);
                if (draft.acquisition_source === 'Other' && draft.other_acquisition_source) {
                    setAcquisitionSourceOther(draft.other_acquisition_source);
                }
            }

            // An unsaved snapshot (app quit before the background save landed) wins over the
            // server draft: it is newer and is exactly what they typed.
            try {
                const raw = await AsyncStorage.getItem(snapshotKey(user.id));
                if (raw && !cancelled) {
                    const snap = JSON.parse(raw) as Record<string, string>;
                    if (snap.name) setName(snap.name);
                    if (snap.username) {
                        setUsername(snap.username);
                        scheduleUsernameCheck(snap.username, user.id);
                    }
                    if (snap.birthday) setBirthday(snap.birthday);
                    if (snap.city) setCity(snap.city);
                    if (snap.gender) setGender(snap.gender);
                    if (snap.contactEmail) setContactEmail(snap.contactEmail);
                    if (snap.inviteCode) setInviteCode(snap.inviteCode);
                    if (
                        snap.acquisitionSource &&
                        (ACQUISITION_SOURCE_CANONICAL_ORDER as readonly string[]).includes(snap.acquisitionSource)
                    ) {
                        setAcquisitionSource(snap.acquisitionSource as AcquisitionSource);
                        if (snap.acquisitionSourceOther) setAcquisitionSourceOther(snap.acquisitionSourceOther);
                    }
                }
            } catch {
                /* a bad snapshot just means no local prefill */
            }
        })();

        return () => {
            cancelled = true;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Record that this screen was reached, so per-step drop-off is visible instead of
    // being reconstructed from signup timestamps after the fact.
    useEffect(() => {
        trackOnboardingStep('profile');
    }, []);

    // excludeId lets the mount-time prefill pass the id directly: the effect's closure
    // still holds userId = null, which made a returning user's own username read "taken".
    const checkUsernameAvailability = useCallback(async (uname: string, excludeId?: string) => {
        if (!USERNAME_RE.test(uname)) {
            setUsernameStatus('invalid');
            return;
        }
        setUsernameStatus('checking');
        // Latest check wins: a slow earlier response must not overwrite a newer result.
        const seq = ++checkSeq.current;
        const selfId = excludeId ?? userId;
        let query = supabase.from('users').select('user_id').eq('username', uname);
        if (selfId) query = query.neq('user_id', selfId);
        const { data, error } = await query.maybeSingle();
        if (seq !== checkSeq.current) return;
        // supabase-js returns errors instead of throwing: a failed lookup used to read as "available".
        if (error) {
            setUsernameStatus('error');
            return;
        }
        setUsernameStatus(data ? 'taken' : 'available');
    }, [userId]);

    const scheduleUsernameCheck = useCallback((uname: string, excludeId?: string) => {
        if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current);
        if (uname.length < 3) { setUsernameStatus('idle'); return; }
        usernameCheckTimer.current = setTimeout(() => {
            void checkUsernameAvailability(uname, excludeId);
        }, 600);
    }, [checkUsernameAvailability]);

    const handleUseCurrentLocation = useCallback(async () => {
        setLocateCityError('');
        setLocatingCity(true);
        try {
            const coords = await getCurrentLatLng();
            if (!coords) {
                setLocateCityError("Couldn't get your location — enter it manually below");
                return;
            }
            const formatted = await reverseGeocode(coords.latitude, coords.longitude);
            if (!formatted) {
                setLocateCityError("Couldn't determine your city — enter it manually below");
                return;
            }
            setCity(formatted);
        } finally {
            setLocatingCity(false);
        }
    }, []);

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
        setUsernameError('');
        scheduleUsernameCheck(sanitized);
    };

    // Same rules as web (@synth/shared onboardingRules): required name, username,
    // birthday (13+), how did you hear; city, gender, bio, photo optional.
    // Apple Guideline 4: never require a name from Sign in with Apple users; fall back to username.
    const isApple = authUser?.app_metadata?.provider === 'apple';
    const effectiveName = name.trim() || (isApple ? username.trim() : '');
    const rules = validateOnboardingProfile({ name: effectiveName, username, birthday, acquisitionSource: acquisitionSource || null });
    const validateBirthday = (val: string): string =>
        validateOnboardingProfile({ name: effectiveName, username, birthday: val, acquisitionSource: acquisitionSource || null }).errors.birthday ?? '';

    const handleBirthdayBlur = () => {
        setBirthdayError(validateBirthday(birthday));
    };

    const showContactEmailField = needsContactEmail(authUser, null);

    // Contact email is deliberately NOT part of this gate. This is step 1 of 5, and
    // showContactEmailField is true for exactly one group: Apple Hide My Email users. So
    // requiring it here demanded a real address from the very people who had just chosen
    // to hide theirs, on the first screen they ever saw, before anything had earned that
    // trust. Every Apple private-relay user who stalled in onboarding stalled on THIS
    // screen. The /email-required gate in _layout.tsx already asks for it immediately
    // after onboarding, which is a fairer moment and loses nothing.
    const canContinue =
        // Apple Sign In users who decline name sharing arrive with no name in their auth
        // metadata, so this field starts blank. It used to be unvalidated, which sent an
        // empty name into a NOT NULL column and hard-stopped them on this screen.
        rules.ok && (usernameStatus === 'available' || usernameStatus === 'idle');

    const scrollToField = (key: string) => {
        const y = fieldY.current[key];
        if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    };

    const handleContinue = async () => {
        // The button stays tappable: show what's wrong and jump to it instead of a dead grey button.
        const errs = rules.errors;
        if (errs.name) {
            setNameError(errs.name);
            scrollToField('name');
            return;
        }
        if (errs.username || usernameStatus === 'taken' || usernameStatus === 'invalid') {
            if (errs.username) setUsernameError(errs.username);
            scrollToField('username');
            return;
        }
        if (errs.birthday) {
            setBirthdayError(errs.birthday);
            scrollToField('birthday');
            return;
        }
        if (errs.acquisitionSource) {
            trackOnboardingBlock('acquisition_source');
            setAcquisitionSourceError(errs.acquisitionSource);
            scrollToField('acquisition');
            return;
        }

        // Final birthday validation
        const bdErr = validateBirthday(birthday);
        if (bdErr) { setBirthdayError(bdErr); return; }

        // Final username check (exclude current user so back-navigation doesn't false-positive)
        if (usernameStatus !== 'available') {
            let freshQuery = supabase.from('users').select('user_id').eq('username', username);
            if (userId) freshQuery = freshQuery.neq('user_id', userId);
            const fresh = await freshQuery.maybeSingle();
            if (fresh.error) {
                setUsernameError("Couldn't check that username. Check your connection and try again.");
                scrollToField('username');
                return;
            }
            if (fresh.data) {
                // Mobile already excludes the user's own row here, so this is a genuine
                // collision - unlike the web bug where it was the user's own username.
                trackOnboardingBlock('username');
                setUsernameStatus('taken');
                return;
            }
        }

        const trimmedOtherSource = acquisitionSourceOther.trim();
        if (!acquisitionSource) {
            trackOnboardingBlock('acquisition_source');
            setAcquisitionSourceError('Please select where you heard about Synth');
            return;
        }

        const trimmedContactEmail = contactEmail.trim();
        // Validate only what they actually typed: a blank passes through (the
        // /email-required gate asks again right after onboarding), a typo is still caught
        // here rather than being saved as an unreachable address.
        if (showContactEmailField && trimmedContactEmail && !EMAIL_RE.test(trimmedContactEmail)) {
            trackOnboardingBlock('contact_email_invalid');
            setContactEmailError('Please enter a valid email');
            return;
        }

        // Check the invite code BEFORE saving: a bad code used to block here after the profile was
        // already written, leaving the user on a form they believed was submitted.
        const inviteNorm = normalizeInviteCode(inviteCode);
        if (inviteNorm) {
            // A thrown error is a network/RPC failure, not a bad code: keep it and continue
            // (it is validated again when redeemed).
            let lookupFailed = false;
            const invite = await InviteService.preview(inviteNorm).catch(() => {
                lookupFailed = true;
                return null;
            });
            if (!invite && !lookupFailed) {
                setInviteCodeError("That invite code doesn't exist. Check it or leave it blank.");
                scrollToField('invite');
                return;
            }
        }

        if (userId) {
            try {
                await AsyncStorage.setItem(
                    snapshotKey(userId),
                    JSON.stringify({
                        name, username, birthday, city, gender, contactEmail, inviteCode,
                        acquisitionSource, acquisitionSourceOther,
                    })
                );
            } catch {
                /* local copy is a safety net only */
            }
        }

        // Save in the background so the next screen opens instantly. The artists step awaits
        // this (and retries it) before completing onboarding, so nobody finishes unsaved.
        startProfileSave(async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            // A null user (expired token) used to skip the save silently and still advance
            // to the next step, so the profile was never written and the wizard carried on
            // as if it had been. Throw into the catch below instead.
            if (!user) {
                throw new Error('No authenticated user when saving profile setup');
            }
            await OnboardingService.saveProfileSetup(user.id, {
                name: effectiveName || undefined,
                username: username.trim() || undefined,
                birthday: birthday.trim() ? normalizeBirthday(birthday) : undefined,
                location_city: city.trim() || undefined,
                gender: gender || undefined,
                acquisition_source: acquisitionSource || undefined,
                other_acquisition_source:
                    acquisitionSource === 'Other' ? trimmedOtherSource || null : null,
                contact_email:
                    showContactEmailField && trimmedContactEmail ? trimmedContactEmail : undefined,
            });
            // Only report the gate satisfied when a real address was actually saved. A
            // blank marked as "saved" would suppress the /email-required screen that is
            // now responsible for collecting it - trading this bug for a quieter one.
            if (showContactEmailField && trimmedContactEmail) {
                markContactEmailSaved(trimmedContactEmail);
            }
            await AsyncStorage.removeItem(snapshotKey(user.id)).catch(() => {});
          } catch (e) {
            // Real reason + code (see describeProfileSaveError); surfaced on the artists step.
            const { code } = describeProfileSaveError(e);
            trackOnboardingBlock(`profile_save_threw_${code}`);
            console.warn('Profile setup write failed:', e);
            throw e;
          }
        });

        // Redeemed at the end of onboarding (artists step); here we only store it.
        if (inviteNorm) {
            await InviteService.savePending(inviteNorm);
        } else {
            await InviteService.clearPending();
        }

        router.push('/(onboarding)/connect');
    };

    const handleBack = useCallback(async () => {
        if (router.canGoBack()) {
            router.back();
            return;
        }

        // Root layout enters here via replace() after signup, so there is no
        // previous screen. Sign out first — a still-authenticated visit to
        // sign-in is immediately sent back to this profile step.
        try {
            await supabase.auth.signOut();
        } catch {
            // Still return to auth even if sign-out fails.
        }
        router.replace('/(auth)/sign-in');
    }, [router]);

    const usernameHint = (() => {
        switch (usernameStatus) {
            case 'checking': return { text: 'Checking…', color: SynthTokens.colors.neutral600 };
            case 'available': return { text: 'Username available', color: SynthTokens.colors.success };
            case 'taken': return { text: 'Username already taken', color: SynthTokens.colors.error };
            case 'error': return { text: "Couldn't check availability. We'll verify when you continue.", color: SynthTokens.colors.neutral600 };
            case 'invalid': return { text: 'Only letters, numbers, _ and . allowed (3–30 chars)', color: SynthTokens.colors.error };
            default: return null;
        }
    })();

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Pressable onPress={handleBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back">
                    <ChevronLeft color={SynthTokens.colors.neutral900} size={28} />
                </Pressable>
                <OnboardingProgress totalSteps={3} currentStep={1} />
                <View style={styles.skipButton} />
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView
                    ref={scrollRef}
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <SynthText variant="h1" style={styles.title}>Tell us about yourself</SynthText>
                    <SynthText variant="meta" color="secondary" style={styles.subtitle}>
                        Set up your profile to get personalized event recommendations
                    </SynthText>

                    {/* Name */}
                    <View style={styles.fieldBlock} onLayout={e => { fieldY.current.name = e.nativeEvent.layout.y; }}>
                        <Text style={styles.label}>Display Name{isApple ? ' (optional)' : ''}</Text>
                        <TextInput
                            style={styles.input}
                            value={name}
                            onChangeText={t => { setName(t); if (nameError) setNameError(''); }}
                            placeholder="Your name"
                            placeholderTextColor={SynthTokens.colors.neutral400}
                            autoCorrect={false}
                        />
                        {nameError ? <Text style={[styles.hint, { color: SynthTokens.colors.error }]}>{nameError}</Text> : null}
                    </View>

                    {/* Username */}
                    <View style={styles.fieldBlock} onLayout={e => { fieldY.current.username = e.nativeEvent.layout.y; }}>
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
                        {usernameError ? <Text style={[styles.hint, { color: SynthTokens.colors.error }]}>{usernameError}</Text> : null}
                    </View>

                    {/* Birthday */}
                    <View style={styles.fieldBlock} onLayout={e => { fieldY.current.birthday = e.nativeEvent.layout.y; }}>
                        <Text style={styles.label}>Birthday <Text style={styles.required}>*</Text></Text>
                        <BirthdayInput
                            value={birthday}
                            hasError={!!birthdayError}
                            onChange={v => { setBirthday(v); setBirthdayError(v.length >= 10 ? validateBirthday(v) : ''); }}
                        />
                        {birthdayError ? (
                            <Text style={[styles.hint, { color: SynthTokens.colors.error }]}>{birthdayError}</Text>
                        ) : (
                            <Text style={styles.hint}>You must be at least 13 years old</Text>
                        )}
                    </View>

                    {/* City */}
                    <View style={styles.fieldBlock}>
                        <View style={styles.cityLabelRow}>
                            <Text style={styles.label}>City (optional)</Text>
                            <Pressable onPress={handleUseCurrentLocation} disabled={locatingCity} hitSlop={8}>
                                {locatingCity ? (
                                    <ActivityIndicator size="small" color={PINK} />
                                ) : (
                                    <Text style={styles.useLocationLink}>Use my current location</Text>
                                )}
                            </Pressable>
                        </View>
                        <TextInput
                            style={styles.input}
                            value={city}
                            onChangeText={text => { setCity(text); setLocateCityError(''); }}
                            placeholder="Los Angeles, CA"
                            placeholderTextColor={SynthTokens.colors.neutral400}
                        />
                        {locateCityError ? (
                            <Text style={[styles.hint, { color: SynthTokens.colors.error }]}>{locateCityError}</Text>
                        ) : (
                            <Text style={styles.hint}>Used for local event discovery</Text>
                        )}
                    </View>

                    {/* Acquisition source */}
                    <View style={styles.fieldBlock} onLayout={e => { fieldY.current.acquisition = e.nativeEvent.layout.y; }}>
                        <Text style={styles.label}>How did you hear about Synth? <Text style={styles.required}>*</Text></Text>
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
                        {acquisitionSourceError && acquisitionSource !== 'Other' ? (
                            <Text style={[styles.hint, { color: SynthTokens.colors.error }]}>{acquisitionSourceError}</Text>
                        ) : null}
                    </View>
                    {acquisitionSource === 'Other' && (
                        <View style={styles.fieldBlock}>
                            <Text style={styles.label}>Share a bit more (optional)</Text>
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
                                <Text style={[styles.hint, { color: SynthTokens.colors.error }]}>{acquisitionSourceError}</Text>
                            ) : (
                                <Text style={styles.hint}>Share any detail that helps us attribute this referral.</Text>
                            )}
                        </View>
                    )}

                    <View style={styles.fieldBlock} onLayout={e => { fieldY.current.invite = e.nativeEvent.layout.y; }}>
                        <Text style={styles.label}>Invite code (optional)</Text>
                        <TextInput
                            style={[styles.input, inviteCodeError ? styles.inputError : null]}
                            value={inviteCode}
                            onChangeText={text => {
                                setInviteCode(text.toUpperCase());
                                if (inviteCodeError) setInviteCodeError('');
                            }}
                            placeholder="e.g., K7M2QX"
                            placeholderTextColor={SynthTokens.colors.neutral400}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            maxLength={12}
                        />
                        <Text style={[styles.hint, inviteCodeError ? { color: SynthTokens.colors.error } : null]}>
                            {inviteCodeError || "Got a code from a friend? You'll be friends on Synth right away."}
                        </Text>
                    </View>

                    {showContactEmailField && (
                        <View style={styles.fieldBlock}>
                            <Text style={styles.label}>Contact email</Text>
                            <TextInput
                                style={[styles.input, contactEmailError ? styles.inputError : null]}
                                value={contactEmail}
                                onChangeText={text => { setContactEmail(text); if (contactEmailError) setContactEmailError(''); }}
                                placeholder="you@example.com"
                                placeholderTextColor={SynthTokens.colors.neutral400}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="email-address"
                            />
                            {contactEmailError ? (
                                <Text style={[styles.hint, { color: SynthTokens.colors.error }]}>{contactEmailError}</Text>
                            ) : (
                                <Text style={styles.hint}>Optional here — we'll ask again once you're set up. We use it to reach you about your account and about reports of harassment or abuse.</Text>
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
                        disabled={false}
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
        borderColor: SynthTokens.colors.error,
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
    cityLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    useLocationLink: {
        fontSize: 13,
        fontWeight: '600',
        color: PINK,
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
