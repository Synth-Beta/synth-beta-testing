import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { PassportService, PassportEntry, ProfileStats } from '../../src/services/passportService';
import { supabase } from '../../src/integrations/supabase/client';
import { Settings, Ticket, MapPin, Users, Star } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [timeline, setTimeline] = useState<PassportEntry[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', authUser.id)
      .single();

    const [statsData, timelineData] = await Promise.all([
      PassportService.getProfileStats(authUser.id),
      PassportService.getTimeline(authUser.id)
    ]);

    setUser(userData);
    setStats(statsData);
    setTimeline(timelineData);
    setLoading(false);
  };

  const renderTimelineItem = (item: PassportEntry, index: number) => {
    const date = new Date(item.date).toLocaleDateString('en-US', {
      month: 'short', year: 'numeric'
    });

    return (
      <View key={item.id} style={styles.timelineItem}>
        <View style={styles.timelineLeft}>
          <SynthText variant="meta" color="secondary" style={styles.timelineDate}>{date}</SynthText>
          <View style={[styles.timelineDot, index === 0 && styles.activeDot]} />
          {index !== timeline.length - 1 && <View style={styles.timelineLine} />}
        </View>
        <Pressable style={styles.timelineCard}>
          <View style={styles.cardContent}>
            <SynthText variant="meta" style={styles.bold}>{item.title}</SynthText>
            <SynthText variant="meta" color="secondary">{item.subtitle}</SynthText>
          </View>
          {item.image_url && (
            <Image source={{ uri: item.image_url }} style={styles.cardImage} />
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.topRow}>
            <Image
              source={user?.avatar_url ? { uri: user.avatar_url } : require('../../assets/placeholder-user.png')}
              style={styles.avatar}
            />
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <SynthText variant="h2">{stats?.concert_count || 0}</SynthText>
                <SynthText variant="meta" color="secondary">Shows</SynthText>
              </View>
              <View style={styles.stat}>
                <SynthText variant="h2">{stats?.friend_count || 0}</SynthText>
                <SynthText variant="meta" color="secondary">Friends</SynthText>
              </View>
            </View>
            <Pressable style={styles.settingsButton}>
              <Settings size={22} color={SynthTokens.colors.neutral900} />
            </Pressable>
          </View>

          <View style={styles.bioSection}>
            <SynthText variant="h2">{user?.name || 'Your Profile'}</SynthText>
            <SynthText variant="meta" color="secondary">@{user?.name?.toLowerCase().replace(' ', '') || 'username'}</SynthText>
          </View>
        </View>

        {/* Passport Section */}
        <View style={styles.passportContainer}>
          <View style={styles.sectionHeader}>
            <Ticket size={20} color={SynthTokens.colors.brandPink500} />
            <SynthText variant="h2" style={styles.sectionTitle}>Concert Passport</SynthText>
          </View>

          <View style={styles.timeline}>
            {timeline.length > 0 ? (
              timeline.map((item, index) => renderTimelineItem(item, index))
            ) : (
              <View style={styles.empty}>
                <SynthText variant="body" color="secondary">Your concert history will appear here.</SynthText>
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
    backgroundColor: SynthTokens.colors.neutral50,
  },
  header: {
    paddingHorizontal: SynthTokens.spacing.md,
    backgroundColor: SynthTokens.colors.neutral0,
    borderBottomWidth: 1,
    borderBottomColor: SynthTokens.colors.neutral200,
    paddingBottom: SynthTokens.spacing.xl,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: SynthTokens.colors.neutral100,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SynthTokens.spacing.xl,
  },
  stat: {
    alignItems: 'center',
  },
  settingsButton: {
    padding: 8,
  },
  bioSection: {
    marginTop: SynthTokens.spacing.md,
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
    backgroundColor: SynthTokens.colors.brandPink500,
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
    backgroundColor: SynthTokens.colors.neutral100,
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
  }
});
