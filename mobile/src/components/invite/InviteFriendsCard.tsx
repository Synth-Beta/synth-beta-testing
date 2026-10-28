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
import { ChevronLeft, Search, Share2, UserPlus, X } from 'lucide-react-native';
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

/**
 * Community header button: opens a slide-up sheet to invite a friend, optionally to one
 * of your upcoming shows, by text (contacts) or a share link.
 */
export function InviteFriendsButton({ userId }: { userId: string | null }) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'options' | 'contacts'>('options');
  const [shows, setShows] = useState<InterestedEventItem[]>([]);
  const [selected, setSelected] = useState<InterestedEventItem | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const today = new Date().toISOString().slice(0, 10);
    MyEventsService.getInterestedEvents(userId)
      .then((rows) => setShows(rows.filter((e) => e.event_date?.slice(0, 10) >= today).slice(0, 12)))
      .catch(() => setShows([]));
  }, [userId]);

  const close = () => {
    setOpen(false);
    setStep('options');
  };

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
    close();
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
    <>
      <Pressable
        style={[styles.pill, busy && styles.dim]}
        onPress={() => setOpen(true)}
        disabled={busy}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator size="small" color={SynthTokens.colors.neutral0} />
        ) : (
          <UserPlus size={18} color={SynthTokens.colors.neutral0} />
        )}
        <Text style={styles.pillTxt}>Invite friends</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.sheetHead}>
            {step === 'contacts' ? (
              <Pressable onPress={() => setStep('options')} style={styles.close} accessibilityLabel="Back">
                <ChevronLeft size={24} color={SynthTokens.colors.neutral900} />
              </Pressable>
            ) : (
              <View style={styles.close} />
            )}
            <Text style={styles.sheetTitle}>{step === 'contacts' ? 'Your contacts' : 'Invite a friend'}</Text>
            <Pressable onPress={close} style={styles.close} accessibilityLabel="Close">
              <X size={22} color={SynthTokens.colors.neutral900} />
            </Pressable>
          </View>

          {step === 'contacts' ? (
            <ContactList onPick={onTextContact} />
          ) : (
            <ScrollView contentContainerStyle={styles.sheetBody}>
              <Text style={styles.title}>Shows are better with friends</Text>
              <SynthText variant="meta" color="secondary" style={styles.sub}>
                When they join with your invite, you're friends on Synth right away
                {selected ? ` and they're marked interested in ${showLabel(selected)}.` : '.'}
              </SynthText>

              <Text style={styles.label}>Invite them to</Text>
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

              <Pressable style={styles.primary} onPress={() => setStep('contacts')} accessibilityRole="button">
                <UserPlus size={18} color={SynthTokens.colors.neutral0} />
                <Text style={styles.primaryTxt}>Invite from Contacts</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryWide}
                onPress={() => {
                  close();
                  void onShareLink();
                }}
                accessibilityRole="button"
              >
                <Share2 size={18} color={SynthTokens.colors.neutral900} />
                <Text style={styles.secondaryTxt}>Share invite link</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </Modal>
    </>
  );
}

/** Phone contacts with a number, searchable. Shown inside the invite sheet. */
function ContactList({ onPick }: { onPick: (c: PhoneContact) => void }) {
  const [state, setState] = useState<'loading' | 'denied' | 'ready'>('loading');
  const [contacts, setContacts] = useState<PhoneContact[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
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
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? contacts.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)) : contacts;
  }, [contacts, query]);

  if (state === 'loading') {
    return <ActivityIndicator style={styles.center} color={SynthTokens.colors.neutral400} />;
  }
  if (state === 'denied') {
    return (
      <View style={styles.center}>
        <SynthText variant="meta" color="secondary" style={styles.deniedTxt}>
          Synth needs access to your contacts to text an invite. Your contacts stay on your phone.
        </SynthText>
        <Pressable style={styles.primary} onPress={() => void Linking.openSettings()}>
          <Text style={styles.primaryTxt}>Open Settings</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.flex}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: PINK,
    paddingHorizontal: 14,
  },
  pillTxt: { color: SynthTokens.colors.neutral0, fontSize: 15, fontWeight: '700' },
  flex: { flex: 1 },
  sheetBody: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: SynthTokens.colors.neutral900 },
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
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: PINK,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  primaryTxt: { color: SynthTokens.colors.neutral0, fontSize: 16, fontWeight: '700' },
  secondaryWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  secondaryTxt: { color: SynthTokens.colors.neutral900, fontSize: 16, fontWeight: '700' },
  dim: { opacity: 0.6 },
  sheet: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: SynthTokens.colors.neutral900 },
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
