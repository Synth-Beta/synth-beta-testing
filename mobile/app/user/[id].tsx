import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator, Alert, Text } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, MessageCircle } from 'lucide-react-native';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';
import { ChatService } from '../../src/services/chatService';
import { Image as ExpoImage } from 'expo-image';
import { EventCard } from '../../src/components/Feed/EventCard';
import { ProfilePassportPanel } from '../../src/components/profile/ProfilePassportPanel';
import { ProfileScreenSkeleton } from '../../src/components/skeletons/ProfileScreenSkeleton';
import type { MyReviewListItem } from '../../src/services/myEventsService';
import { PassportService, type ProfileTimelineItem } from '../../src/services/passportService';
import { EventService } from '../../src/services/eventService';
import { pickFeedImageUrlFromPayload, resolveFeedImageUri } from '../../src/utils/eventImages';
import { getCompliantEventLinkFromPayload } from '../../src/utils/eventTicketUrl';

export default function PublicUserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'events' | 'interested' | 'passport'>('events');
  const [eventsMode, setEventsMode] = useState<'reviews' | 'rankings'>('reviews');
  const [selfId, setSelfId] = useState<string | null>(null);
  const [profile, setProfile] = useState<{
    name: string | null;
    username: string | null;
    avatar_url: string | null;
    bio: string | null;
  } | null>(null);
  const [reviews, setReviews] = useState<MyReviewListItem[]>([]);
  const [interestedEvents, setInterestedEvents] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<ProfileTimelineItem[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user ?? null;
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

      // Public reviews (web-aligned rules): include was_there OR real review_text, and only public when viewing others.
      const { data: reviewRows, error: reviewsError } = await supabase
        .from('reviews')
        .select(
          `
          id,
          rating,
          review_text,
          was_there,
          created_at,
          event_id,
          rank_order,
          events (
            id,
            title,
            artist_name,
            venue_name,
            venue_city,
            event_date,
            images
          )
        `
        )
        .eq('user_id', id)
        .eq('is_draft', false)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(80);

      if (reviewsError) {
        console.warn('[publicProfile] reviews', reviewsError.message);
        setReviews([]);
      } else {
        const list = (reviewRows || [])
          .filter((r: any) => {
            if (r.was_there === true) return true;
            if (r.review_text && r.review_text !== 'ATTENDANCE_ONLY') return true;
            return false;
          })
          .map((r: any) => {
            const ev = r.events;
            return {
              id: r.id,
              rating: r.rating,
              review_text: r.review_text,
              was_there: r.was_there ?? null,
              created_at: r.created_at,
              event_id: r.event_id,
              rank_order: r.rank_order ?? null,
              title: ev?.title || ev?.artist_name || 'Event',
              artist_name: ev?.artist_name || '',
              venue_name: ev?.venue_name || '',
              event_date: ev?.event_date || '',
              image_url: ev?.images?.[0]?.url,
            } as MyReviewListItem;
          });
        setReviews(list);
      }

      const { data: rel, error: relErr } = await supabase
        .from('user_event_relationships')
        .select(
          `
          event_id,
          events (
            id,
            title,
            artist_name,
            venue_name,
            venue_city,
            event_date,
            images
          )
        `
        )
        .eq('user_id', id)
        .eq('relationship_type', 'interested')
        .order('created_at', { ascending: false })
        .limit(50);

      if (relErr) {
        console.warn('[publicProfile] interested', relErr.message);
        setInterestedEvents([]);
      } else {
        setInterestedEvents((rel || []).map((row: any) => row.events).filter((e: any) => e?.id));
      }

      const t = await PassportService.getTimeline(id);
      setTimeline(t);
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

  const groupedByStar = useMemo(() => {
    const map = new Map<number, MyReviewListItem[]>();
    for (const rv of reviews) {
      if (rv.rating == null) continue;
      const r = Math.round(rv.rating);
      if (!Number.isFinite(r)) continue;
      const key = Math.min(5, Math.max(1, r));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(rv);
    }
    for (const [, list] of map) {
      list.sort((a, b) => (a.rank_order ?? 999) - (b.rank_order ?? 999));
    }
    return map;
  }, [reviews]);

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
                </View>
              </View>
            </View>

            <View style={styles.tabs}>
              {(['events', 'interested', 'passport'] as const).map((t) => (
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
                <View style={styles.segment}>
                  {(['reviews', 'rankings'] as const).map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => setEventsMode(m)}
                      style={[styles.segBtn, eventsMode === m && styles.segBtnOn]}
                    >
                      <Text style={[styles.segTxt, eventsMode === m && styles.segTxtOn]}>
                        {m === 'reviews' ? 'Reviews' : 'Rankings'}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {eventsMode === 'reviews' ? (
                  reviews.length === 0 ? (
                    <SynthText variant="body" color="secondary">
                      No public reviews yet.
                    </SynthText>
                  ) : (
                    reviews.map((r) => (
                      <Pressable
                        key={r.id}
                        style={styles.reviewRow}
                        onPress={() => router.push(`/review/${r.id}`)}
                      >
                        <ExpoImage
                          source={
                            r.image_url
                              ? { uri: r.image_url }
                              : require('../../assets/Synth_Placeholder.png')
                          }
                          style={styles.reviewThumb}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <SynthText variant="meta" style={styles.reviewTitle} numberOfLines={1}>
                            {r.artist_name || r.title}
                          </SynthText>
                          <SynthText variant="meta" color="secondary" numberOfLines={1}>
                            {r.venue_name}
                          </SynthText>
                        </View>
                        <SynthText variant="meta" color="secondary">
                          {r.rating != null ? `${r.rating.toFixed(1)}★` : ''}
                        </SynthText>
                      </Pressable>
                    ))
                  )
                ) : (
                  <View style={{ gap: 14 }}>
                    {Array.from(groupedByStar.entries())
                      .sort((a, b) => b[0] - a[0])
                      .map(([star, items]) => (
                        <View key={star}>
                          <SynthText variant="meta" style={styles.groupHeader}>
                            {star}★ ({items.length})
                          </SynthText>
                          {items.map((r) => (
                            <Pressable
                              key={r.id}
                              style={styles.reviewRow}
                              onPress={() => router.push(`/review/${r.id}`)}
                            >
                              <ExpoImage
                                source={
                                  r.image_url
                                    ? { uri: r.image_url }
                                    : require('../../assets/Synth_Placeholder.png')
                                }
                                style={styles.reviewThumb}
                              />
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <SynthText variant="meta" style={styles.reviewTitle} numberOfLines={1}>
                                  {r.artist_name || r.title}
                                </SynthText>
                                <SynthText variant="meta" color="secondary" numberOfLines={1}>
                                  {r.venue_name}
                                </SynthText>
                              </View>
                              <SynthText variant="meta" color="secondary">
                                {r.rating != null ? `${r.rating.toFixed(1)}★` : ''}
                              </SynthText>
                            </Pressable>
                          ))}
                        </View>
                      ))}
                  </View>
                )}
              </View>
            ) : null}

            {tab === 'interested' ? (
              <View style={styles.panel}>
                {interestedEvents.length === 0 ? (
                  <SynthText variant="body" color="secondary">
                    No interested events yet.
                  </SynthText>
                ) : (
                  interestedEvents.map((ev: any) => {
                    const rawImg =
                      pickFeedImageUrlFromPayload(ev) ?? ev.images?.[0]?.url ?? undefined;
                    return (
                      <EventCard
                        key={ev.id}
                        id={ev.id}
                        title={ev.title}
                        artist_name={ev.artist_name}
                        venue_name={ev.venue_name}
                        venue_city={ev.venue_city}
                        event_date={ev.event_date}
                        image_url={resolveFeedImageUri(rawImg) ?? undefined}
                        initialInterested
                        ticket_url={getCompliantEventLinkFromPayload(ev) ?? undefined}
                        artist_id={ev.artist_id != null ? String(ev.artist_id) : undefined}
                        venue_id={ev.venue_id != null ? String(ev.venue_id) : undefined}
                        onPress={() => {
                          void EventService.toEventRouteId(ev.id).then(rid => {
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
  panel: { gap: 10 },
  segment: { flexDirection: 'row', backgroundColor: SynthTokens.colors.neutral100, borderRadius: 12, padding: 4, gap: 4 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  segBtnOn: { backgroundColor: SynthTokens.colors.neutral900 },
  segTxt: { fontWeight: '700', fontSize: 12, color: SynthTokens.colors.neutral600 },
  segTxtOn: { color: SynthTokens.colors.neutral0 },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  reviewThumb: { width: 56, height: 56, borderRadius: 10 },
  reviewTitle: { fontWeight: '800' },
  groupHeader: { fontWeight: '800', marginTop: 6, marginBottom: 6, fontSize: 15 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
