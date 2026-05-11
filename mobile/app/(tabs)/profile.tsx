import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Text,
  Linking,
  Alert,
  FlatList,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { PassportService, ProfileTimelineItem, ProfileStats } from '../../src/services/passportService';
import { HomeFeedService, FriendSuggestion } from '../../src/services/homeFeedService';
import { supabase } from '../../src/integrations/supabase/client';
import { Settings, Pencil, Menu, Instagram, Music2 } from 'lucide-react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { FriendSuggestionsRail } from '../../src/components/Feed/FriendSuggestionsRail';
import { ProfileScreenSkeleton } from '../../src/components/skeletons/ProfileScreenSkeleton';
import { InterestedEventItem, MyEventsService } from '../../src/services/myEventsService';
import { EventCard } from '../../src/components/Feed/EventCard';
import { ProfilePassportPanel } from '../../src/components/profile/ProfilePassportPanel';
import {
  ProfileMyEventsPanel,
  type ProfileMyEventsPanelHandle,
} from '../../src/components/profile/ProfileMyEventsPanel';
import { tabBarBottomContentPadding } from '../../src/components/navigation/SynthTabBar';
import {
  getStreamingLinkStatus,
  type StreamingLinkStatus,
} from '../../src/services/streamingConnectionService';
import { filterInterestedRowsForSegment } from '../../src/utils/eventStatusUtils';
import { useInterested } from '../../src/contexts/InterestedContext';

const PINK = SynthTokens.colors.brandPink500;

type ProfileTab = 'reviews' | 'interested' | 'passport';

export default function ProfileScreen() {
  const [profileTab, setProfileTab] = useState<ProfileTab>('reviews');
  const [loading, setLoading] = useState(true);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [interested, setInterested] = useState<InterestedEventItem[]>([]);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [timeline, setTimeline] = useState<ProfileTimelineItem[]>([]);
  const [user, setUser] = useState<{
    name?: string;
    username?: string;
    avatar_url?: string;
    instagram_handle?: string | null;
  } | null>(null);
  const [streaming, setStreaming] = useState<StreamingLinkStatus>({
    linked: false,
    provider: 'unknown',
    profileUrl: null,
  });
  const [friendSuggestions, setFriendSuggestions] = useState<FriendSuggestion[]>([]);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [showPastInterested, setShowPastInterested] = useState(false);
  const eventsPanelRef = useRef<ProfileMyEventsPanelHandle>(null);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isInterested, loading: interestedLoading } = useInterested();

  const loadProfile = useCallback(async () => {
    setLoading(true);
    // Use getSession() (local storage) instead of getUser() (network round-trip)
    // so the profile renders immediately without waiting for JWT validation.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const authUser = session?.user ?? null;
    if (!authUser) {
      setAuthUserId(null);
      setLoading(false);
      return;
    }
    setAuthUserId(authUser.id);

    // Fire all queries in parallel — user row + stats + timeline etc simultaneously
    const [userResult, statsData, timelineData, suggestions, interestedRows, streamingStatus] =
      await Promise.all([
        supabase
          .from('users')
          .select('name, username, avatar_url, instagram_handle')
          .eq('user_id', authUser.id)
          .single(),
        PassportService.getProfileStats(authUser.id),
        PassportService.getTimeline(authUser.id),
        HomeFeedService.getFriendSuggestionsForRail(authUser.id, 5),
        MyEventsService.getInterestedEvents(authUser.id),
        getStreamingLinkStatus(authUser.id),
      ]);

    const { data: userData, error: userRowError } = userResult;
    if (userRowError) {
      console.warn('[profile] users row:', userRowError.message);
    }

    setUser(userRowError || !userData ? null : userData);
    setStats(statsData);
    setTimeline(timelineData);
    setFriendSuggestions(suggestions);
    setInterested(interestedRows);
    setStreaming(streamingStatus);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile])
  );

  const handle = user?.username ? `@${user.username}` : '@username';
  const displayName = user?.name || 'Your Profile';

  const openInstagram = useCallback(async () => {
    const raw = user?.instagram_handle?.trim();
    if (!raw) {
      Alert.alert('Instagram', 'Add your Instagram handle in Edit Profile.');
      return;
    }
    const h = raw.replace(/^@+/, '');
    if (!h) return;
    const url = `https://www.instagram.com/${encodeURIComponent(h)}/`;
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) {
        Alert.alert('Unable to open Instagram', 'Please try again later.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open Instagram', 'Please try again later.');
    }
  }, [user?.instagram_handle]);

  const openStreaming = useCallback(async () => {
    if (streaming.linked && streaming.profileUrl) {
      const url = String(streaming.profileUrl).trim();
      if (!url) {
        router.push('/stats');
        return;
      }
      const can = await Linking.canOpenURL(url);
      if (!can) {
        Alert.alert('Unable to open link', 'Please connect your streaming account again from Streaming Stats.');
        router.push('/stats');
        return;
      }
      await Linking.openURL(url);
      return;
    }

    router.push('/stats');
  }, [router, streaming.linked, streaming.profileUrl]);

  const goToFriends = useCallback(() => router.push('/profile-friends'), [router]);
  const goToFollowing = useCallback(() => router.push('/profile-following'), [router]);
  const goToEventsStat = useCallback(() => {
    setProfileTab('reviews');
  }, []);

  const onEventsRefresh = useCallback(async () => {
    setListRefreshing(true);
    try {
      await loadProfile();
      await eventsPanelRef.current?.reload();
    } finally {
      setListRefreshing(false);
    }
  }, [loadProfile]);

  const interestedForSegment = useMemo(
    () => filterInterestedRowsForSegment(
      interestedLoading ? interested : interested.filter(ev => isInterested(ev.event_id)),
      !showPastInterested
    ),
    [interested, showPastInterested, isInterested, interestedLoading]
  );

  const interestedEmptySecondary = useMemo(() => {
    if (interested.length === 0) return '';
    return showPastInterested
      ? 'You haven’t marked any past shows as Interested.'
      : 'You don’t have any upcoming shows marked as Interested.';
  }, [interested.length, showPastInterested]);

  const profileTabsRow = (
    <View style={styles.profileTabs}>
      {(['reviews', 'interested', 'passport'] as const).map(t => (
        <Pressable
          key={t}
          onPress={() => setProfileTab(t)}
          style={[styles.profileTab, profileTab === t && styles.profileTabOn]}
        >
          <SynthText variant="meta" style={[styles.profileTabTxt, profileTab === t && styles.profileTabTxtOn]}>
            {t === 'reviews' ? 'Reviews' : t === 'interested' ? 'Interested' : 'Passport'}
          </SynthText>
        </Pressable>
      ))}
    </View>
  );

  const listHeaderAboveTabs = (
    <>
      <View style={[styles.topHeader, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.handleTop} numberOfLines={1}>
          {handle}
        </Text>
        <Pressable style={styles.menuBtn} onPress={() => router.push('/app-menu')}>
          <Menu size={24} color={SynthTokens.colors.neutral900} />
        </Pressable>
      </View>
      <View style={styles.headerRule} />

      <View style={styles.profileCard}>
        <View style={styles.cardTop}>
          <Image
            source={
              user?.avatar_url
                ? { uri: user.avatar_url }
                : require('../../assets/placeholder-user.png')
            }
            style={styles.avatar}
          />
          <View style={styles.cardInfo}>
            <SynthText variant="h2" style={styles.displayName}>
              {displayName}
            </SynthText>
            <SynthText variant="meta" color="secondary" style={styles.handleInCard}>
              {handle}
            </SynthText>
            <View style={styles.statsRow}>
              <Pressable style={styles.statCol} onPress={goToFriends} accessibilityRole="button">
                <Text style={styles.statNum}>{stats?.friend_count ?? 0}</Text>
                <Text style={styles.statLbl}>Friends</Text>
              </Pressable>
              <Pressable style={styles.statCol} onPress={goToFollowing} accessibilityRole="button">
                <Text style={styles.statNum}>{stats?.following_count ?? 0}</Text>
                <Text style={styles.statLbl}>Following</Text>
              </Pressable>
              <Pressable style={styles.statCol} onPress={goToEventsStat} accessibilityRole="button">
                <Text style={styles.statNum}>{stats?.reviewed_events_count ?? 0}</Text>
                <Text style={styles.statLbl}>Events</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable style={styles.editProfile} onPress={() => router.push('/profile-edit')}>
            <Pencil size={18} color="#fff" />
            <Text style={styles.editProfileText}>Edit Profile</Text>
          </Pressable>
          <Pressable style={styles.gearBtn} onPress={() => router.push('/settings')}>
            <Settings size={22} color={SynthTokens.colors.neutral900} />
          </Pressable>
        </View>

        <View style={styles.socialRow}>
          <Pressable
            style={styles.socialIcon}
            onPress={() => void openInstagram()}
            accessibilityRole="button"
            accessibilityLabel="Open Instagram"
          >
            <Instagram
              size={20}
              color={
                user?.instagram_handle?.trim()
                  ? SynthTokens.colors.neutral900
                  : SynthTokens.colors.neutral400
              }
            />
          </Pressable>
          <Pressable style={styles.socialIcon} onPress={() => void openStreaming()}>
            {streaming.provider === 'spotify' ? (
              <FontAwesome5 name="spotify" size={20} color={SynthTokens.colors.neutral900} />
            ) : streaming.provider === 'apple-music' ? (
              <FontAwesome5 name="apple" size={20} color={SynthTokens.colors.neutral900} />
            ) : (
              <Music2 size={20} color={SynthTokens.colors.neutral900} />
            )}
          </Pressable>
        </View>
      </View>

      {friendSuggestions.length > 0 ? (
        <View style={styles.railPad}>
          <FriendSuggestionsRail suggestions={friendSuggestions} />
        </View>
      ) : null}

      {profileTabsRow}
    </>
  );

  if (loading) return <ProfileScreenSkeleton />;

  if (profileTab === 'reviews' && authUserId) {
    return (
      <View style={styles.container}>
        <FlatList
          data={[{ key: 'my-events-panel' }]}
          keyExtractor={item => item.key}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={listHeaderAboveTabs}
          renderItem={() => (
            <View style={styles.eventsPanelPad}>
              <ProfileMyEventsPanel
                ref={eventsPanelRef}
                variant="embedded"
                userId={authUserId}
                hideTitleBlock={true}
                contentBottomPadding={0}
              />
            </View>
          )}
          refreshControl={
            <RefreshControl refreshing={listRefreshing} onRefresh={onEventsRefresh} tintColor={PINK} />
          }
          contentContainerStyle={{ paddingBottom: tabBarBottomContentPadding(insets.bottom) }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarBottomContentPadding(insets.bottom) }}
      >
        {listHeaderAboveTabs}

        {profileTab === 'interested' ? (
          <View style={styles.tabPanel}>
            {interested.length > 0 ? (
              <View style={styles.segmentOuter}>
                <Pressable
                  onPress={() => setShowPastInterested(false)}
                  style={[styles.segmentBtn, !showPastInterested && styles.segmentBtnActive]}
                >
                  <Text style={[styles.segmentLabel, !showPastInterested && styles.segmentLabelActive]}>
                    Upcoming
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowPastInterested(true)}
                  style={[styles.segmentBtn, showPastInterested && styles.segmentBtnActive]}
                >
                  <Text style={[styles.segmentLabel, showPastInterested && styles.segmentLabelActive]}>Past</Text>
                </Pressable>
              </View>
            ) : null}
            {interested.length === 0 ? (
              <SynthText variant="body" color="secondary" style={styles.tabBlurb}>
                No interested events yet. Tap Interested on shows to save them here.
              </SynthText>
            ) : interestedForSegment.length === 0 ? (
              <>
                <SynthText variant="body" style={[styles.tabBlurb, { fontWeight: '700', color: SynthTokens.colors.neutral900 }]}>
                  {showPastInterested ? 'No past events' : 'No upcoming events'}
                </SynthText>
                <SynthText variant="body" color="secondary" style={styles.tabBlurb}>
                  {interestedEmptySecondary}
                </SynthText>
              </>
            ) : (
              interestedForSegment.map(ev => (
                <EventCard
                  key={ev.event_id}
                  id={ev.event_id}
                  title={ev.title}
                  artist_name={ev.artist_name}
                  venue_name={ev.venue_name}
                  event_date={ev.event_date}
                  image_url={ev.image_url}
                  venue_city={ev.venue_city}
                  ticket_url={ev.ticket_url}
                  initialInterested={true}
                  currentUserId={authUserId}
                  cornerLabel={showPastInterested ? 'Past' : undefined}
                  onPress={() => router.push(`/event/${ev.event_id}`)}
                />
              ))
            )}
          </View>
        ) : null}

        {profileTab === 'passport' && authUserId ? (
          <View style={styles.passportContainer}>
            <ProfilePassportPanel
              userId={authUserId}
              timeline={timeline}
              displayName={displayName}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SynthTokens.spacing.md,
    paddingBottom: 10,
  },
  handleTop: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  menuBtn: { padding: 8 },
  headerRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: SynthTokens.colors.neutral200,
    marginHorizontal: SynthTokens.spacing.md,
  },
  profileCard: {
    marginHorizontal: SynthTokens.spacing.md,
    marginTop: SynthTokens.spacing.md,
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 20,
    padding: SynthTokens.spacing.lg,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: SynthTokens.colors.neutral100,
  },
  cardInfo: {
    flex: 1,
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
  },
  handleInCard: {
    marginTop: 2,
    fontSize: 15,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 14,
    justifyContent: 'space-between',
    paddingRight: 8,
  },
  statCol: {
    alignItems: 'center',
    minWidth: 72,
  },
  statNum: {
    fontSize: 22,
    fontWeight: '800',
    color: SynthTokens.colors.neutral900,
  },
  statLbl: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
    color: SynthTokens.colors.neutral600,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: SynthTokens.spacing.lg,
  },
  editProfile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PINK,
    paddingVertical: 14,
    borderRadius: 14,
  },
  editProfileText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  gearBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: SynthTokens.spacing.md,
  },
  socialIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SynthTokens.colors.neutral0,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  railPad: {
    marginTop: SynthTokens.spacing.sm,
  },
  eventsPanelPad: {
    paddingHorizontal: SynthTokens.spacing.md,
    marginTop: SynthTokens.spacing.sm,
  },
  profileTabs: {
    flexDirection: 'row',
    marginHorizontal: SynthTokens.spacing.md,
    marginTop: SynthTokens.spacing.md,
    backgroundColor: SynthTokens.colors.neutral100,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  profileTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  profileTabOn: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  profileTabTxt: { fontWeight: '700', color: SynthTokens.colors.neutral600, fontSize: 13 },
  profileTabTxtOn: { color: SynthTokens.colors.neutral900 },
  tabPanel: { marginTop: SynthTokens.spacing.md },
  tabBlurb: { lineHeight: 20, paddingHorizontal: SynthTokens.spacing.md },
  segmentOuter: {
    flexDirection: 'row',
    borderRadius: 10,
    backgroundColor: SynthTokens.colors.neutral100,
    padding: 4,
    marginHorizontal: SynthTokens.spacing.screenMarginX,
    marginBottom: SynthTokens.spacing.sm,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: SynthTokens.colors.neutral0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: SynthTokens.colors.neutral600,
  },
  segmentLabelActive: {
    color: SynthTokens.colors.neutral900,
  },
  passportContainer: {
    paddingHorizontal: SynthTokens.spacing.md,
    paddingBottom: SynthTokens.spacing.lg,
  },
});
