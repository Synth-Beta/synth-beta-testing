import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Text,
  Pressable,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Bell, ChevronLeft, Music, RefreshCw, CheckCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';
import { supabase } from '../src/integrations/supabase/client';
import {
  getStreamingLinkStatus,
  type StreamingLinkStatus,
} from '../src/services/streamingConnectionService';
import { getExpoSiteUrl } from '../src/utils/siteUrl';
import { launchChatImagePicker } from '../src/utils/launchChatImagePicker';
import { uploadProfileAvatarFromUri } from '../src/services/profileAvatarUpload';

const PINK = SynthTokens.colors.brandPink500;

const MUSIC_GENRES = [
  'Rock', 'Pop', 'Hip Hop', 'Rap', 'Electronic', 'Jazz', 'Classical', 'Indie',
  'R&B', 'Soul', 'Country', 'Metal', 'Folk', 'Punk', 'Blues', 'Reggae',
  'EDM', 'House', 'Techno', 'Dubstep', 'Trance', 'Drum & Bass', 'Ambient',
  'Alternative', 'Grunge', 'Hard Rock', 'Progressive Rock', 'Psychedelic Rock',
  'Trap', 'Grime', 'Afrobeat', 'Disco', 'Funk', 'Dance',
  'Latin', 'Reggaeton', 'K-Pop', 'Gospel', 'Bluegrass', 'Ska', 'Emo',
  'Lo-Fi', 'Shoegaze', 'Post-Rock', 'Experimental', 'Other',
] as const;

const GENRE_SIGNAL_TYPE = 'genre_manual_preference';

export default function ProfileEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPadding = SynthTokens.spacing.bottomNav + insets.bottom;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Profile fields
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [bio, setBio] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [gender, setGender] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Genre preferences
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());

  // Notification preferences
  const [similarUsersNotifications, setSimilarUsersNotifications] = useState(true);

  // Streaming
  const [streaming, setStreaming] = useState<StreamingLinkStatus>({
    linked: false,
    provider: 'unknown',
    profileUrl: null,
  });
  const [streamingLoading, setStreamingLoading] = useState(false);

  const normalizeGenre = (g: string) =>
    g.trim().toLowerCase().replace(/[\s\-_]+/g, ' ').trim();

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) return;
      setUserId(user.id);

      const [profileResult, signalsResult] = await Promise.all([
        supabase
          .from('users')
        .select('name, username, location_city, bio, instagram_handle, gender, similar_users_notifications, avatar_url')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('user_preference_signals')
          .select('genre, entity_name')
          .eq('user_id', user.id)
          .eq('signal_type', GENRE_SIGNAL_TYPE),
      ]);

      if (profileResult.data) {
        const d = profileResult.data as any;
        setName(d.name || '');
        setUsername(d.username || '');
        setLocationCity(d.location_city || '');
        setBio(d.bio || '');
        setInstagramHandle(d.instagram_handle || '');
        setGender(d.gender || '');
        setSimilarUsersNotifications(d.similar_users_notifications !== false);
        setAvatarUrl(d.avatar_url || null);
      }

      if (signalsResult.data) {
        const genres = new Set<string>();
        for (const row of signalsResult.data as any[]) {
          const g: string | null = row.genre ?? row.entity_name ?? null;
          if (g) {
            const norm = normalizeGenre(g);
            const match = MUSIC_GENRES.find(mg => normalizeGenre(mg) === norm);
            if (match) genres.add(match);
          }
        }
        setSelectedGenres(genres);
      }

      // Load streaming status
      void getStreamingLinkStatus(user.id).then(setStreaming);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshStreamingStatus = async () => {
    if (!userId) return;
    setStreamingLoading(true);
    try {
      const status = await getStreamingLinkStatus(userId);
      setStreaming(status);
    } finally {
      setStreamingLoading(false);
    }
  };

  const openConnectStreaming = (provider: 'spotify' | 'apple-music') => {
    const url = `${getExpoSiteUrl()}/streaming-stats?connect=${encodeURIComponent(provider)}&source=expo`;
    void WebBrowser.openBrowserAsync(url);
  };

  const handleResync = () => {
    router.push('/stats');
  };

  const handleDisconnectStreaming = () => {
    if (!userId) return;
    Alert.alert(
      'Disconnect Streaming',
      'This will remove your streaming account link. Your genre preferences and stats will remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setStreamingLoading(true);
            try {
              await supabase
                .from('users')
                .update({ music_streaming_profile: null, music_streaming_service: null, updated_at: new Date().toISOString() })
                .eq('user_id', userId);
              await supabase.from('streaming_profiles').delete().eq('user_id', userId);
              setStreaming({ linked: false, provider: 'unknown', profileUrl: null });
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Could not disconnect streaming account.');
            } finally {
              setStreamingLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleAvatarUpload = async (uri: string) => {
    if (!userId) return;
    setUploadingAvatar(true);
    try {
      const url = await uploadProfileAvatarFromUri(userId, uri);
      if (!url) throw new Error('Failed to upload avatar');
      const { error } = await supabase
        .from('users')
        .update({ avatar_url: url, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) throw error;
      setAvatarUrl(url);
    } catch (error) {
      console.warn('[profile-edit] avatar upload failed', error);
      Alert.alert('Upload failed', 'Could not upload your profile photo. Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!userId) return;
    setUploadingAvatar(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ avatar_url: null, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) throw error;
      setAvatarUrl(null);
    } catch (error) {
      console.warn('[profile-edit] remove avatar failed', error);
      Alert.alert('Could not remove photo', 'Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const pickAvatarSource = async (source: 'camera' | 'library') => {
    const result = await launchChatImagePicker(source);
    if (!result || result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    await handleAvatarUpload(asset.uri);
  };

  const promptAvatarAction = () => {
    const buttons: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[] = [
      { text: 'Take photo', onPress: () => void pickAvatarSource('camera') },
      { text: 'Choose from library', onPress: () => void pickAvatarSource('library') },
    ];
    if (avatarUrl) {
      buttons.push({ text: 'Remove photo', style: 'destructive', onPress: () => void handleRemoveAvatar() });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Profile photo', 'Add or update your profile picture.', buttons);
  };

  const toggleGenre = (genre: string) => {
    setSelectedGenres(prev => {
      const next = new Set(prev);
      if (next.has(genre)) next.delete(genre); else next.add(genre);
      return next;
    });
  };

  const onSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      // Save profile
      const { error: profileError } = await supabase
        .from('users')
        .update({
          name: name.trim() || null,
          username: username.trim() || null,
          location_city: locationCity.trim() || null,
          avatar_url: avatarUrl?.trim() || null,
          bio: bio.trim() || null,
          instagram_handle: instagramHandle.trim() || null,
          gender: gender.trim() || null,
          similar_users_notifications: similarUsersNotifications,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
      if (profileError) throw profileError;

      // Save genre preferences: delete old manual signals, then upsert new ones
      await supabase
        .from('user_preference_signals')
        .delete()
        .eq('user_id', userId)
        .eq('signal_type', GENRE_SIGNAL_TYPE);

      if (selectedGenres.size > 0) {
        const now = new Date().toISOString();
        const rows = Array.from(selectedGenres).map(genre => ({
          user_id: userId,
          signal_type: GENRE_SIGNAL_TYPE,
          entity_type: 'genre',
          entity_id: null,
          entity_name: genre,
          genre: genre.toLowerCase().replace(/\s+/g, '-'),
          signal_weight: 1.0,
          context: { source: 'manual_settings' },
          occurred_at: now,
        }));
        await supabase.from('user_preference_signals').insert(rows);
      }

      Alert.alert('Saved', 'Profile updated.');
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
          </TouchableOpacity>
          <SynthText variant="h2">Edit profile</SynthText>
          <View style={styles.back} />
        </View>
        <View style={styles.centered}><ActivityIndicator color={PINK} size="large" /></View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityLabel="Back">
          <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
        </TouchableOpacity>
        <SynthText variant="h2">Edit profile</SynthText>
        <View style={styles.back} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: bottomPadding }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile photo ─────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Profile photo</Text>
          </View>
          <SynthText variant="meta" color="secondary" style={styles.avatarHint}>
            Tap to add or change your avatar (max 2MB, JPG/PNG/WEBP/HEIC).
          </SynthText>
          <Pressable
            style={[
              styles.avatarActionRow,
              uploadingAvatar && styles.avatarActionDisabled,
            ]}
            onPress={promptAvatarAction}
            disabled={uploadingAvatar}
          >
            <View style={styles.avatarFrame}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>
                    {((name || username || 'S').trim().charAt(0) || 'S').toUpperCase()}
                  </Text>
                </View>
              )}
              {uploadingAvatar && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator size="small" color={SynthTokens.colors.neutral0} />
                </View>
              )}
            </View>
            <View style={styles.avatarDetails}>
              <SynthText variant="body" style={styles.avatarTitle}>
                {avatarUrl ? 'Change photo' : 'Add profile photo'}
              </SynthText>
              <SynthText variant="meta" color="secondary">
                {uploadingAvatar ? 'Uploading…' : 'Tap to choose a new photo'}
              </SynthText>
            </View>
          </Pressable>
        </View>

        {/* ── Profile fields ──────────────────────────────────────── */}
        <View style={styles.card}>
          <FieldLabel>Display name</FieldLabel>
          <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Your name" placeholderTextColor={SynthTokens.colors.neutral400} />
          <FieldLabel>Username</FieldLabel>
          <TextInput value={username} onChangeText={setUsername} style={styles.input} placeholder="username" placeholderTextColor={SynthTokens.colors.neutral400} autoCapitalize="none" />
          <FieldLabel>Instagram</FieldLabel>
          <TextInput value={instagramHandle} onChangeText={setInstagramHandle} style={styles.input} placeholder="@handle" placeholderTextColor={SynthTokens.colors.neutral400} autoCapitalize="none" />
          <FieldLabel>Gender (optional)</FieldLabel>
          <TextInput value={gender} onChangeText={setGender} style={styles.input} placeholder="How you identify" placeholderTextColor={SynthTokens.colors.neutral400} />
          <FieldLabel>City</FieldLabel>
          <TextInput value={locationCity} onChangeText={setLocationCity} style={styles.input} placeholder="Los Angeles, CA" placeholderTextColor={SynthTokens.colors.neutral400} />
          <FieldLabel>Bio</FieldLabel>
          <TextInput
            value={bio}
            onChangeText={setBio}
            style={[styles.input, styles.bio]}
            multiline
            placeholder="Tell people about your music taste"
            placeholderTextColor={SynthTokens.colors.neutral400}
          />
        </View>

        {/* ── Streaming Account ───────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <Music size={18} color={PINK} />
            <Text style={styles.sectionTitle}>Streaming Account</Text>
            {streamingLoading && <ActivityIndicator size="small" color={PINK} style={{ marginLeft: 'auto' }} />}
          </View>

          {streaming.linked ? (
            <>
              {/* Connected state */}
              <View style={styles.streamingConnectedRow}>
                <View style={styles.streamingConnectedBadge}>
                  <CheckCircle size={16} color="#10b981" />
                  <Text style={styles.streamingConnectedText}>
                    {streaming.provider === 'spotify' ? 'Spotify' : 'Apple Music'} Connected
                  </Text>
                </View>
                <Pressable onPress={handleDisconnectStreaming} disabled={streamingLoading}>
                  <SynthText variant="meta" style={styles.disconnectLink}>Disconnect</SynthText>
                </Pressable>
              </View>

              <Pressable
                style={[styles.streamingBtn, styles.streamingBtnPrimary]}
                onPress={handleResync}
              >
                <RefreshCw size={16} color={SynthTokens.colors.neutral0} />
                <Text style={styles.streamingBtnPrimaryText}>Resync Stats</Text>
              </Pressable>

              <Pressable
                style={styles.streamingBtnRefresh}
                onPress={() => void refreshStreamingStatus()}
                disabled={streamingLoading}
              >
                <RefreshCw size={14} color={SynthTokens.colors.neutral600} />
                <SynthText variant="meta" color="secondary">Refresh status</SynthText>
              </Pressable>
            </>
          ) : (
            <>
              {/* Disconnected state */}
              <SynthText variant="meta" color="secondary" style={styles.streamingHint}>
                Connect Spotify or Apple Music to sync your listening history and personalize your feed.
              </SynthText>

              <Pressable
                style={[styles.streamingBtn, styles.streamingBtnSpotify]}
                onPress={() => openConnectStreaming('spotify')}
              >
                <Music size={16} color={SynthTokens.colors.neutral0} />
                <Text style={styles.streamingBtnSpotifyText}>Connect Spotify</Text>
              </Pressable>

              <Pressable
                style={[styles.streamingBtn, styles.streamingBtnApple]}
                onPress={() => openConnectStreaming('apple-music')}
              >
                <Music size={16} color={SynthTokens.colors.neutral900} />
                <Text style={styles.streamingBtnAppleText}>Connect Apple Music</Text>
              </Pressable>

              <Pressable
                style={styles.streamingBtnRefresh}
                onPress={() => void refreshStreamingStatus()}
                disabled={streamingLoading}
              >
                <RefreshCw size={14} color={SynthTokens.colors.neutral600} />
                <SynthText variant="meta" color="secondary">Refresh status after connecting</SynthText>
              </Pressable>
            </>
          )}

          <SynthText variant="meta" color="secondary" style={styles.streamingNote}>
            OAuth happens on the web — tap a button above, sign in, then come back and tap Refresh status.
          </SynthText>
        </View>

        {/* ── Music taste ─────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <Music size={18} color={PINK} />
            <Text style={styles.sectionTitle}>Music Taste</Text>
          </View>
          <SynthText variant="meta" color="secondary" style={styles.sectionSub}>
            Select genres you love — helps personalize your event feed.
          </SynthText>
          <View style={styles.genreGrid}>
            {MUSIC_GENRES.map(genre => {
              const selected = selectedGenres.has(genre);
              return (
                <Pressable
                  key={genre}
                  onPress={() => toggleGenre(genre)}
                  style={[styles.genreChip, selected && styles.genreChipSelected]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                >
                  <Text style={[styles.genreChipTxt, selected && styles.genreChipTxtSelected]}>
                    {genre}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {selectedGenres.size > 0 ? (
            <SynthText variant="meta" color="secondary" style={styles.selectedCount}>
              {selectedGenres.size} genre{selectedGenres.size !== 1 ? 's' : ''} selected
            </SynthText>
          ) : null}
        </View>

        {/* ── Notifications ───────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <Bell size={18} color={PINK} />
            <Text style={styles.sectionTitle}>Notifications</Text>
          </View>
          <View style={styles.notifRow}>
            <View style={styles.notifText}>
              <Text style={styles.notifLabel}>Similar Users Notifications</Text>
              <SynthText variant="meta" color="secondary" style={styles.notifDesc}>
                Get notified when similar users (age, gender, interests) show interest in events
              </SynthText>
            </View>
            <Switch
              value={similarUsersNotifications}
              onValueChange={setSimilarUsersNotifications}
              trackColor={{ false: SynthTokens.colors.neutral200, true: 'rgba(204,36,134,0.25)' }}
              thumbColor={similarUsersNotifications ? PINK : SynthTokens.colors.neutral0}
              ios_backgroundColor={SynthTokens.colors.neutral200}
            />
          </View>
        </View>

        <TouchableOpacity
          onPress={() => void onSave()}
          style={[styles.saveButton, (saving || loading) && styles.saveButtonDisabled]}
          disabled={saving || loading}
        >
          {saving
            ? <ActivityIndicator color={SynthTokens.colors.neutral0} />
            : <Text style={styles.saveButtonText}>Save changes</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <SynthText variant="meta" color="secondary" style={{ marginBottom: -2 }}>{children}</SynthText>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SynthTokens.spacing.sm,
    paddingVertical: SynthTokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
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
  avatarActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarActionDisabled: {
    opacity: 0.6,
  },
  avatarFrame: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral100,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 32,
    fontWeight: '700',
    color: SynthTokens.colors.neutral600,
  },
  avatarDetails: {
    flex: 1,
    minHeight: 88,
    justifyContent: 'center',
  },
  avatarTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  avatarHint: {
    marginBottom: 8,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
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
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  sectionSub: {
    marginBottom: 8,
    lineHeight: 18,
  },
  genreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genreChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  genreChipSelected: {
    borderColor: PINK,
    backgroundColor: 'rgba(204,36,134,0.08)',
  },
  genreChipTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: SynthTokens.colors.neutral600 ?? SynthTokens.colors.neutral600,
  },
  genreChipTxtSelected: {
    color: PINK,
  },
  selectedCount: {
    marginTop: 4,
    textAlign: 'right',
    fontWeight: '600',
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  notifText: { flex: 1, minWidth: 0 },
  notifLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: SynthTokens.colors.neutral900,
    marginBottom: 2,
  },
  notifDesc: { lineHeight: 18 },
  saveButton: {
    backgroundColor: PINK,
    minHeight: 48,
    borderRadius: SynthTokens.radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: {
    color: SynthTokens.colors.neutral0,
    fontWeight: '700',
    fontSize: 16,
  },
  // Streaming
  streamingConnectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  streamingConnectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ecfdf5',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#6ee7b7',
  },
  streamingConnectedText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065f46',
  },
  disconnectLink: {
    color: SynthTokens.colors.neutral400,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  streamingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: SynthTokens.radius.medium,
    paddingVertical: 12,
    minHeight: 44,
  },
  streamingBtnPrimary: {
    backgroundColor: PINK,
    marginBottom: 6,
  },
  streamingBtnPrimaryText: {
    color: SynthTokens.colors.neutral0,
    fontWeight: '700',
    fontSize: 14,
  },
  streamingBtnDisabled: { opacity: 0.6 },
  streamingBtnSpotify: {
    backgroundColor: '#1DB954',
    marginBottom: 8,
  },
  streamingBtnSpotifyText: {
    color: SynthTokens.colors.neutral0,
    fontWeight: '700',
    fontSize: 14,
  },
  streamingBtnApple: {
    backgroundColor: SynthTokens.colors.neutral100,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    marginBottom: 8,
  },
  streamingBtnAppleText: {
    color: SynthTokens.colors.neutral900,
    fontWeight: '700',
    fontSize: 14,
  },
  streamingBtnRefresh: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  streamingHint: {
    lineHeight: 18,
    marginBottom: 8,
  },
  streamingNote: {
    lineHeight: 17,
    marginTop: 4,
    fontSize: 11,
  },
});
