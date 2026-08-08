import React, { useContext, useState } from 'react';
import {
    StyleSheet,
    View,
    SafeAreaView,
    TextInput,
    Text,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Pressable,
    Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SynthText } from '../src/components/SynthText';
import { SynthButton } from '../src/components/SynthButton';
import { SynthTokens } from '../src/tokens/SynthTokens';
import { supabase } from '../src/integrations/supabase/client';
import { OnboardingService } from '../src/services/onboardingService';
import { ContactEmailContext } from './_layout';

const PINK = SynthTokens.colors.brandPink500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailRequiredScreen() {
    const router = useRouter();
    const { markContactEmailSaved } = useContext(ContactEmailContext);
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const canSave = EMAIL_RE.test(email.trim()) && !saving;

    const handleSave = async () => {
        const trimmed = email.trim();
        if (!EMAIL_RE.test(trimmed)) {
            setError('Please enter a valid email');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setError('Something went wrong. Please try again.');
                return;
            }
            const success = await OnboardingService.updateContactEmail(user.id, trimmed);
            if (!success) {
                setError('Could not save your email. Please try again.');
                return;
            }
            markContactEmailSaved(trimmed);
            router.replace('/(tabs)');
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.content}>
                    <SynthText variant="h1" style={styles.title}>We need a contact email</SynthText>
                    <SynthText variant="meta" color="secondary" style={styles.subtitle}>
                        We now require a real contact email on every account to help protect our community — so we can reach you about your account and follow up on reports of harassment or bullying.
                    </SynthText>
                    <Pressable onPress={() => { void Linking.openURL('https://getsynth.app/privacy-policy.html'); }}>
                        <Text style={styles.privacyLink}>Read our Privacy Policy</Text>
                    </Pressable>

                    <View style={styles.fieldBlock}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            style={[styles.input, error ? styles.inputError : null]}
                            value={email}
                            onChangeText={text => { setEmail(text); if (error) setError(''); }}
                            placeholder="you@example.com"
                            placeholderTextColor={SynthTokens.colors.neutral400}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="email-address"
                            autoFocus
                        />
                        {error ? <Text style={styles.hint}>{error}</Text> : null}
                    </View>
                </View>
            </KeyboardAvoidingView>

            <View style={styles.footer}>
                {saving ? (
                    <ActivityIndicator color={PINK} />
                ) : (
                    <SynthButton title="Save email" onPress={() => void handleSave()} disabled={!canSave} />
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
    content: { flex: 1, padding: SynthTokens.spacing.xl, justifyContent: 'center' },
    title: { marginBottom: 8 },
    subtitle: { marginBottom: 12 },
    privacyLink: {
        fontSize: 13,
        fontWeight: '600',
        color: PINK,
        textDecorationLine: 'underline',
        marginBottom: 28,
    },
    fieldBlock: { marginBottom: 20 },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: SynthTokens.colors.neutral600,
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
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
    inputError: { borderColor: '#dc2626' },
    hint: { fontSize: 12, color: '#dc2626', marginTop: 5 },
    footer: { padding: SynthTokens.spacing.xl, paddingBottom: SynthTokens.spacing.xl + 20 },
});
