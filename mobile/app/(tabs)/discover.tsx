import React, { useMemo, useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Pressable,
  ScrollView,
  TextInput,
  Text,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Search,
  Menu,
  Sparkles,
  MapPin,
  X,
  Calendar,
  Route,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react-native';
import { EventCard } from '../../src/components/Feed/EventCard';
import { HomeFeedService, TrendingEvent } from '../../src/services/homeFeedService';

const PINK = SynthTokens.colors.brandPink500;
const PINK_SOFT = 'rgba(204, 36, 134, 0.12)';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function DiscoverCalendar({
  month,
  year,
  onPrev,
  onNext,
}: {
  month: number;
  year: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();
  const today = new Date();
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;
  const todayDate = today.getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const nextPad = 42 - cells.length;
  for (let d = 1; d <= nextPad && cells.length < 42; d++) cells.push(-d);

  const label = first.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  return (
    <View style={calStyles.card}>
      <View style={calStyles.monthRow}>
        <Pressable onPress={onPrev} style={calStyles.arrow}>
          <ChevronLeft size={22} color={SynthTokens.colors.neutral900} />
        </Pressable>
        <Text style={calStyles.monthTitle}>{label}</Text>
        <Pressable onPress={onNext} style={calStyles.arrow}>
          <ChevronRight size={22} color={SynthTokens.colors.neutral900} />
        </Pressable>
      </View>
      <View style={calStyles.weekRow}>
        {WEEKDAYS.map(w => (
          <Text key={w} style={calStyles.weekday}>
            {w}
          </Text>
        ))}
      </View>
      <View style={calStyles.grid}>
        {cells.map((cell, idx) => {
          if (cell === null) {
            return <View key={`e-${idx}`} style={calStyles.cell} />;
          }
          if (cell < 0) {
            return (
              <View key={`n-${idx}`} style={calStyles.cell}>
                <Text style={calStyles.dayMuted}>{-cell}</Text>
              </View>
            );
          }
          const isToday = isCurrentMonth && cell === todayDate;
          const isPast = isCurrentMonth && cell < todayDate;
          return (
            <View key={`d-${idx}`} style={calStyles.cell}>
              <Text
                style={[
                  calStyles.dayNum,
                  isPast && calStyles.dayPast,
                  isToday && calStyles.dayToday,
                ]}
              >
                {cell}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const calStyles = StyleSheet.create({
  card: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 16,
    padding: SynthTokens.spacing.md,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SynthTokens.spacing.md,
  },
  monthTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  arrow: { padding: 8 },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekday: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: SynthTokens.colors.neutral600,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '14.28%',
    aspectRatio: 1,
    maxHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: {
    fontSize: 15,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  dayPast: {
    fontWeight: '500',
    color: SynthTokens.colors.neutral600,
  },
  dayToday: {
    color: PINK,
  },
  dayMuted: {
    fontSize: 13,
    fontWeight: '500',
    color: SynthTokens.colors.neutral200,
  },
});

export default function DiscoverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [searchQ, setSearchQ] = useState('');
  const [locationLabel] = useState('Washington DC, DC');
  const [showLocationPill, setShowLocationPill] = useState(true);
  const [tab, setTab] = useState<'calendar' | 'tour'>('calendar');
  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [trending, setTrending] = useState<TrendingEvent[]>([]);

  useEffect(() => {
    void (async () => {
      const data = await HomeFeedService.getTrendingEvents();
      setTrending(data.slice(0, 8));
    })();
  }, []);

  const calPrev = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(y => y - 1);
    } else setCalMonth(m => m - 1);
  };

  const calNext = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(y => y + 1);
    } else setCalMonth(m => m + 1);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Search size={20} color={SynthTokens.colors.neutral400} />
          <TextInput
            placeholder='Try "Radiohead"'
            placeholderTextColor={SynthTokens.colors.neutral400}
            style={styles.searchInput}
            value={searchQ}
            onChangeText={setSearchQ}
            onSubmitEditing={() => {
              router.push('/(tabs)/search');
            }}
            returnKeyType="search"
          />
        </View>
        <Pressable style={styles.iconCircle} onPress={() => router.push('/app-menu')}>
          <Menu size={22} color={SynthTokens.colors.neutral900} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.dualActions}>
          <Pressable style={styles.browseVibes} onPress={() => router.push('/(tabs)/search')}>
            <Sparkles size={18} color="#fff" />
            <Text style={styles.browseVibesText}>Browse Vibes</Text>
          </Pressable>
          <Pressable style={styles.locationBtn}>
            <MapPin size={18} color={SynthTokens.colors.neutral900} />
            <Text style={styles.locationBtnText}>Location</Text>
          </Pressable>
        </View>

        {showLocationPill ? (
          <View style={styles.locPill}>
            <MapPin size={16} color={PINK} />
            <Text style={styles.locPillText} numberOfLines={1}>
              {locationLabel}
            </Text>
            <Pressable
              onPress={() => setShowLocationPill(false)}
              hitSlop={8}
              style={styles.locClear}
            >
              <X size={18} color={PINK} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.sectionHead}>
          <SynthText variant="h2" style={styles.sectionTitle}>
            Discover Events
          </SynthText>
          <SynthText variant="meta" color="secondary" style={styles.sectionSub}>
            Discover events by date, leaderboards, or artist tour.
          </SynthText>
        </View>

        <View style={styles.segmentWrap}>
          <Pressable
            style={[styles.seg, tab === 'calendar' && styles.segActive]}
            onPress={() => setTab('calendar')}
          >
            <Calendar size={18} color={tab === 'calendar' ? PINK : SynthTokens.colors.neutral600} />
            <Text style={[styles.segText, tab === 'calendar' && styles.segTextActive]}>Calendar</Text>
          </Pressable>
          <Pressable
            style={[styles.seg, tab === 'tour' && styles.segActive]}
            onPress={() => router.push('/(tabs)/search')}
          >
            <Route size={18} color={tab === 'tour' ? PINK : SynthTokens.colors.neutral600} />
            <Text style={[styles.segText, tab === 'tour' && styles.segTextActive]}>Tour Tracker</Text>
          </Pressable>
        </View>

        {tab === 'calendar' ? (
          <DiscoverCalendar month={calMonth} year={calYear} onPrev={calPrev} onNext={calNext} />
        ) : null}

        <SynthText variant="meta" style={styles.trendingLabel}>
          Trending near you
        </SynthText>
        {trending.map(ev => (
          <EventCard
            key={ev.id}
            id={ev.id}
            title={ev.title}
            artist_name={ev.artist_name}
            venue_name={ev.venue_name}
            event_date={ev.event_date}
            image_url={ev.image_url}
            onPress={() => router.push(`/event/${ev.id}`)}
            onGoingPress={() => router.push(`/event/${ev.id}`)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SynthTokens.spacing.md,
    paddingBottom: SynthTokens.spacing.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral50,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: SynthTokens.colors.neutral900,
    paddingVertical: 0,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SynthTokens.colors.neutral0,
  },
  scroll: {
    paddingHorizontal: SynthTokens.spacing.md,
    paddingBottom: 120,
    gap: SynthTokens.spacing.md,
  },
  dualActions: {
    flexDirection: 'row',
    gap: 10,
  },
  browseVibes: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PINK,
    paddingVertical: 14,
    borderRadius: 14,
  },
  browseVibesText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  locationBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: SynthTokens.colors.neutral0,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  locationBtnText: {
    fontWeight: '700',
    fontSize: 15,
    color: SynthTokens.colors.neutral900,
  },
  locPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
    borderWidth: 2,
    borderColor: PINK,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  locPillText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: SynthTokens.colors.neutral900,
  },
  locClear: { padding: 4 },
  sectionHead: {
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  sectionSub: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
  },
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: SynthTokens.colors.neutral50,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  seg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  segActive: {
    backgroundColor: PINK_SOFT,
  },
  segText: {
    fontSize: 14,
    fontWeight: '600',
    color: SynthTokens.colors.neutral600,
  },
  segTextActive: {
    color: PINK,
  },
  trendingLabel: {
    fontWeight: '700',
    fontSize: 16,
    color: SynthTokens.colors.neutral900,
    marginTop: 8,
  },
});
