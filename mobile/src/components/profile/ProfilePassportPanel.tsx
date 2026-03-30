import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Text,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import {
  PassportService,
  type NextToUnlock,
  type PassportEntry,
  type ProfileTimelineItem,
} from '../../services/passportService';
import { PassportIdentityService } from '../../services/passportIdentityService';
import type { PassportIdentity } from '../../services/passportIdentityService';
import { PassportAchievementService, type AchievementDisplay } from '../../services/passportAchievementService';
import { BucketListService, type BucketListItem } from '../../services/bucketListService';
import { PassportTravelTrackerPanel } from './PassportTravelTrackerPanel';

const PINK = SynthTokens.colors.brandPink500;

type SubTab = 'identity' | 'stamps' | 'achievements' | 'timeline' | 'bucket';

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'identity', label: 'Identity' },
  { key: 'stamps', label: 'Stamps' },
  { key: 'achievements', label: 'Achievements' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'bucket', label: 'Bucket' },
];

type StampTypeFilter = 'all' | 'city' | 'venue' | 'artist' | 'scene' | 'completed_achievements';
type RarityFilter = 'all' | 'common' | 'uncommon' | 'legendary';

const RARITY_ORDER: RarityFilter[] = ['legendary', 'uncommon', 'common'];

function rarityLabel(r: string): string {
  if (r === 'legendary') return 'Legendary';
  if (r === 'uncommon') return 'Uncommon';
  if (r === 'common') return 'Common';
  return 'Other';
}

function rarityAccent(r?: string | null): string {
  if (r === 'legendary') return '#CA8A04';
  if (r === 'uncommon') return '#9333EA';
  if (r === 'common') return SynthTokens.colors.neutral600;
  return SynthTokens.colors.neutral400;
}

export function ProfilePassportPanel({
  userId,
  timeline: timelineProp,
  displayName,
}: {
  userId: string;
  timeline?: ProfileTimelineItem[];
  displayName?: string;
}) {
  const router = useRouter();
  const [subTab, setSubTab] = useState<SubTab>('identity');
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<PassportIdentity | null>(null);
  const [stamps, setStamps] = useState<PassportEntry[]>([]);
  const [nextToUnlock, setNextToUnlock] = useState<NextToUnlock[]>([]);
  const [achievements, setAchievements] = useState<AchievementDisplay[]>([]);
  const [timeline, setTimeline] = useState<ProfileTimelineItem[]>(timelineProp ?? []);
  const [bucket, setBucket] = useState<BucketListItem[]>([]);

  const [stampType, setStampType] = useState<StampTypeFilter>('all');
  const [stampRarity, setStampRarity] = useState<RarityFilter>('all');

  const loadAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      let id = await PassportIdentityService.getIdentity(userId);
      if (!id) {
        await PassportIdentityService.calculateIdentity(userId);
        id = await PassportIdentityService.getIdentity(userId);
      }
      setIdentity(id);

      const [stampList, nextHints, ach, tl, b] = await Promise.all([
        PassportService.getStampsByRarity(userId),
        PassportService.getNextToUnlock(userId),
        PassportAchievementService.getBehavioralAchievements(userId),
        timelineProp?.length ? Promise.resolve(timelineProp) : PassportService.getTimeline(userId),
        BucketListService.getBucketList(userId),
      ]);

      setStamps(stampList);
      setNextToUnlock(nextHints);
      setAchievements(ach);
      setTimeline(tl);
      setBucket(b);
    } finally {
      setLoading(false);
    }
  }, [userId, timelineProp]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (timelineProp?.length) setTimeline(timelineProp);
  }, [timelineProp]);

  const completedAchievements = useMemo(
    () => achievements.filter(a => a.unlocked),
    [achievements]
  );

  const filteredStamps = useMemo(() => {
    if (stampType === 'completed_achievements') return [];
    return stamps.filter(s => {
      if (stampType !== 'all') {
        if (stampType === 'artist' && s.type !== 'artist' && s.type !== 'artist_milestone') return false;
        if (stampType !== 'artist' && s.type !== stampType) return false;
      }
      if (stampRarity !== 'all' && s.rarity !== stampRarity) return false;
      return true;
    });
  }, [stamps, stampType, stampRarity]);

  const stampsGroupedByRarity = useMemo(() => {
    if (stampType === 'completed_achievements' || stampRarity !== 'all') return null;
    const map = new Map<string, PassportEntry[]>();
    for (const r of RARITY_ORDER) map.set(r, []);
    map.set('other', []);
    for (const s of filteredStamps) {
      const k =
        s.rarity === 'legendary' || s.rarity === 'uncommon' || s.rarity === 'common'
          ? s.rarity
          : 'other';
      map.get(k)!.push(s);
    }
    return map;
  }, [filteredStamps, stampType, stampRarity]);

  const onRemoveBucket = (item: BucketListItem) => {
    Alert.alert('Remove', `Remove ${item.entity_name} from your bucket list?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            const ok = await BucketListService.removeItem(userId, item.id);
            if (ok) setBucket(prev => prev.filter(x => x.id !== item.id));
          })(),
      },
    ]);
  };

  const fanLabel = identity ? PassportIdentityService.getFanTypeDisplay(identity.fan_type) : null;

  const renderStampCard = (s: PassportEntry) => (
    <View
      key={s.id}
      style={[styles.stampCard, { borderLeftColor: rarityAccent(s.rarity), borderLeftWidth: 4 }]}
    >
      <View style={{ flex: 1 }}>
        <SynthText variant="meta" style={styles.stampType}>
          {String(s.type).replace(/_/g, ' ')}
        </SynthText>
        <SynthText variant="body" numberOfLines={2} style={styles.stampName}>
          {s.entity_name}
        </SynthText>
        <SynthText variant="meta" color="secondary">
          {s.rarity ? `${s.rarity} · ` : ''}
          {new Date(s.unlocked_at).toLocaleDateString()}
        </SynthText>
      </View>
    </View>
  );

  const renderTimelineItem = (item: ProfileTimelineItem, index: number, len: number) => {
    const date = new Date(item.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return (
      <View key={item.id} style={styles.timelineItem}>
        <View style={styles.timelineLeft}>
          <SynthText variant="meta" color="secondary" style={styles.timelineDate}>
            {date}
          </SynthText>
          <View style={[styles.timelineDot, index === 0 && styles.activeDot]} />
          {index !== len - 1 && <View style={styles.timelineLine} />}
        </View>
        <Pressable
          style={styles.timelineCard}
          onPress={() => {
            if (item.event_id) router.push(`/event/${item.event_id}`);
          }}
        >
          <View style={styles.cardContent}>
            <SynthText variant="meta" style={styles.bold}>
              {item.title}
            </SynthText>
            <SynthText variant="meta" color="secondary">
              {item.subtitle}
            </SynthText>
          </View>
          {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.cardImage} /> : null}
        </Pressable>
      </View>
    );
  };

  const filterChip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipOn]}
    >
      <Text style={[styles.filterChipTxt, active && styles.filterChipTxtOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {SUB_TABS.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setSubTab(t.key)}
            style={[styles.chip, subTab === t.key && styles.chipOn]}
          >
            <Text style={[styles.chipTxt, subTab === t.key && styles.chipTxtOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={PINK} />
        </View>
      ) : (
        <View style={styles.panel}>
          {subTab === 'identity' ? (
            <View style={styles.card}>
              <SynthText variant="h2" style={styles.cardTitle}>
                {displayName ? `${displayName}'s passport` : 'Your passport'}
              </SynthText>
              {fanLabel ? (
                <>
                  <SynthText variant="meta" style={styles.fanName}>
                    {fanLabel.name}
                  </SynthText>
                  <SynthText variant="body" color="secondary" style={styles.fanDesc}>
                    {fanLabel.description}
                  </SynthText>
                </>
              ) : (
                <SynthText variant="body" color="secondary">
                  Identity is still calculating. Pull to refresh your profile later.
                </SynthText>
              )}
              {identity?.join_year ? (
                <SynthText variant="meta" color="secondary" style={styles.mt8}>
                  On Synth since {identity.join_year}
                </SynthText>
              ) : null}
              {identity?.home_city ? (
                <SynthText variant="meta" color="secondary">
                  Home base: {identity.home_city}
                </SynthText>
              ) : null}
              <PassportTravelTrackerPanel userId={userId} />
            </View>
          ) : null}

          {subTab === 'stamps' ? (
            <View>
              {nextToUnlock.length > 0 ? (
                <View style={styles.nextSection}>
                  <SynthText variant="meta" style={styles.sectionLabel}>
                    Next to unlock
                  </SynthText>
                  {nextToUnlock.map((h, i) => (
                    <View key={`${h.type}-${i}`} style={styles.nextCard}>
                      <SynthText variant="meta" style={styles.nextType}>
                        {h.type}
                      </SynthText>
                      <SynthText variant="body" style={styles.bold}>
                        {h.entity_name}
                      </SynthText>
                      <SynthText variant="meta" color="secondary">
                        {h.hint}
                      </SynthText>
                      {h.progress != null && h.goal != null ? (
                        <View style={styles.mt8}>
                          <View style={styles.barTrack}>
                            <View
                              style={[
                                styles.barFill,
                                { width: `${Math.min(100, (h.progress / Math.max(h.goal, 1)) * 100)}%` },
                              ]}
                            />
                          </View>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}

              <SynthText variant="meta" style={styles.sectionLabel}>
                Filters (same as web passport stamps)
              </SynthText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {filterChip('All types', stampType === 'all', () => setStampType('all'))}
                {filterChip('City', stampType === 'city', () => setStampType('city'))}
                {filterChip('Venue', stampType === 'venue', () => setStampType('venue'))}
                {filterChip('Artist', stampType === 'artist', () => setStampType('artist'))}
                {filterChip('Scene', stampType === 'scene', () => setStampType('scene'))}
                {filterChip(`Done (${completedAchievements.length})`, stampType === 'completed_achievements', () =>
                  setStampType('completed_achievements')
                )}
              </ScrollView>
              {stampType !== 'completed_achievements' ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  {filterChip('All rarities', stampRarity === 'all', () => setStampRarity('all'))}
                  {filterChip('Legendary', stampRarity === 'legendary', () => setStampRarity('legendary'))}
                  {filterChip('Uncommon', stampRarity === 'uncommon', () => setStampRarity('uncommon'))}
                  {filterChip('Common', stampRarity === 'common', () => setStampRarity('common'))}
                </ScrollView>
              ) : null}

              {stampType === 'completed_achievements' ? (
                completedAchievements.length === 0 ? (
                  <SynthText variant="body" color="secondary">
                    No completed achievements yet.
                  </SynthText>
                ) : (
                  completedAchievements.map(a => (
                    <View
                      key={a.id ?? a.type}
                      style={[styles.stampCard, { borderColor: SynthTokens.colors.neutral200 }]}
                    >
                      <SynthText variant="meta" style={styles.achBig}>
                        {a.icon}
                      </SynthText>
                      <View style={{ flex: 1 }}>
                        <SynthText variant="body" style={styles.bold}>
                          {a.name.replace(/\s+\([^)]+\)$/, '')}
                        </SynthText>
                        <SynthText variant="meta" color="secondary" numberOfLines={3}>
                          {a.description}
                        </SynthText>
                        {a.unlocked_at ? (
                          <SynthText variant="meta" color="secondary" style={styles.mt4}>
                            Unlocked {new Date(a.unlocked_at).toLocaleDateString()}
                          </SynthText>
                        ) : null}
                      </View>
                    </View>
                  ))
                )
              ) : stampsGroupedByRarity && stampRarity === 'all' ? (
                [...RARITY_ORDER, 'other'].map(rKey => {
                  const list = stampsGroupedByRarity.get(rKey) ?? [];
                  if (list.length === 0) return null;
                  return (
                    <View key={rKey} style={styles.rarityBlock}>
                      <SynthText variant="meta" style={[styles.rarityHeader, { color: rarityAccent(rKey) }]}>
                        {rarityLabel(rKey)} ({list.length})
                      </SynthText>
                      {list.map(s => renderStampCard(s))}
                    </View>
                  );
                })
              ) : filteredStamps.length === 0 ? (
                <SynthText variant="body" color="secondary">
                  No stamps match these filters.
                </SynthText>
              ) : (
                filteredStamps.map(s => renderStampCard(s))
              )}
            </View>
          ) : null}

          {subTab === 'achievements' ? (
            achievements.length === 0 ? (
              <SynthText variant="body" color="secondary">
                No achievements loaded.
              </SynthText>
            ) : (
              <View>
                {achievements.map(a => {
                  const pct = a.goal > 0 ? Math.min(100, (a.progress / a.goal) * 100) : 0;
                  return (
                    <View
                      key={a.id ?? a.type}
                      style={[styles.achCard, a.unlocked ? styles.achCardUnlocked : styles.achCardLocked]}
                    >
                      <SynthText variant="meta" style={styles.achBig}>
                        {a.icon}
                      </SynthText>
                      <View style={{ flex: 1 }}>
                        <SynthText variant="body" style={styles.achTitle}>
                          {a.name}
                        </SynthText>
                        <SynthText variant="meta" color="secondary" style={styles.achDesc}>
                          {a.description}
                        </SynthText>
                        {a.unlocked ? (
                          <View style={styles.unlockedPill}>
                            <SynthText variant="meta" style={styles.unlockedPillTxt}>
                              Unlocked{a.tier ? ` · ${a.tier}` : ''}
                            </SynthText>
                          </View>
                        ) : (
                          <View style={styles.mt8}>
                            <View style={styles.barTrack}>
                              <View style={[styles.barFill, { width: `${pct}%` }]} />
                            </View>
                            <SynthText variant="meta" color="secondary" style={styles.progressTxt}>
                              {a.progress}/{a.goal}
                            </SynthText>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )
          ) : null}

          {subTab === 'timeline' ? (
            timeline.length === 0 ? (
              <SynthText variant="body" color="secondary">
                Your concert history will appear here.
              </SynthText>
            ) : (
              <View style={styles.timeline}>
                {timeline.map((item, i) => renderTimelineItem(item, i, timeline.length))}
              </View>
            )
          ) : null}

          {subTab === 'bucket' ? (
            <View>
              <SynthText variant="meta" color="secondary" style={styles.bucketHint}>
                Add artists and venues from Search (same bucket list as web). Tap an item to remove.
              </SynthText>
              <Pressable style={styles.addBucket} onPress={() => router.push('/(tabs)/search')}>
                <SynthText variant="meta" style={styles.addBucketTxt}>
                  Open Search to find artists & venues
                </SynthText>
              </Pressable>
              {bucket.length === 0 ? (
                <SynthText variant="body" color="secondary" style={styles.mt8}>
                  Bucket list is empty.
                </SynthText>
              ) : (
                bucket.map(item => (
                  <Pressable key={item.id} style={styles.bucketRow} onPress={() => onRemoveBucket(item)}>
                    <SynthText variant="meta" style={styles.bucketEntity}>
                      {item.entity_type === 'venue' ? '📍 ' : '🎤 '}
                      {item.entity_name}
                    </SynthText>
                    <SynthText variant="meta" color="secondary">
                      Remove
                    </SynthText>
                  </Pressable>
                ))
              )}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  chips: { gap: 8, paddingBottom: 12, flexDirection: 'row' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: SynthTokens.colors.neutral100,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  chipOn: { backgroundColor: SynthTokens.colors.brandPink050, borderColor: PINK },
  chipTxt: { fontSize: 12, fontWeight: '600', color: SynthTokens.colors.neutral600 },
  chipTxtOn: { color: SynthTokens.colors.neutral900 },
  panel: { minHeight: 120 },
  centered: { paddingVertical: 24, alignItems: 'center' },
  card: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  cardTitle: { marginBottom: 8 },
  fanName: { fontSize: 17, fontWeight: '800', color: PINK, marginBottom: 6 },
  fanDesc: { lineHeight: 22 },
  mt8: { marginTop: 8 },
  mt12: { marginTop: 12 },
  mt4: { marginTop: 4 },
  sectionLabel: { fontWeight: '800', marginBottom: 8, marginTop: 4, color: SynthTokens.colors.neutral900 },
  nextSection: { marginBottom: 16 },
  nextCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: SynthTokens.colors.brandPink050,
    borderWidth: 1,
    borderColor: PINK,
    marginBottom: 10,
  },
  nextType: { textTransform: 'capitalize', color: PINK, marginBottom: 4 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 10, paddingRight: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: SynthTokens.colors.neutral100,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  filterChipOn: { backgroundColor: SynthTokens.colors.neutral900, borderColor: SynthTokens.colors.neutral900 },
  filterChipTxt: { fontSize: 12, fontWeight: '600', color: SynthTokens.colors.neutral600 },
  filterChipTxtOn: { color: SynthTokens.colors.neutral0 },
  rarityBlock: { marginBottom: 16 },
  rarityHeader: { fontWeight: '800', marginBottom: 8, fontSize: 14 },
  stampCard: {
    flexDirection: 'row',
    padding: 12,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  stampType: { textTransform: 'capitalize', color: PINK, marginBottom: 4 },
  stampName: { fontWeight: '600' },
  achBig: { fontSize: 28, marginRight: 10, width: 40 },
  achCard: {
    flexDirection: 'row',
    padding: 14,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  achCardUnlocked: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderColor: SynthTokens.colors.neutral400,
  },
  achCardLocked: {
    backgroundColor: 'rgba(201,201,201,0.35)',
    borderColor: SynthTokens.colors.neutral400,
  },
  achTitle: { fontWeight: '800', fontSize: 16 },
  achDesc: { marginTop: 4, lineHeight: 20 },
  unlockedPill: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: SynthTokens.colors.brandPink050,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  unlockedPillTxt: { color: PINK, fontWeight: '700' },
  barTrack: {
    height: 10,
    borderRadius: 8,
    backgroundColor: SynthTokens.colors.neutral200,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 8,
    backgroundColor: PINK,
  },
  progressTxt: { textAlign: 'right', marginTop: 4 },
  bold: { fontWeight: '700' },
  timeline: { marginTop: 4 },
  timelineItem: { flexDirection: 'row', marginBottom: 4 },
  timelineLeft: { width: 56, alignItems: 'center' },
  timelineDate: { fontSize: 11, marginBottom: 4 },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: SynthTokens.colors.neutral400,
    zIndex: 1,
  },
  activeDot: { backgroundColor: PINK },
  timelineLine: { width: 2, flex: 1, backgroundColor: SynthTokens.colors.neutral200, marginTop: -2 },
  timelineCard: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: SynthTokens.colors.neutral50,
    borderRadius: 12,
    marginBottom: 12,
    marginLeft: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  cardContent: { flex: 1, padding: 12 },
  cardImage: { width: 88, height: 88 },
  bucketHint: { marginBottom: 10, lineHeight: 20 },
  addBucket: {
    backgroundColor: PINK,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  addBucketTxt: { color: '#fff', fontWeight: '700' },
  bucketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
  },
  bucketEntity: { flex: 1, fontWeight: '600' },
});
