import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
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
import { SafeImage } from '../../src/components/SafeImage';
import { InterestedEventItem, MyEventsService } from '../../src/services/myEventsService';
import { EventCard } from '../../src/components/Feed/EventCard';
import { ProfilePassportPanel } from '../../src/components/profile/ProfilePassportPanel';
import {
  ProfileMyEventsPanel,
  type ProfileMyEventsPanelHandle,
} from '../../src/components/profile/ProfileMyEventsPanel';
import { bottomSafeContentPadding } from '../../src/components/navigation/SynthTabBar';
import {
  getStreamingLinkStatus,
  type StreamingLinkStatus,
} from '../../src/services/streamingConnectionService';
import { filterInterestedRowsForSegment } from '../../src/utils/eventStatusUtils';

const PINK = SynthTokens.colors.brandPink500;

type ProfileTab = 'reviews' | 'interested' | 'passport';

export default function ProfileScreen() {
  const [profileTab, setProfileTab] = useState<ProfileTab>('reviews');
  const [loading, setLoading] = useState(true);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [interested, setInterested] = useState<InterestedEventItem[]>([]);
  const [interestedLoading, setInterestedLoading] = useState(false);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [timeline, setTimeline] = useState<ProfileTimelineItem[]>([]);
  const [user, setUser] = useState<{
    name?: string;
    username?: string;
    avatar_url?: string;
    instagram_handle?: string | null;
    bio?: string | null;
  } | null>(null);
  const [streaming, setStreaming] = useState<StreamingLinkStatus>({
    linked: false,
    provider: 'unknown',
    profileUrl: null,
  });
  const [friendSuggestions, setFriendSuggestions] = useState<FriendSuggestion[]>([]);
  const [listRefreshing, setListRefreshing] = useState(false);
  const eventsPanelRef = useRef<ProfileMyEventsPanelHandle>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const interestedLoadedRef = useRef(false);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const loadInterested = useCallback(async (userId: string) => {
    interestedLoadedRef.current = true; // lock at entry — prevents concurrent/double loads
    setInterestedLoading(true);
    try {
      const rows = await MyEventsService.getInterestedEvents(userId);
      setInterested(rows);
    } catch (e) {
      console.warn('[profile] getInterestedEvents', e);
      interestedLoadedRef.current = false; // allow retry on next focus
    } finally {
      setInterestedLoading(false);
    }
  }, []);

  const loadDeferred = useCallback(async (userId: string) => {
    try {
      const [timelineData, suggestions, streamingStatus] = await Promise.all([
        PassportService.getTimeline(userId),
        HomeFeedService.getFriendSuggestionsForRail(userId, 5),
        getStreamingLinkStatus(userId),
      ]);
      setTimeline(timelineData);
      setFriendSuggestions(suggestions);
      setStreaming(streamingStatus);
    } catch (e) {
      console.warn('[profile] deferred load', e);
    }
  }, []);

  const loadProfile = useCallback(async (opts?: { silent?: boolean }): Promise<string | null> => {
    const silent = opts?.silent === true && hasLoadedOnceRef.current;
    if (!silent) setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authUser = session?.user ?? null;
      if (!authUser) {
        setAuthUserId(null);
        return null;
      }
      setAuthUserId(authUser.id);

      const [userResult, statsData] = await Promise.all([
        supabase
          .from('users')
          .select('name, username, avatar_url, instagram_handle, bio')
          .eq('user_id', authUser.id)
          .single(),
        PassportService.getProfileStats(authUser.id),
      ]);

      const { data: userData, error: userRowError } = userResult;
      if (userRowError) {
        console.warn('[profile] users row:', userRowError.message);
      }

      setUser(userRowError || !userData ? null : userData);
      setStats(statsData);
      hasLoadedOnceRef.current = true;
      setHasLoadedOnce(true);

      void loadDeferred(authUser.id);
      return authUser.id;
    } catch (e) {
      console.warn('[profile] loadProfile', e);
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadDeferred]);

  useFocusEffect(
    useCallback(() => {
      interestedLoadedRef.current = false; // always re-fetch on focus
      void (async () => {
        const freshUserId = await loadProfile({ silent: true });
        if (freshUserId) {
          void loadInterested(freshUserId);
        }
      })();
    }, [loadProfile, loadInterested])
  );

  useEffect(() => {
    if (!authUserId || profileTab !== 'interested') return;
    if (interestedLoadedRef.current) return;
    void loadInterested(authUserId);
  }, [authUserId, profileTab, loadInterested]);

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

  const instagramIconColor = user?.instagram_handle?.trim()
    ? SynthTokens.colors.brandInstagram
    : SynthTokens.colors.neutral400;
  const spotifyIconColor =
    streaming.provider === 'spotify'
      ? SynthTokens.colors.brandSpotify
      : SynthTokens.colors.neutral400;
  const appleMusicIconColor =
    streaming.provider === 'apple-music'
      ? SynthTokens.colors.brandAppleMusic
      : SynthTokens.colors.neutral400;

  const onEventsRefresh = useCallback(async () => {
    setListRefreshing(true);
    try {
      interestedLoadedRef.current = false;
      const freshUserId = await loadProfile({ silent: true });
      if (freshUserId) {
        await loadInterested(freshUserId);
      }
      await eventsPanelRef.current?.reload();
    } finally {
      setListRefreshing(false);
    }
  }, [loadProfile, loadInterested]);

  const upcomingInterested = useMemo(
    () => filterInterestedRowsForSegment(interested, true),
    [interested]
  );

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
          <SafeImage
            uri={user?.avatar_url}
            style={styles.avatar}
            placeholderSource={require('../../assets/placeholder-user.png')}
          />
          <View style={styles.cardInfo}>
            <SynthText variant="h2" style={styles.displayName}>
              {displayName}
            </SynthText>
            <SynthText variant="meta" color="secondary" style={styles.handleInCard}>
              {handle}
            </SynthText>
            {user?.bio ? (
              <SynthText variant="body" style={styles.bioSection} numberOfLines={3}>
                {user.bio}
              </SynthText>
            ) : null}
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
              color={instagramIconColor}
            />
          </Pressable>
          <Pressable style={styles.socialIcon} onPress={() => void openStreaming()}>
            {streaming.provider === 'spotify' ? (
              <FontAwesome5 name="spotify" size={20} color={spotifyIconColor} />
            ) : streaming.provider === 'apple-music' ? (
              <FontAwesome5 name="apple" size={20} color={appleMusicIconColor} />
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

  if (loading && !hasLoadedOnce) return <ProfileScreenSkeleton />;

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
                dataEnabled={!loading}
              />
            </View>
          )}
          refreshControl={
            <RefreshControl refreshing={listRefreshing} onRefresh={onEventsRefresh} tintColor={PINK} />
          }
          contentContainerStyle={{ paddingBottom: bottomSafeContentPadding(insets.bottom) }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomSafeContentPadding(insets.bottom) }}
      >
        {listHeaderAboveTabs}

        {profileTab === 'interested' ? (
          <View style={styles.tabPanel}>
            {interestedLoading && interested.length === 0 ? (
              <SynthText variant="body" color="secondary" style={styles.tabBlurb}>
                Loading interested events…
              </SynthText>
            ) : null}
            {!interestedLoading && interested.length === 0 ? (
              <SynthText variant="body" color="secondary" style={styles.tabBlurb}>
                No interested events yet. Tap Interested on shows to save them here.
              </SynthText>
            ) : !interestedLoading && upcomingInterested.length === 0 ? (
              <>
                <SynthText variant="body" style={[styles.tabBlurb, { fontWeight: '700', color: SynthTokens.colors.neutral900 }]}>
                  No upcoming events
                </SynthText>
                <SynthText variant="body" color="secondary" style={styles.tabBlurb}>
                  You don’t have any upcoming shows marked as Interested.
                </SynthText>
              </>
            ) : (
              upcomingInterested.map(ev => (
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
                  cornerLabel={ev.relationship_type === 'going' ? 'Going' : undefined}
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
  bioSection: {
    marginTop: 6,
    lineHeight: 20,
    color: SynthTokens.colors.neutral900,
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
  passportContainer: {
    paddingHorizontal: SynthTokens.spacing.md,
    paddingBottom: SynthTokens.spacing.lg,
  },
});
