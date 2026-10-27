import React from 'react';
import { StyleSheet, View, Pressable, Text } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { SynthTokens } from '../../tokens/SynthTokens';

const PINK = SynthTokens.colors.brandPink500;
const PINK_SOFT = 'rgba(204, 36, 134, 0.12)';

/** Month grid used by the Calendar screen (was inline in Discover). */
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Which calendar month/day is selected (full Y/M/D so day "15" in April does not highlight May 15). */
export type CalDaySelection = { year: number; month: number; day: number };

export function MonthCalendar({
  month,
  year,
  onPrev,
  onNext,
  selectedDate,
  onSelectDay,
  daysWithEvents,
  savedDays,
}: {
  month: number;
  year: number;
  onPrev: () => void;
  onNext: () => void;
  selectedDate: CalDaySelection | null;
  onSelectDay: (day: number) => void;
  /** Day-of-month (1–31) that have at least one event in `calendarByDate`. */
  daysWithEvents: Set<number>;
  /** Day-of-month with a show the user saved (Interested / Going): pink filled day. */
  savedDays?: Set<number>;
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
          const isSaved = savedDays?.has(cell) ?? false;
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
                  isSaved && calStyles.daySaved,
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
    shadowColor: '#0E0E0E',
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
  daySaved: {
    color: SynthTokens.colors.neutral0,
    backgroundColor: PINK,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  eventDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: PINK,
    marginTop: 2,
  },
});
