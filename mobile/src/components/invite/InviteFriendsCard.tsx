import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, Share2, UserPlus, X } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { InviteService, inviteMessage } from '../../services/inviteService';
import { MyEventsService, type InterestedEventItem } from '../../services/myEventsService';

const PINK = SynthTokens.colors.brandPink500;

type PhoneContact = { id: string; name: string; phone: string };

function showLabel(e: InterestedEventItem): string {
  const artist = e.artist_name || e.title;
  return e.venue_name && !artist.includes(e.venue_name) ? `${artist} at ${e.venue_name}` : artist;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
}

/** Community card under Pick5: invite a friend, optionally to one of your upcoming shows. */
export function InviteFriendsCard({ userId }: { userId: string | null }) {
  const [shows, setShows] = useState<InterestedEventItem[]>([]);
  const [selected, setSelected] = useState<InterestedEventItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const today = new Date().toISOString().slice(0, 10);
    MyEventsService.getInterestedEvents(userId)
      .then((rows) => setShows(rows.filter((e) => e.event_date?.slice(0, 10) >= today).slice(0, 12)))
      .catch(() => setShows([]));
  }, [userId]);

  const makeMessage = async () => {
    const code = await InviteService.create(selected?.event_id ?? null);
    return inviteMessage(code, selected ? showLabel(selected) : null);
  };

  const onShareLink = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await Share.share({ message: await makeMessage() });
    } catch {
      Alert.alert('Could not create invite', 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const onTextContact = async (contact: PhoneContact) => {
    setPickerOpen(false);
    setBusy(true);
    try {
      const message = await makeMessage();
      if (await SMS.isAvailableAsync()) {
        await SMS.sendSMSAsync([contact.phone], message);
      } else {
        await Share.share({ message });
      }
    } catch {
      Alert.alert('Could not create invite', 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!userId) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Shows are better with friends</Text>
      <SynthText variant="meta" color="secondary" style={styles.sub}>
        Invite a friend. When they join with your code, you're friends on Synth right away
        {selected ? ` and they're marked interested in ${showLabel(selected)}.` : '.'}
      </SynthText>

      {shows.length > 0 ? (
        <>
          <Text style={styles.label}>Invite them to a show (optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Pressable
              onPress={() => setSelected(null)}
              style={[styles.chip, !selected && styles.chipOn]}
              accessibilityState={{ selected: !selected }}
            >
              <Text style={[styles.chipTxt, !selected && styles.chipTxtOn]}>Just the app</Text>
            </Pressable>
            {shows.map((e) => {
              const on = selected?.event_id === e.event_id;
              return (
                <Pressable
                  key={e.event_id}
                  onPress={() => setSelected(on ? null : e)}
                  style={[styles.chip, on && styles.chipOn]}
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.chipTxt, on && styles.chipTxtOn]} numberOfLines={1}>
                    {e.artist_name || e.title}
                  </Text>
                  <Text style={[styles.chipDate, on && styles.chipTxtOn]}>{shortDate(e.event_date)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          style={[styles.primary, busy && styles.dim]}
          onPress={() => setPickerOpen(true)}
          disabled={busy}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color={SynthTokens.colors.neutral0} /> : <UserPlus size={18} color={SynthTokens.colors.neutral0} />}
          <Text style={styles.primaryTxt}>Invite from Contacts</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={onShareLink} disabled={busy} accessibilityRole="button" accessibilityLabel="Share invite link">
          <Share2 size={18} color={SynthTokens.colors.neutral900} />
        </Pressable>
      </View>

      <ContactPickerModal visible={pickerOpen} onClose={() => setPickerOpen(false)} onPick={onTextContact} />
    </View>
  );
}

function ContactPickerModal({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (c: PhoneContact) => void;
}) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<'loading' | 'denied' | 'ready'>('loading');
  const [contacts, setContacts] = useState<PhoneContact[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setState('loading');
    (async () => {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        if (!cancelled) setState('denied');
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        sort: Contacts.SortTypes.FirstName,
      });
      const list: PhoneContact[] = [];
      for (const c of data) {
        const phones = c.phoneNumbers ?? [];
        const best = phones.find((p) => /mobile|iphone/i.test(p.label ?? '')) ?? phones[0];
        if (best?.number && c.name) list.push({ id: c.id ?? `${c.name}-${best.number}`, name: c.name, phone: best.number });
      }
      if (!cancelled) {
        setContacts(list);
        setState('ready');
      }
    })().catch(() => !cancelled && setState('denied'));
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? contacts.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)) : contacts;
  }, [contacts, query]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>Invite a friend</Text>
          <Pressable onPress={onClose} style={styles.close} accessibilityLabel="Close">
            <X size={22} color={SynthTokens.colors.neutral900} />
          </Pressable>
        </View>

        {state === 'loading' ? (
          <ActivityIndicator style={styles.center} color={SynthTokens.colors.neutral400} />
        ) : state === 'denied' ? (
          <View style={styles.center}>
            <SynthText variant="meta" color="secondary" style={styles.deniedTxt}>
              Synth needs access to your contacts to text an invite. Your contacts stay on your phone.
            </SynthText>
            <Pressable style={styles.primary} onPress={() => void Linking.openSettings()}>
              <Text style={styles.primaryTxt}>Open Settings</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.search}>
              <Search size={18} color={SynthTokens.colors.neutral400} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search contacts"
                placeholderTextColor={SynthTokens.colors.neutral400}
                autoCorrect={false}
              />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(c) => c.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable style={styles.row} onPress={() => onPick(item)}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarTxt}>{item.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.rowPhone}>{item.phone}</Text>
                  </View>
                  <Text style={styles.inviteTxt}>Invite</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <SynthText variant="meta" color="secondary" style={styles.deniedTxt}>
                  No contacts with a phone number.
                </SynthText>
              }
            />
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    gap: 10,
  },
  title: { fontSize: 16, fontWeight: '700', color: SynthTokens.colors.neutral900 },
  sub: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '600', color: SynthTokens.colors.neutral600, marginTop: 2 },
  chips: { gap: 8, paddingVertical: 2 },
  chip: {
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 180,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  chipOn: { borderColor: SynthTokens.colors.neutral900, backgroundColor: SynthTokens.colors.neutral900 },
  chipTxt: { fontSize: 14, fontWeight: '600', color: SynthTokens.colors.neutral900 },
  chipDate: { fontSize: 12, color: SynthTokens.colors.neutral600, marginTop: 2 },
  chipTxtOn: { color: SynthTokens.colors.neutral0 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  primary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: PINK,
    paddingHorizontal: 16,
  },
  primaryTxt: { color: SynthTokens.colors.neutral0, fontSize: 16, fontWeight: '700' },
  secondary: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.6 },
  sheet: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: SynthTokens.colors.neutral900 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'stretch', justifyContent: 'center', padding: 24, gap: 16 },
  deniedTxt: { textAlign: 'center', fontSize: 15, lineHeight: 21, paddingVertical: 24 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  searchInput: { flex: 1, fontSize: 16, color: SynthTokens.colors.neutral900 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 60 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: SynthTokens.colors.neutral100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { fontSize: 16, fontWeight: '700', color: SynthTokens.colors.neutral600 },
  rowText: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: '600', color: SynthTokens.colors.neutral900 },
  rowPhone: { fontSize: 13, color: SynthTokens.colors.neutral600 },
  inviteTxt: { fontSize: 15, fontWeight: '700', color: SynthTokens.colors.neutral900 },
});
