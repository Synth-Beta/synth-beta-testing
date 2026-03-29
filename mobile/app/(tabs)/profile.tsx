import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { StyleSheet, View, ScrollView, Pressable, Text } from 'react-native';
import { Image } from 'expo-image';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { PassportService, ProfileTimelineItem, ProfileStats } from '../../src/services/passportService';
import { HomeFeedService, FriendSuggestion } from '../../src/services/homeFeedService';
import { supabase } from '../../src/integrations/supabase/client';
import { Settings, Pencil, Menu, Instagram, Music2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { FriendSuggestionsRail } from '../../src/components/Feed/FriendSuggestionsRail';
import {
  InterestedEventItem,
  MyEventsService,
  MyReviewListItem,
} from '../../src/services/myEventsService';
import { ProfilePassportPanel } from '../../src/components/profile/ProfilePassportPanel';

const PINK = SynthTokens.colors.brandPink500;

type ProfileTab = 'events' | 'interested' | 'passport';
type EventsMode = 'reviews' | 'rankings' | 'unreviewed';

export default function ProfileScreen() {
  const [profileTab, setProfileTab] = useState<ProfileTab>('passport');
  const [eventsMode, setEventsMode] = useState<EventsMode>('reviews');
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<MyReviewListItem[]>([]);
  const [unreviewed, setUnreviewed] = useState<InterestedEventItem[]>([]);
  const [interested, setInterested] = useState<InterestedEventItem[]>([]);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [timeline, setTimeline] = useState<ProfileTimelineItem[]>([]);
  const [user, setUser] = useState<{
    name?: string;
    username?: string;
    avatar_url?: string;
  } | null>(null);
  const [friendSuggestions, setFriendSuggestions] = useState<FriendSuggestion[]>([]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const loadProfile = useCallback(async () => {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) return;
    setAuthUserId(authUser.id);

    const { data: userData, error: userRowError } = await supabase
      .from('users')
      .select('name, username, avatar_url')
      .eq('user_id', authUser.id)
      .single();

    if (userRowError) {
      console.warn('[profile] users row:', userRowError.message);
    }

    const [statsData, timelineData, suggestions, interestedRows, reviewRows, unrevRows] =
      await Promise.all([
        PassportService.getProfileStats(authUser.id),
        PassportService.getTimeline(authUser.id),
        HomeFeedService.getFriendSuggestionsForRail(authUser.id, 5),
        MyEventsService.getInterestedEvents(authUser.id),
        MyEventsService.getMyReviews(authUser.id),
        MyEventsService.getUnreviewedPastAttended(authUser.id),
      ]);

    setUser(userRowError || !userData ? null : userData);
    setStats(statsData);
    setTimeline(timelineData);
    setFriendSuggestions(suggestions);
    setInterested(interestedRows);
    setReviews(reviewRows);
    setUnreviewed(unrevRows);
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

  const groupedByStar = useMemo(() => {
    const map = new Map<number, MyReviewListItem[]>();
    for (const rv of reviews) {
      const r = rv.rating != null ? Math.round(rv.rating) : 0;
      const key = Math.min(5, Math.max(1, r));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(rv);
    }
    for (const [, list] of map) {
      list.sort((a, b) => (a.rank_order ?? 999) - (b.rank_order ?? 999));
    }
    return map;
  }, [reviews]);

  const renderReviewRow = (item: MyReviewListItem) => (
    <Pressable
      style={styles.reviewCard}
      onPress={() => item.event_id && router.push(`/event/${item.event_id}`)}
    >
      <Image
        source={item.image_url ? { uri: item.image_url } : require('../../assets/placeholder-event.png')}
        style={styles.reviewThumb}
      />
      <View style={{ flex: 1 }}>
        <SynthText variant="meta" style={styles.reviewTitle} numberOfLines={1}>
          {item.artist_name || item.title}
        </SynthText>
        <SynthText variant="meta" color="secondary" numberOfLines={1}>
          {item.venue_name}
        </SynthText>
        <SynthText variant="meta" color="secondary" style={styles.reviewStar}>
          {item.rating != null ? `${item.rating.toFixed(1)}★` : ''}
        </SynthText>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
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
                <View style={styles.statCol}>
                  <Text style={styles.statNum}>{stats?.friend_count ?? 0}</Text>
                  <Text style={styles.statLbl}>Friends</Text>
                </View>
                <View style={styles.statCol}>
                  <Text style={styles.statNum}>{stats?.following_count ?? 0}</Text>
                  <Text style={styles.statLbl}>Following</Text>
                </View>
                <View style={styles.statCol}>
                  <Text style={styles.statNum}>{stats?.concert_count ?? 0}</Text>
                  <Text style={styles.statLbl}>Events</Text>
                </View>
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
            <Pressable style={styles.socialIcon}>
              <Instagram size={20} color={SynthTokens.colors.neutral900} />
            </Pressable>
            <Pressable style={styles.socialIcon}>
              <Music2 size={20} color={SynthTokens.colors.neutral900} />
            </Pressable>
          </View>
        </View>

        <View style={styles.profileTabs}>
          {(['events', 'interested', 'passport'] as const).map(t => (
            <Pressable
              key={t}
              onPress={() => setProfileTab(t)}
              style={[styles.profileTab, profileTab === t && styles.profileTabOn]}
            >
              <SynthText variant="meta" style={[styles.profileTabTxt, profileTab === t && styles.profileTabTxtOn]}>
                {t === 'events' ? 'Events' : t === 'interested' ? 'Interested' : 'Passport'}
              </SynthText>
            </Pressable>
          ))}
        </View>

        {profileTab === 'events' ? (
          <View style={styles.tabPanel}>
            <SynthText variant="body" color="secondary" style={styles.tabBlurb}>
              Same modes as web profile → Events: Reviews, Rankings, and Unreviewed.
            </SynthText>
            <View style={styles.eventsSegment}>
              {(['reviews', 'rankings', 'unreviewed'] as const).map(m => (
                <Pressable
                  key={m}
                  onPress={() => setEventsMode(m)}
                  style={[styles.segBtn, eventsMode === m && styles.segBtnOn]}
                >
                  <Text style={[styles.segTxt, eventsMode === m && styles.segTxtOn]}>
                    {m === 'reviews' ? 'Reviews' : m === 'rankings' ? 'Rankings' : 'Unreviewed'}
                  </Text>
                </Pressable>
              ))}
            </View>
            {eventsMode === 'reviews' ? (
              reviews.length === 0 ? (
                <SynthText variant="body" color="secondary">
                  No reviews yet. Attend a show and write one from the event page.
                </SynthText>
              ) : (
                reviews.map(r => <React.Fragment key={r.id}>{renderReviewRow(r)}</React.Fragment>)
              )
            ) : null}
            {eventsMode === 'rankings' ? (
              reviews.length === 0 ? (
                <SynthText variant="body" color="secondary">
                  No ranked reviews yet.
                </SynthText>
              ) : (
                Array.from(groupedByStar.entries())
                  .sort((a, b) => b[0] - a[0])
                  .map(([star, items]) => (
                    <View key={star}>
                      <SynthText variant="meta" style={styles.groupHeader}>
                        {star}★ ({items.length})
                      </SynthText>
                      {items.map(r => (
                        <React.Fragment key={r.id}>{renderReviewRow(r)}</React.Fragment>
                      ))}
                    </View>
                  ))
              )
            ) : null}
            {eventsMode === 'unreviewed' ? (
              unreviewed.length === 0 ? (
                <SynthText variant="body" color="secondary">
                  No unreviewed past shows. You are all caught up.
                </SynthText>
              ) : (
                unreviewed.slice(0, 20).map(ev => (
                  <View key={ev.event_id} style={styles.unrevRow}>
                    <Pressable
                      style={styles.unrevMain}
                      onPress={() => router.push(`/event/${ev.event_id}`)}
                    >
                      <Image
                        source={
                          ev.image_url
                            ? { uri: ev.image_url }
                            : require('../../assets/placeholder-event.png')
                        }
                        style={styles.reviewThumb}
                      />
                      <View style={{ flex: 1 }}>
                        <SynthText variant="meta" style={styles.reviewTitle} numberOfLines={1}>
                          {ev.artist_name || ev.title}
                        </SynthText>
                        <SynthText variant="meta" color="secondary" numberOfLines={1}>
                          {ev.venue_name}
                        </SynthText>
                      </View>
                    </Pressable>
                    <Pressable
                      style={styles.reviewMiniCta}
                      onPress={() => router.push(`/review-compose?eventId=${ev.event_id}`)}
                    >
                      <SynthText variant="meta" style={styles.reviewMiniCtaTxt}>
                        Review
                      </SynthText>
                    </Pressable>
                  </View>
                ))
              )
            ) : null}
            <Pressable style={styles.tabCta} onPress={() => router.push('/my-events')}>
              <SynthText variant="meta" style={styles.tabCtaTxt}>
                Open full My Events
              </SynthText>
            </Pressable>
          </View>
        ) : null}

        {profileTab === 'interested' ? (
          <View style={styles.tabPanel}>
            {interested.length === 0 ? (
              <SynthText variant="body" color="secondary" style={styles.tabBlurb}>
                No interested shows yet.
              </SynthText>
            ) : (
              interested.slice(0, 12).map(ev => (
                <Pressable
                  key={ev.event_id}
                  style={styles.interestedRow}
                  onPress={() => router.push(`/event/${ev.event_id}`)}
                >
                  <SynthText variant="meta" style={styles.interestedTitle} numberOfLines={1}>
                    {ev.artist_name || ev.title}
                  </SynthText>
                  <SynthText variant="meta" color="secondary" numberOfLines={1}>
                    {ev.venue_name}
                  </SynthText>
                </Pressable>
              ))
            )}
          </View>
        ) : null}

        {friendSuggestions.length > 0 ? (
          <View style={styles.railPad}>
            <FriendSuggestionsRail suggestions={friendSuggestions} />
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
  tabPanel: { paddingHorizontal: SynthTokens.spacing.md, marginTop: SynthTokens.spacing.md, gap: 10 },
  tabBlurb: { lineHeight: 20 },
  tabCta: {
    alignSelf: 'flex-start',
    backgroundColor: PINK,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  tabCtaTxt: { color: '#fff', fontWeight: '800' },
  eventsSegment: {
    flexDirection: 'row',
    backgroundColor: SynthTokens.colors.neutral100,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  segBtnOn: { backgroundColor: SynthTokens.colors.neutral900 },
  segTxt: { fontWeight: '700', fontSize: 12, color: SynthTokens.colors.neutral600 },
  segTxtOn: { color: SynthTokens.colors.neutral0 },
  reviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  reviewThumb: { width: 56, height: 56, borderRadius: 10 },
  reviewTitle: { fontWeight: '800' },
  reviewStar: { marginTop: 4 },
  groupHeader: { fontWeight: '800', marginTop: 12, marginBottom: 8, fontSize: 15 },
  unrevRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    padding: 10,
    borderRadius: 14,
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  unrevMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  reviewMiniCta: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: PINK,
  },
  reviewMiniCtaTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  interestedRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
  },
  interestedTitle: { fontWeight: '800' },
  passportContainer: {
    paddingHorizontal: SynthTokens.spacing.md,
    paddingBottom: SynthTokens.spacing.lg,
  },
  empty: {
    padding: SynthTokens.spacing.xl,
    alignItems: 'center',
  },
});
