import React from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';
import { supabase } from '../src/integrations/supabase/client';

export default function ProfileEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [username, setUsername] = React.useState('');
  const [locationCity, setLocationCity] = React.useState('');
  const [bio, setBio] = React.useState('');

  React.useEffect(() => {
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('users')
          .select('username, location_city, bio')
          .eq('user_id', user.id)
          .single();
        if (data) {
          setUsername(data.username || '');
          setLocationCity((data as any).location_city || '');
          setBio((data as any).bio || '');
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const onSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from('users')
        .update({
          username: username.trim() || null,
          location_city: locationCity.trim() || null,
          bio: bio.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
      if (error) throw error;
      Alert.alert('Saved', 'Profile updated.');
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityLabel="Back">
          <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
        </TouchableOpacity>
        <SynthText variant="h2">Edit profile</SynthText>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <SynthText variant="meta" color="secondary">Username</SynthText>
          <TextInput value={username} onChangeText={setUsername} style={styles.input} placeholder="username" placeholderTextColor={SynthTokens.colors.neutral400} autoCapitalize="none" />
          <SynthText variant="meta" color="secondary">City</SynthText>
          <TextInput value={locationCity} onChangeText={setLocationCity} style={styles.input} placeholder="Los Angeles, CA" placeholderTextColor={SynthTokens.colors.neutral400} />
          <SynthText variant="meta" color="secondary">Bio</SynthText>
          <TextInput value={bio} onChangeText={setBio} style={[styles.input, styles.bio]} multiline placeholder="Tell people about your music taste" placeholderTextColor={SynthTokens.colors.neutral400} />
        </View>

        <TouchableOpacity onPress={onSave} style={[styles.saveButton, (saving || loading) && styles.saveButtonDisabled]} disabled={saving || loading}>
          <SynthText variant="meta" style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save changes'}</SynthText>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SynthTokens.spacing.sm,
    paddingVertical: SynthTokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: SynthTokens.colors.neutral200,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  body: { padding: SynthTokens.spacing.lg, gap: SynthTokens.spacing.lg },
  card: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    borderRadius: SynthTokens.radius.large,
    padding: SynthTokens.spacing.md,
    gap: 8,
  },
  input: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    borderRadius: SynthTokens.radius.medium,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: SynthTokens.colors.neutral900,
    marginBottom: 8,
  },
  bio: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: SynthTokens.colors.brandPink500,
    minHeight: 48,
    borderRadius: SynthTokens.radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: SynthTokens.colors.neutral0,
    fontWeight: '700',
  },
});
