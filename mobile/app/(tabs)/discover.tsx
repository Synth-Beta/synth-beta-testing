import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { SearchService, type SearchResult } from '../../src/services/searchService';
import { MobileTourTracker } from '../../src/components/discover/MobileTourTracker';
import { DiscoverCalEventsSkeleton } from '../../src/components/skeletons/DiscoverCalEventsSkeleton';
import { type LatLng } from '../../src/services/locationService';
import { toLocalYmd } from '../../src/utils/localYmd';
import { bottomSafeContentPadding } from '../../src/components/navigation/SynthTabBar';
import { GenreChatsSection } from '../../src/components/discover/GenreChatsSection';
import { FeaturedThisWeekSection } from '../../src/components/home/FeaturedThisWeekSection';
import { EventService } from '../../src/services/eventService';
import { supabase } from '../../src/integrations/supabase/client';
import { VibeSelectorSheet, type VibeType } from '../../src/components/discover/VibeSelectorSheet';
import { LocationSheet } from '../../src/components/discover/LocationSheet';
import { useBrowseLocation } from '../../src/contexts/BrowseLocationContext';

const PINK = SynthTokens.colors.brandPink500;
const PINK_SOFT = 'rgba(204, 36, 134, 0.12)';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Which calendar month/day is selected (full Y/M/D so day "15" in April does not highlight May 15). */
type CalDaySelection = { year: number; month: number; day: number };

function DiscoverCalendar({
  month,
  year,
  onPrev,
  onNext,
  selectedDate,
  onSelectDay,
  daysWithEvents,
}: {
  month: number;
  year: number;
  onPrev: () => void;
  onNext: () => void;
  selectedDate: CalDaySelection | null;
  onSelectDay: (day: number) => void;
  /** Day-of-month (1–31) that have at least one event in `calendarByDate`. */
  daysWithEvents: Set<number>;
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
          const isSelected =
            selectedDate != null &&
            year === selectedDate.year &&
            month === selectedDate.month &&
            cell === selectedDate.day;
          const hasEvents = daysWithEvents.has(cell);
          return (
            <Pressable
              key={`d-${idx}`}
              style={calStyles.cell}
              onPress={() => onSelectDay(cell)}
              accessibilityRole="button"
              accessibilityLabel={`Day ${cell}`}
            >
              <Text
                style={[
                  calStyles.dayNum,
                  isPast && calStyles.dayPast,
                  isToday && calStyles.dayToday,
                  isSelected && calStyles.daySelected,
                ]}
              >
                {cell}
              </Text>
              {hasEvents ? <View style={calStyles.eventDot} /> : null}
            </Pressable>
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
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
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
  daySelected: {
    color: SynthTokens.colors.neutral900,
    backgroundColor: PINK_SOFT,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dayMuted: {
    fontSize: 13,
    fontWeight: '500',
    color: SynthTokens.colors.neutral200,
  },
  eventDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: PINK,
    marginTop: 2,
  },
});

export default function DiscoverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [searchQ, setSearchQ] = useState('');
  const {
    coords,
    label: locationLabel,
    radiusMiles: discoverRadius,
    isManual,
    setManualLocation,
    resetToCurrentLocation,
  } = useBrowseLocation();
  const [showLocationPill, setShowLocationPill] = useState(true);
  const [tab, setTab] = useState<'calendar' | 'tour'>('calendar');
  const [userId, setUserId] = useState<string | null>(null);
  const [isVibeSheetOpen, setIsVibeSheetOpen] = useState(false);
  const [isLocationSheetOpen, setIsLocationSheetOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    }).catch(() => {});
  }, []);

  // Pill only shows for an active manual override - clearing/resetting hides it,
  // while the small X on the pill lets the user dismiss it without resetting the
  // underlying browse location (see styles.locClear below).
  useEffect(() => {
    setShowLocationPill(isManual);
  }, [isManual]);

  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calDaySelection, setCalDaySelection] = useState<CalDaySelection | null>(null);
  const [calendarByDate, setCalendarByDate] = useState<Record<string, SearchResult[]>>({});
  const [calLoading, setCalLoading] = useState(false);
  const [calLoadError, setCalLoadError] = useState<string | null>(null);

  useEffect(() => {
    setCalDaySelection(null);
  }, [calMonth, calYear]);

  useEffect(() => {
    if (tab !== 'calendar') {
      return;
    }
    let cancelled = false;
    setCalLoading(true);
    setCalLoadError(null);
    void SearchService.loadDiscoverCalendarEvents({
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      radiusMiles: discoverRadius,
      limit: 10000,
    }).then(({ byDate, error }) => {
      if (cancelled) return;
      setCalendarByDate(byDate);
      setCalLoadError(error);
    }).finally(() => {
      if (!cancelled) setCalLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, coords?.latitude, coords?.longitude, discoverRadius]);

  const daysWithEventsInMonth = useMemo(() => {
    const set = new Set<number>();
    const y = calYear;
    const m = calMonth;
    for (const ymd of Object.keys(calendarByDate)) {
      if (!calendarByDate[ymd]?.length) continue;
      const [ys, ms, ds] = ymd.split('-').map(Number);
      if (ys === y && ms - 1 === m) set.add(ds);
    }
    return set;
  }, [calendarByDate, calMonth, calYear]);

  const selectedDayEvents = useMemo(() => {
    if (calDaySelection == null) return [];
    const ymd = toLocalYmd(
      new Date(calDaySelection.year, calDaySelection.month, calDaySelection.day)
    );
    const list = calendarByDate[ymd] ?? [];
    return [...list].sort(
      (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    );
  }, [calDaySelection, calendarByDate]);

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

  const handleLocationApply = (newCoords: LatLng | null, label: string | null, radiusMiles: number) => {
    if (newCoords) {
      setManualLocation(newCoords, label ?? 'Custom location', radiusMiles);
    } else {
      resetToCurrentLocation();
    }
    setIsLocationSheetOpen(false);
  };

  const handleVibeSelect = useCallback((vibeType: VibeType) => {
    console.log('Discover vibe selected:', vibeType);
    setIsVibeSheetOpen(false);
  }, []);

  const onTourTab = useCallback(() => {
    setTab('tour');
  }, []);

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
              const q = searchQ.trim();
              router.push(q ? (`/(tabs)/search?q=${encodeURIComponent(q)}` as any) : '/(tabs)/search');
            }}
            onFocus={() => {
              // Navigate to full search screen immediately on tap, carrying any typed text
              const q = searchQ.trim();
              if (q) {
                router.push(`/(tabs)/search?q=${encodeURIComponent(q)}` as any);
              } else {
                router.push('/(tabs)/search');
              }
            }}
            returnKeyType="search"
          />
        </View>
        <Pressable style={styles.iconCircle} onPress={() => router.push('/app-menu')}>
          <Menu size={22} color={SynthTokens.colors.neutral900} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: bottomSafeContentPadding(insets.bottom) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.dualActions}>
          <Pressable style={styles.browseVibes} onPress={() => setIsVibeSheetOpen(true)}>
            <Sparkles size={18} color="#fff" />
            <Text style={styles.browseVibesText}>Browse Vibes</Text>
          </Pressable>
          <Pressable style={styles.locationBtn} onPress={() => setIsLocationSheetOpen(true)}>
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
            onPress={onTourTab}
          >
            <Route size={18} color={tab === 'tour' ? PINK : SynthTokens.colors.neutral600} />
            <Text style={[styles.segText, tab === 'tour' && styles.segTextActive]}>Tour Tracker</Text>
          </Pressable>
        </View>

        {tab === 'calendar' ? (
          <>
            {calLoadError ? (
              <SynthText variant="meta" color="secondary" style={styles.calError}>
                Could not load events: {calLoadError}
              </SynthText>
            ) : null}
            {calLoading && !calDaySelection ? (
              <SynthText variant="meta" color="secondary" style={styles.calHint}>
                Loading events…
              </SynthText>
            ) : null}
            <DiscoverCalendar
              month={calMonth}
              year={calYear}
              onPrev={calPrev}
              onNext={calNext}
              selectedDate={calDaySelection}
              daysWithEvents={daysWithEventsInMonth}
              onSelectDay={day => {
                setCalDaySelection({ year: calYear, month: calMonth, day });
              }}
            />
            {calDaySelection != null ? (
              <View style={styles.calResults}>
                <SynthText variant="meta" style={styles.calResultsTitle}>
                  {new Date(
                    calDaySelection.year,
                    calDaySelection.month,
                    calDaySelection.day
                  ).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </SynthText>
                {calLoading ? (
                  <DiscoverCalEventsSkeleton />
                ) : selectedDayEvents.length === 0 ? (
                  <SynthText variant="meta" color="secondary">
                    No events on this date.
                  </SynthText>
                ) : (
                  selectedDayEvents.map(ev => (
                    <EventCard
                      key={ev.id}
                      id={ev.id}
                      title={ev.title}
                      artist_name={ev.artist_name}
                      venue_name={ev.venue_name}
                      venue_city={ev.venue_city}
                      event_date={ev.event_date}
                      image_url={ev.image_url}
                      ticket_url={ev.ticket_url}
                      artist_id={ev.artist_id}
                      venue_id={ev.venue_id}
                    />
                  ))
                )}
              </View>
            ) : (
              <SynthText variant="meta" color="secondary" style={styles.calHint}>
                Tap a date to see shows that day. Days with a dot have events.
              </SynthText>
            )}
          </>
        ) : (
          <MobileTourTracker />
        )}

        <FeaturedThisWeekSection
          onEventPress={(eventId) => {
            void EventService.toEventRouteId(eventId).then((rid) => {
              router.push(`/event/${rid}` as any);
            });
          }}
        />

        {/* Genre Communities — shown below calendar and tour tracker */}
        {userId ? (
          <GenreChatsSection currentUserId={userId} />
        ) : null}

      </ScrollView>
      <VibeSelectorSheet
        visible={isVibeSheetOpen}
        onClose={() => setIsVibeSheetOpen(false)}
        onSelect={handleVibeSelect}
      />
      <LocationSheet
        visible={isLocationSheetOpen}
        onClose={() => setIsLocationSheetOpen(false)}
        onApply={handleLocationApply}
        initialCoords={coords}
        initialLabel={locationLabel}
        initialRadius={discoverRadius}
      />
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
  calHint: { marginTop: 4, marginBottom: 4 },
  calError: { marginTop: 4, marginBottom: 4, color: SynthTokens.colors.brandPink500 },
  calResults: { gap: 8, marginTop: 4 },
  calResultsTitle: { fontWeight: '700', fontSize: 15, marginBottom: 4 },
});
