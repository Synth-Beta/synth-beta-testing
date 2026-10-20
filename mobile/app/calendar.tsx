import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Pressable, ScrollView, Text } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, X } from 'lucide-react-native';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';
import { EventCard } from '../src/components/Feed/EventCard';
import { MonthCalendar, type CalDaySelection } from '../src/components/discover/MonthCalendar';
import { LocationPill } from '../src/components/discover/LocationPill';
import { DiscoverCalEventsSkeleton } from '../src/components/skeletons/DiscoverCalEventsSkeleton';
import { SearchService, type SearchResult } from '../src/services/searchService';
import { supabase } from '../src/integrations/supabase/client';
import { useBrowseLocation } from '../src/contexts/BrowseLocationContext';
import { toLocalYmd } from '../src/utils/localYmd';

const PINK = SynthTokens.colors.brandPink500;
type Scope = 'all' | 'mine';

/**
 * Calendar (☰ menu): a month of shows near the browse location, with the shows you saved
 * (Interested / Going) marked. Pick a day to see what's on. Mirrors web CalendarPage.
 */
export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { coords, radiusMiles } = useBrowseLocation();
  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [selection, setSelection] = useState<CalDaySelection | null>(null);
  const [scope, setScope] = useState<Scope>('all');
  const [nearbyByDate, setNearbyByDate] = useState<Record<string, SearchResult[]>>({});
  const [savedByDate, setSavedByDate] = useState<Record<string, SearchResult[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadedMonthsRef = useRef<Set<string>>(new Set());
  const locationKeyRef = useRef('');

  // Changing month clears the day, unless a "Your next shows" tap asked for one.
  const pendingSelectionRef = useRef<CalDaySelection | null>(null);
  useEffect(() => {
    setSelection(pendingSelectionRef.current);
    pendingSelectionRef.current = null;
  }, [calMonth, calYear]);

  // Saved shows (Interested / Going), upcoming. Refreshed on focus so toggles elsewhere show up.
  const loadSaved = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from('user_event_relationships')
      .select(
        'event_id, events!inner(id, title, event_date, venue_id, venue_city, venue_state, artist_id, event_media_url, ticket_urls, venues(name), artists(name, image_url))'
      )
      .eq('user_id', userId)
      .in('relationship_type', ['interested', 'going'])
      .gte('events.event_date', todayStart.toISOString());
    if (error) {
      console.warn('[Calendar] saved shows:', error.message);
      return;
    }
    const byDate: Record<string, SearchResult[]> = {};
    for (const row of (data ?? []) as any[]) {
      const e = row.events;
      if (!e) continue;
      const ymd = toLocalYmd(new Date(e.event_date));
      (byDate[ymd] ??= []).push({
        id: e.id,
        title: e.title,
        artist_name: e.artists?.name ?? '',
        venue_name: e.venues?.name ?? '',
        venue_city: e.venue_city ?? undefined,
        venue_state: e.venue_state ?? undefined,
        event_date: e.event_date,
        image_url: e.event_media_url ?? e.artists?.image_url ?? undefined,
        artist_id: e.artist_id ?? undefined,
        venue_id: e.venue_id ?? undefined,
        ticket_url: Array.isArray(e.ticket_urls) ? e.ticket_urls[0] : undefined,
      });
    }
    setSavedByDate(byDate);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSaved();
    }, [loadSaved])
  );

  // Nearby shows for the month on screen; merged so earlier months stay loaded.
  useEffect(() => {
    const locationKey = `${coords?.latitude ?? 'na'}|${coords?.longitude ?? 'na'}|${radiusMiles}`;
    if (locationKeyRef.current !== locationKey) {
      locationKeyRef.current = locationKey;
      loadedMonthsRef.current = new Set();
      setNearbyByDate({});
    }
    const monthKey = `${calYear}-${calMonth}`;
    if (loadedMonthsRef.current.has(monthKey)) return;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(calYear, calMonth, 1);
    const monthEnd = new Date(calYear, calMonth + 1, 0, 23, 59, 59, 999);
    if (monthEnd < todayStart) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void SearchService.loadDiscoverCalendarEvents({
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      radiusMiles,
      minDate: (monthStart < todayStart ? todayStart : monthStart).toISOString(),
      until: monthEnd.toISOString(),
    })
      .then(({ byDate, error }) => {
        if (cancelled) return;
        setNearbyByDate((prev) => ({ ...prev, ...byDate }));
        setLoadError(error);
        if (!error) loadedMonthsRef.current.add(monthKey);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coords?.latitude, coords?.longitude, radiusMiles, calMonth, calYear]);

  const daysIn = (byDate: Record<string, SearchResult[]>) => {
    const set = new Set<number>();
    for (const ymd of Object.keys(byDate)) {
      if (!byDate[ymd]?.length) continue;
      const [y, m, d] = ymd.split('-').map(Number);
      if (y === calYear && m - 1 === calMonth) set.add(d);
    }
    return set;
  };
  const savedDays = useMemo(() => daysIn(savedByDate), [savedByDate, calMonth, calYear]);
  const nearbyDays = useMemo(() => daysIn(nearbyByDate), [nearbyByDate, calMonth, calYear]);

  const dayEvents = useMemo(() => {
    if (!selection) return [];
    const ymd = toLocalYmd(new Date(selection.year, selection.month, selection.day));
    const saved = savedByDate[ymd] ?? [];
    const savedIds = new Set(saved.map((e) => e.id));
    const rest = scope === 'mine' ? [] : (nearbyByDate[ymd] ?? []).filter((e) => !savedIds.has(e.id));
    const byTime = (a: SearchResult, b: SearchResult) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
    return [...saved.sort(byTime), ...rest.sort(byTime)];
  }, [selection, savedByDate, nearbyByDate, scope]);

  const nextSaved = useMemo(
    () =>
      Object.values(savedByDate)
        .flat()
        .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
        .slice(0, 5),
    [savedByDate]
  );

  const jumpTo = (iso: string) => {
    const d = new Date(iso);
    const target = { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
    if (target.year === calYear && target.month === calMonth) {
      setSelection(target);
      return;
    }
    pendingSelectionRef.current = target;
    setCalYear(target.year);
    setCalMonth(target.month);
  };

  const prev = () => (calMonth === 0 ? (setCalMonth(11), setCalYear((y) => y - 1)) : setCalMonth((m) => m - 1));
  const next = () => (calMonth === 11 ? (setCalMonth(0), setCalYear((y) => y + 1)) : setCalMonth((m) => m + 1));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="Back">
          <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
        </Pressable>
        <Text style={styles.title}>Calendar</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 48 }]}>
        <View style={styles.topRow}>
          <LocationPill />
          <View style={styles.scope} accessibilityRole="tablist">
            {(['all', 'mine'] as Scope[]).map((s) => (
              <Pressable
                key={s}
                onPress={() => setScope(s)}
                style={[styles.scopeBtn, scope === s && styles.scopeBtnOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: scope === s }}
              >
                <Text style={[styles.scopeTxt, scope === s && styles.scopeTxtOn]}>{s === 'all' ? 'All nearby' : 'My shows'}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <SynthText variant="meta" color="secondary" style={styles.hint}>
          {coords ? `Shows within ${radiusMiles} miles. Pink days have shows you saved.` : 'Pink days have shows you saved.'}
        </SynthText>
        {loadError ? (
          <SynthText variant="meta" style={styles.error}>Could not load events: {loadError}</SynthText>
        ) : null}

        <MonthCalendar
          month={calMonth}
          year={calYear}
          onPrev={prev}
          onNext={next}
          selectedDate={selection}
          daysWithEvents={scope === 'mine' ? savedDays : nearbyDays}
          savedDays={savedDays}
          onSelectDay={(day) =>
            setSelection((p) =>
              p && p.year === calYear && p.month === calMonth && p.day === day ? null : { year: calYear, month: calMonth, day }
            )
          }
        />

        {selection ? (
          <View style={styles.results}>
            <View style={styles.resultsHeader}>
              <SynthText variant="meta" style={styles.resultsTitle}>
                {new Date(selection.year, selection.month, selection.day).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </SynthText>
              <Pressable onPress={() => setSelection(null)} hitSlop={10} style={styles.clearBtn} accessibilityLabel="Clear selected date">
                <SynthText variant="meta" style={styles.clearTxt}>Show all</SynthText>
                <X size={14} color={PINK} />
              </Pressable>
            </View>
            {loading ? (
              <DiscoverCalEventsSkeleton />
            ) : dayEvents.length === 0 ? (
              <SynthText variant="meta" color="secondary">No shows on this date.</SynthText>
            ) : (
              dayEvents.map((ev) => (
                <EventCard
                  key={ev.id}
                  id={ev.id}
                  title={ev.title}
                  artist_name={ev.artist_name}
                  venue_name={ev.venue_name}
                  venue_city={ev.venue_city}
                  venue_state={ev.venue_state}
                  event_date={ev.event_date}
                  image_url={ev.image_url}
                  ticket_url={ev.ticket_url}
                  artist_id={ev.artist_id}
                  venue_id={ev.venue_id}
                />
              ))
            )}
          </View>
        ) : nextSaved.length > 0 ? (
          <View style={styles.results}>
            <SynthText variant="meta" style={styles.resultsTitle}>Your next shows</SynthText>
            {nextSaved.map((ev) => (
              <Pressable key={ev.id} onPress={() => jumpTo(ev.event_date)} style={styles.mini}>
                <Text style={styles.miniDate}>
                  {new Date(ev.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}
                </Text>
                <Text style={styles.miniTitle} numberOfLines={1}>
                  {ev.artist_name || ev.title}
                  {ev.venue_name ? ` · ${ev.venue_name}` : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <SynthText variant="meta" color="secondary" style={styles.hint}>
            Tap a date to see shows that day. Days with a dot have shows.
          </SynthText>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SynthTokens.spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: SynthTokens.colors.neutral900 },
  scroll: { padding: SynthTokens.spacing.md, gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  scope: { flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: SynthTokens.colors.neutral100 },
  scopeBtn: { height: 30, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center' },
  scopeBtnOn: { backgroundColor: SynthTokens.colors.neutral0 },
  scopeTxt: { fontSize: 13, fontWeight: '700', color: SynthTokens.colors.neutral600 },
  scopeTxtOn: { color: PINK },
  hint: { fontSize: 14 },
  error: { color: PINK },
  results: { gap: 8, marginTop: 4 },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultsTitle: { fontWeight: '700', fontSize: 15, marginBottom: 4 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  clearTxt: { color: PINK, fontWeight: '600' },
  mini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  miniDate: { width: 52, fontSize: 12, fontWeight: '800', color: PINK },
  miniTitle: { flex: 1, fontSize: 14, color: SynthTokens.colors.neutral900 },
});
