import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, MessageCircle, UserPlus, UserCheck, UserX } from 'lucide-react-native';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';
import { ChatService } from '../../src/services/chatService';
import { Image as ExpoImage } from 'expo-image';
import { EventCard } from '../../src/components/Feed/EventCard';
import { ProfilePassportPanel } from '../../src/components/profile/ProfilePassportPanel';
import { ProfileMyEventsPanel } from '../../src/components/profile/ProfileMyEventsPanel';
import { ProfileScreenSkeleton } from '../../src/components/skeletons/ProfileScreenSkeleton';
import { MyEventsService, type InterestedEventItem } from '../../src/services/myEventsService';
import { PassportService, type ProfileTimelineItem, type ProfileStats } from '../../src/services/passportService';
import { EventService } from '../../src/services/eventService';
import { createFriendRequest } from '@synth/shared';

type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends';

export default function PublicUserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'events' | 'interested' | 'passport'>('events');
  const [selfId, setSelfId] = useState<string | null>(null);
  const [profile, setProfile] = useState<{
    name: string | null;
    username: string | null;
    avatar_url: string | null;
    bio: string | null;
    is_public_profile: boolean;
  } | null>(null);
  const [interestedEvents, setInterestedEvents] = useState<InterestedEventItem[]>([]);
  const [timeline, setTimeline] = useState<ProfileTimelineItem[]>([]);
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none');
  const [friendLoading, setFriendLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setProfileStats(null);
      setFriendStatus('none');
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      setSelfId(user?.id ?? null);
      const { data } = await supabase
        .from('users')
        .select('name, username, avatar_url, bio, is_public_profile')
        .eq('user_id', id)
        .maybeSingle();
      if (data) {
        setProfile({
          name: (data as any).name ?? null,
          username: (data as any).username ?? null,
          avatar_url: (data as any).avatar_url ?? null,
          bio: (data as any).bio ?? null,
          is_public_profile: Boolean((data as any).is_public_profile),
        });
      } else {
        setProfile(null);
      }

      try {
        const items = await MyEventsService.getInterestedEvents(id);
        setInterestedEvents(items);
      } catch (interestedError) {
        console.warn('[publicProfile] interested', interestedError);
        setInterestedEvents([]);
      }

      const t = await PassportService.getTimeline(id);
      setTimeline(t);

      try {
        const stats = await PassportService.getProfileStats(id);
        setProfileStats(stats);
      } catch (statsError: any) {
        console.warn('[publicProfile] stats', statsError?.message || statsError);
        setProfileStats(null);
      }

      // Friendship status (only relevant when viewing someone else's profile)
      if (user?.id && user.id !== id) {
        const { data: relRows } = await supabase
          .from('user_relationships')
          .select('id, user_id, related_user_id, status')
          .in('status', ['pending', 'accepted'])
          .eq('relationship_type', 'friend')
          .or(
            `and(user_id.eq.${user.id},related_user_id.eq.${id}),and(user_id.eq.${id},related_user_id.eq.${user.id})`
          )
          .limit(1);
        if (relRows && relRows.length > 0) {
          const rel = relRows[0] as { user_id: string; related_user_id: string; status: string };
          if (rel.status === 'accepted') {
            setFriendStatus('friends');
          } else if (rel.status === 'pending') {
            setFriendStatus(rel.user_id === user.id ? 'pending_sent' : 'pending_received');
          } else {
            setFriendStatus('none');
          }
        } else {
          setFriendStatus('none');
        }
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

  const handleFriendAction = useCallback(async () => {
    if (!id || !selfId || id === selfId) return;
    if (friendStatus === 'friends' || friendStatus === 'pending_sent') return;
    setFriendLoading(true);
    try {
    if (friendStatus === 'pending_received') {
      // Accept the incoming request (match uses user_id/related_user_id)
      const { error } = await supabase
        .from('user_relationships')
        .update({ status: 'accepted' })
        .eq('user_id', id)
        .eq('related_user_id', selfId)
        .eq('relationship_type', 'friend');
      if (!error) {
        setFriendStatus('friends');
        try {
          const updatedStats = await PassportService.getProfileStats(id);
          setProfileStats(updatedStats);
        } catch {
          // ignore secondary error
        }
      }
    } else {
      // Send a new friend request
      const result = await createFriendRequest(supabase as any, id);
      if (result.ok) setFriendStatus('pending_sent');
    }
    } catch (e) {
      console.warn('[publicProfile] friend action', e);
    } finally {
      setFriendLoading(false);
    }
  }, [id, selfId, friendStatus]);

  const isOwnProfile = !!selfId && !!id && id === selfId;
  // Matches web ProfileView `canViewInterested` and the rule
  // UserEventService.getUserInterestedEvents enforces: self, friends, or a public
  // profile. A PRIVATE profile stays hidden from non-friends.
  const canViewInterested =
    isOwnProfile || friendStatus === 'friends' || profile?.is_public_profile === true;

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
          <ProfileScreenSkeleton />
        ) : !profile ? (
          <View style={styles.centered}>
            <SynthText variant="body" color="secondary">
              User not found.
            </SynthText>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <View style={styles.profileCard}>
              <View style={styles.cardTop}>
                <ExpoImage
                  source={
                    profile.avatar_url
                      ? { uri: profile.avatar_url }
                      : require('../../assets/placeholder-user.png')
                  }
                  style={styles.avatar}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <SynthText variant="h2" numberOfLines={2}>
                    {profile.name || 'Synth fan'}
                  </SynthText>
                  {profile.username ? (
                    <SynthText variant="meta" color="secondary" numberOfLines={1}>
                      @{profile.username}
                    </SynthText>
                  ) : null}
                  {profile.bio ? (
                    <SynthText variant="body" style={styles.bio} numberOfLines={3}>
                      {profile.bio}
                    </SynthText>
                  ) : null}
              {profileStats ? (
                <View style={styles.statsRow}>
                  <View style={styles.statCol}>
                    <SynthText variant="h2" style={styles.statNum}>
                      {profileStats.friend_count}
                    </SynthText>
                    <SynthText variant="meta" style={styles.statLabel}>
                      Friends
                    </SynthText>
                  </View>
                  <View style={styles.statCol}>
                    <SynthText variant="h2" style={styles.statNum}>
                      {profileStats.following_count}
                    </SynthText>
                    <SynthText variant="meta" style={styles.statLabel}>
                      Following
                    </SynthText>
                  </View>
                  <View style={styles.statCol}>
                    <SynthText variant="h2" style={styles.statNum}>
                      {profileStats.reviewed_events_count}
                    </SynthText>
                    <SynthText variant="meta" style={styles.statLabel}>
                      Events
                    </SynthText>
                  </View>
                </View>
              ) : null}
                </View>
              </View>
              {id && selfId && id !== selfId ? (
                <Pressable
                  onPress={() => void handleFriendAction()}
                  disabled={friendLoading || friendStatus === 'friends' || friendStatus === 'pending_sent'}
                  style={[
                    styles.friendBtn,
                    friendStatus === 'friends' && styles.friendBtnDone,
                    friendStatus === 'pending_sent' && styles.friendBtnPending,
                    friendStatus === 'pending_received' && styles.friendBtnReceived,
                  ]}
                  accessibilityLabel={
                    friendStatus === 'friends' ? 'Friends' :
                    friendStatus === 'pending_sent' ? 'Request sent' :
                    friendStatus === 'pending_received' ? 'Accept friend request' :
                    'Add friend'
                  }
                >
                  {friendLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : friendStatus === 'friends' ? (
                    <><UserCheck size={16} color="#fff" /><SynthText variant="meta" style={styles.friendBtnTxt}>Friends</SynthText></>
                  ) : friendStatus === 'pending_sent' ? (
                    <><UserX size={16} color="#CC2486" /><SynthText variant="meta" style={styles.friendBtnTxtPink}>Request sent</SynthText></>
                  ) : friendStatus === 'pending_received' ? (
                    <><UserCheck size={16} color="#fff" /><SynthText variant="meta" style={styles.friendBtnTxt}>Accept request</SynthText></>
                  ) : (
                    <><UserPlus size={16} color="#fff" /><SynthText variant="meta" style={styles.friendBtnTxt}>Add friend</SynthText></>
                  )}
                </Pressable>
              ) : null}
            </View>

            <View style={styles.tabs}>
              {(['events', ...(canViewInterested ? (['interested'] as const) : []), 'passport'] as const).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTab(t)}
                  style={[styles.tab, tab === t && styles.tabOn]}
                >
                  <SynthText variant="meta" style={[styles.tabTxt, tab === t && styles.tabTxtOn]}>
                    {t === 'events' ? 'Events' : t === 'interested' ? 'Interested' : 'Passport'}
                  </SynthText>
                </Pressable>
              ))}
            </View>

            {tab === 'events' ? (
              <View style={styles.panel}>
                <ProfileMyEventsPanel
                  userId={String(id)}
                  isOwnProfile={isOwnProfile}
                  variant="embedded"
                  hideTitleBlock
                  showDraftsBanner={false}
                />
              </View>
            ) : null}

            {tab === 'interested' && canViewInterested ? (
              <View style={styles.panel}>
                {interestedEvents.length === 0 ? (
                  <SynthText variant="body" color="secondary">
                    No interested events yet.
                  </SynthText>
                ) : (
                  interestedEvents.map((ev) => {
                    return (
                      <EventCard
                        key={ev.event_id}
                        id={ev.event_id}
                        title={ev.title}
                        artist_name={ev.artist_name}
                        venue_name={ev.venue_name}
                        venue_city={ev.venue_city}
                        event_date={ev.event_date}
                        image_url={ev.image_url}
                        initialInterested
                        cornerLabel={ev.relationship_type === 'going' ? 'Going' : undefined}
                        ticket_url={ev.ticket_url}
                        currentUserId={selfId}
                        onPress={() => {
                          void EventService.toEventRouteId(ev.event_id).then(rid => {
                            router.push(`/event/${rid}` as any);
                          });
                        }}
                      />
                    );
                  })
                )}
              </View>
            ) : null}

            {tab === 'passport' && id ? (
              <View style={styles.panel}>
                <ProfilePassportPanel userId={String(id)} timeline={timeline} displayName={profile.name || 'Profile'} />
              </View>
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
  scroll: { padding: SynthTokens.spacing.md, paddingBottom: 100, gap: SynthTokens.spacing.md },
  profileCard: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 18,
    padding: SynthTokens.spacing.lg,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: SynthTokens.colors.neutral200 },
  bio: { marginTop: 8, lineHeight: 20 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: SynthTokens.colors.neutral100,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  tabOn: { backgroundColor: SynthTokens.colors.neutral0, borderWidth: 1, borderColor: SynthTokens.colors.neutral200 },
  tabTxt: { fontWeight: '700', color: SynthTokens.colors.neutral600, fontSize: 13 },
  tabTxtOn: { color: SynthTokens.colors.neutral900 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SynthTokens.spacing.md,
  },
  statCol: {
    alignItems: 'center',
    flex: 1,
  },
  statNum: {
    fontSize: 22,
    fontWeight: '800',
    color: SynthTokens.colors.neutral900,
  },
  statLabel: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: SynthTokens.colors.neutral600,
  },
  panel: { gap: 10 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  friendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#CC2486',
  },
  friendBtnDone: { backgroundColor: '#6B7280' },
  friendBtnPending: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#CC2486' },
  friendBtnReceived: { backgroundColor: '#16A34A' },
  friendBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  friendBtnTxtPink: { color: '#CC2486', fontWeight: '700', fontSize: 13 },
});
