import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Linking, ActivityIndicator } from 'react-native';
import { Upload, Radio } from 'lucide-react-native';
import { LASTFM_SPOTIFY_TIP, SPOTIFY_EXPORT_STEPS, SPOTIFY_EXPORT_URL, type MusicImportSource } from '@synth/shared';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { fetchSavedLastfmUsername, importMusic, pickSpotifyExport } from '../../services/musicImportActions';

const LASTFM_RED = '#D51007';

/**
 * Last.fm + Spotify-export connect, for everyone who can't use Spotify OAuth.
 * Mirrors src/components/streaming/MusicImportOptions.tsx on web.
 */
export function MusicImportOptions({
  onImported,
  showExport = true,
}: {
  onImported: (source: MusicImportSource) => void;
  /** Onboarding hides it: the export takes days to arrive. */
  showExport?: boolean;
}) {
  const [username, setUsername] = useState('');
  const [savedLastfm, setSavedLastfm] = useState<string | null>(null);
  const [busy, setBusy] = useState<MusicImportSource | null>(null);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    void fetchSavedLastfmUsername().then((name) => {
      setSavedLastfm(name);
      if (name) setUsername((current) => current || name);
    });
  }, []);

  const connectLastfm = async () => {
    if (!username.trim() || busy) return;
    setBusy('lastfm');
    setNote(null);
    try {
      const result = await importMusic({ source: 'lastfm', username });
      if (!result.ok) return setNote({ text: result.message ?? 'Import failed. Try again.', error: true });
      setNote({ text: `Last.fm connected · ${result.counts?.artists ?? 0} artists imported.`, error: false });
      setSavedLastfm(username.trim().replace(/^@/, ''));
      onImported('lastfm');
    } finally {
      setBusy(null);
    }
  };

  const uploadExport = async () => {
    if (busy) return;
    setBusy('spotify-export');
    setNote(null);
    try {
      const summary = await pickSpotifyExport();
      if (summary === 'cancelled') return;
      if (!summary) {
        return setNote({
          text: 'No music plays found. Pick the zip from Spotify\'s "Account data" email (or the StreamingHistory files inside it).',
          error: true,
        });
      }
      const result = await importMusic({ source: 'spotify-export', summary });
      if (!result.ok) return setNote({ text: result.message ?? 'Import failed. Try again.', error: true });
      setNote({ text: `Spotify data imported · ${summary.totalPlays.toLocaleString()} plays read.`, error: false });
      onImported('spotify-export');
    } catch {
      setNote({ text: "Couldn't read that file. Try the zip exactly as Spotify sent it.", error: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.block}>
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <Radio size={16} color={LASTFM_RED} />
          <SynthText variant="accent">Last.fm</SynthText>
        </View>
        {savedLastfm ? (
          <Text style={styles.note}>Connected as {savedLastfm} · tap Sync for your latest listening</Text>
        ) : (
          <SynthText variant="meta" color="secondary" style={styles.hint}>{LASTFM_SPOTIFY_TIP}</SynthText>
        )}
        <View style={styles.inputRow}>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="Last.fm username"
            placeholderTextColor={SynthTokens.colors.neutral400}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => void connectLastfm()}
            style={styles.input}
            accessibilityLabel="Last.fm username"
          />
          <Pressable
            style={[styles.btnLastfm, (!username.trim() || busy !== null) && styles.btnDisabled]}
            onPress={() => void connectLastfm()}
            disabled={!username.trim() || busy !== null}
          >
            {busy === 'lastfm' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnText}>{savedLastfm && username.trim() === savedLastfm ? 'Sync' : 'Connect'}</Text>}
          </Pressable>
        </View>
        <Pressable onPress={() => void Linking.openURL('https://www.last.fm/join')}>
          <Text style={styles.link}>Create a free Last.fm account</Text>
        </Pressable>
      </View>

      {showExport ? (
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Upload size={16} color="#1DB954" />
            <SynthText variant="accent">Upload your Spotify data</SynthText>
          </View>
          {SPOTIFY_EXPORT_STEPS.map((step, i) => (
            <SynthText key={step} variant="meta" color="secondary" style={styles.hint}>
              {i + 1}. {step}
            </SynthText>
          ))}
          <Pressable onPress={() => void Linking.openURL(SPOTIFY_EXPORT_URL)}>
            <Text style={styles.link}>Request my Spotify data</Text>
          </Pressable>
          <Pressable
            style={[styles.btnOutline, busy !== null && styles.btnDisabled]}
            onPress={() => void uploadExport()}
            disabled={busy !== null}
          >
            {busy === 'spotify-export' ? (
              <ActivityIndicator size="small" color={SynthTokens.colors.neutral900} />
            ) : (
              <Text style={styles.btnOutlineText}>Choose file</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {note ? (
        <Text style={[styles.note, note.error && styles.noteError]} accessibilityLiveRegion="polite">
          {note.text}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 12 },
  card: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: SynthTokens.radius.large,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    padding: 16,
    gap: 8,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hint: { lineHeight: 19 },
  inputRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: SynthTokens.colors.neutral900,
  },
  btnLastfm: {
    backgroundColor: LASTFM_RED,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
    minWidth: 92,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  btnDisabled: { opacity: 0.5 },
  btnOutline: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: SynthTokens.colors.neutral200,
    marginTop: 4,
  },
  btnOutlineText: { fontSize: 14, fontWeight: '700', color: SynthTokens.colors.neutral900 },
  link: { fontSize: 13, fontWeight: '600', color: SynthTokens.colors.brandPink500, paddingVertical: 2 },
  note: { fontSize: 13, lineHeight: 19, color: '#047857' },
  noteError: { color: SynthTokens.colors.neutral600 },
});
