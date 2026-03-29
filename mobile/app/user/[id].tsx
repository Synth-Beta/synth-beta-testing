import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, MessageCircle } from 'lucide-react-native';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';
import { ChatService } from '../../src/services/chatService';

export default function PublicUserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [profile, setProfile] = useState<{
    name: string | null;
    username: string | null;
    avatar_url: string | null;
    bio: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setSelfId(user?.id ?? null);
      const { data } = await supabase
        .from('users')
        .select('name, username, avatar_url, bio')
        .eq('user_id', id)
        .maybeSingle();
      if (data) {
        setProfile({
          name: (data as any).name ?? null,
          username: (data as any).username ?? null,
          avatar_url: (data as any).avatar_url ?? null,
          bio: (data as any).bio ?? null,
        });
      } else {
        setProfile(null);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const openChat = async () => {
    if (!id || !selfId || id === selfId) return;
    const chatId = await ChatService.ensureDirectChat(selfId, id);
    if (chatId) {
      router.push(`/chat/${chatId}`);
      return;
    }
    Alert.alert(
      'Could not open chat',
      'You may need to be friends first, or try again in a moment.'
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="Back">
            <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
          </Pressable>
          <SynthText variant="h2" numberOfLines={1} style={{ flex: 1 }}>
            Profile
          </SynthText>
          {id && selfId && id !== selfId ? (
            <Pressable onPress={() => void openChat()} style={styles.iconBtn} accessibilityLabel="Message">
              <MessageCircle size={24} color={SynthTokens.colors.brandPink500} />
            </Pressable>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={SynthTokens.colors.brandPink500} />
          </View>
        ) : !profile ? (
          <View style={styles.centered}>
            <SynthText variant="body" color="secondary">
              User not found.
            </SynthText>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <SynthText variant="h2">{(profile.name || profile.username || '?').charAt(0)}</SynthText>
              </View>
            )}
            <SynthText variant="h2">{profile.name || 'Synth fan'}</SynthText>
            {profile.username ? (
              <SynthText variant="meta" color="secondary">
                @{profile.username}
              </SynthText>
            ) : null}
            {profile.bio ? (
              <SynthText variant="body" style={styles.bio}>
                {profile.bio}
              </SynthText>
            ) : null}
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
  },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  body: { padding: 24, alignItems: 'center', gap: 8 },
  avatar: { width: 96, height: 96, borderRadius: 48, marginBottom: 8 },
  avatarFallback: {
    backgroundColor: SynthTokens.colors.neutral200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bio: { textAlign: 'center', marginTop: 12 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
