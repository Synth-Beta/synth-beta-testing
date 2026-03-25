import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, ScrollView, Pressable, Text } from 'react-native';
import { Image } from 'expo-image';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { PassportService, ProfileTimelineItem, ProfileStats } from '../../src/services/passportService';
import { HomeFeedService, FriendSuggestion } from '../../src/services/homeFeedService';
import { supabase } from '../../src/integrations/supabase/client';
import { Settings, Pencil, Ticket, Menu, Instagram, Music2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { FriendSuggestionsRail } from '../../src/components/Feed/FriendSuggestionsRail';

const PINK = SynthTokens.colors.brandPink500;

export default function ProfileScreen() {
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

    const { data: userData, error: userRowError } = await supabase
      .from('users')
      .select('name, username, avatar_url')
      .eq('user_id', authUser.id)
      .single();

    if (userRowError) {
      console.warn('[profile] users row:', userRowError.message);
    }

    const [statsData, timelineData, suggestions] = await Promise.all([
      PassportService.getProfileStats(authUser.id),
      PassportService.getTimeline(authUser.id),
      HomeFeedService.getFriendSuggestionsForRail(authUser.id, 5),
    ]);

    setUser(userRowError || !userData ? null : userData);
    setStats(statsData);
    setTimeline(timelineData);
    setFriendSuggestions(suggestions);
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

  const renderTimelineItem = (item: ProfileTimelineItem, index: number) => {
    const date = new Date(item.date).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });

    return (
      <View key={item.id} style={styles.timelineItem}>
        <View style={styles.timelineLeft}>
          <SynthText variant="meta" color="secondary" style={styles.timelineDate}>
            {date}
          </SynthText>
          <View style={[styles.timelineDot, index === 0 && styles.activeDot]} />
          {index !== timeline.length - 1 && <View style={styles.timelineLine} />}
        </View>
        <Pressable style={styles.timelineCard}>
          <View style={styles.cardContent}>
            <SynthText variant="meta" style={styles.bold}>
              {item.title}
            </SynthText>
            <SynthText variant="meta" color="secondary">
              {item.subtitle}
            </SynthText>
          </View>
          {item.image_url && <Image source={{ uri: item.image_url }} style={styles.cardImage} />}
        </Pressable>
      </View>
    );
  };

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

        {friendSuggestions.length > 0 ? (
          <View style={styles.railPad}>
            <FriendSuggestionsRail suggestions={friendSuggestions} />
          </View>
        ) : null}

        <View style={styles.passportContainer}>
          <View style={styles.sectionHeader}>
            <Ticket size={20} color={PINK} />
            <SynthText variant="h2" style={styles.sectionTitle}>
              Concert Passport
            </SynthText>
          </View>

          <View style={styles.timeline}>
            {timeline.length > 0 ? (
              timeline.map((item, index) => renderTimelineItem(item, index))
            ) : (
              <View style={styles.empty}>
                <SynthText variant="body" color="secondary">
                  Your concert history will appear here.
                </SynthText>
              </View>
            )}
          </View>
        </View>
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
  passportContainer: {
    padding: SynthTokens.spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SynthTokens.spacing.sm,
    marginBottom: SynthTokens.spacing.xl,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  timeline: {
    paddingLeft: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: SynthTokens.spacing.lg,
  },
  timelineLeft: {
    alignItems: 'center',
    width: 60,
  },
  timelineDate: {
    fontSize: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: SynthTokens.colors.neutral200,
    zIndex: 1,
  },
  activeDot: {
    backgroundColor: PINK,
  },
  timelineLine: {
    position: 'absolute',
    top: 32,
    bottom: -32,
    width: 2,
    backgroundColor: SynthTokens.colors.neutral200,
  },
  timelineCard: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: SynthTokens.colors.neutral50,
    borderRadius: SynthTokens.radius.medium,
    marginLeft: SynthTokens.spacing.md,
    padding: SynthTokens.spacing.sm,
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    paddingRight: 8,
  },
  cardImage: {
    width: 50,
    height: 50,
    borderRadius: SynthTokens.radius.small,
  },
  bold: {
    fontWeight: 'bold',
  },
  empty: {
    padding: SynthTokens.spacing.xl,
    alignItems: 'center',
  },
});
