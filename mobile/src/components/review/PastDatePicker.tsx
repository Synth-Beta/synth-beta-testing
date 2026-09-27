import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';

/**
 * Month-grid picker for the date of a show the user already attended.
 *
 * Deliberately plain React Native rather than a native date picker: adding
 * @react-native-community/datetimepicker would mean a config plugin and a new
 * native build, and a spinner is worse here anyway — reviews are for past
 * shows, so paging months back is the common move. Future days are disabled to
 * match `isEventPast`, which treats today as upcoming.
 */

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

function ymd(y: number, m: number, d: number): string {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Parses `YYYY-MM-DD` without the UTC-midnight off-by-one of `new Date(str)`. */
function parseYmd(raw?: string): { y: number; m: number; d: number } | null {
    const s = String(raw ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split('-').map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return { y, m: m - 1, d };
}

export function formatEventDateLabel(raw?: string): string {
    const p = parseYmd(raw);
    if (!p) return '';
    return new Date(p.y, p.m, p.d).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

interface Props {
    visible: boolean;
    value?: string;
    onSelect: (ymdValue: string) => void;
    onClose: () => void;
}

export function PastDatePicker({ visible, value, onSelect, onClose }: Props) {
    const today = useMemo(() => new Date(), []);
    const selected = parseYmd(value);
    const [cursor, setCursor] = useState(() => ({
        y: selected?.y ?? today.getFullYear(),
        m: selected?.m ?? today.getMonth(),
    }));

    const firstWeekday = new Date(cursor.y, cursor.m, 1).getDay();
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();

    // Today counts as upcoming, so the newest reviewable day is yesterday.
    const isFuture = (d: number) =>
        ymd(cursor.y, cursor.m, d) >= ymd(today.getFullYear(), today.getMonth(), today.getDate());

    const atCurrentMonth =
        cursor.y === today.getFullYear() && cursor.m === today.getMonth();

    const step = (delta: number) => {
        const next = new Date(cursor.y, cursor.m + delta, 1);
        if (delta > 0 && (next.getFullYear() > today.getFullYear() ||
            (next.getFullYear() === today.getFullYear() && next.getMonth() > today.getMonth()))) {
            return;
        }
        setCursor({ y: next.getFullYear(), m: next.getMonth() });
    };

    const cells: (number | null)[] = [
        ...Array(firstWeekday).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <View style={styles.sheet}>
                <View style={styles.header}>
                    <SynthText variant="h2">When was the show?</SynthText>
                    <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close date picker">
                        <X size={22} color={SynthTokens.colors.neutral900} />
                    </Pressable>
                </View>

                <ScrollView contentContainerStyle={styles.body}>
                    <View style={styles.monthRow}>
                        <Pressable onPress={() => step(-1)} style={styles.navBtn} hitSlop={8} accessibilityLabel="Previous month">
                            <ChevronLeft size={22} color={SynthTokens.colors.neutral900} />
                        </Pressable>
                        <SynthText variant="body" style={styles.monthLabel}>
                            {MONTHS[cursor.m]} {cursor.y}
                        </SynthText>
                        <Pressable
                            onPress={() => step(1)}
                            style={[styles.navBtn, atCurrentMonth && styles.navBtnOff]}
                            hitSlop={8}
                            disabled={atCurrentMonth}
                            accessibilityLabel="Next month"
                        >
                            <ChevronRight
                                size={22}
                                color={atCurrentMonth ? SynthTokens.colors.neutral400 : SynthTokens.colors.neutral900}
                            />
                        </Pressable>
                    </View>

                    <View style={styles.grid}>
                        {WEEKDAYS.map((w, i) => (
                            <View key={`wd-${i}`} style={styles.cell}>
                                <SynthText variant="meta" color="secondary" style={styles.weekday}>{w}</SynthText>
                            </View>
                        ))}
                        {cells.map((d, i) => {
                            if (d === null) return <View key={`pad-${i}`} style={styles.cell} />;
                            const disabled = isFuture(d);
                            const isSel =
                                !!selected && selected.y === cursor.y && selected.m === cursor.m && selected.d === d;
                            return (
                                <View key={`d-${d}`} style={styles.cell}>
                                    <Pressable
                                        disabled={disabled}
                                        onPress={() => {
                                            onSelect(ymd(cursor.y, cursor.m, d));
                                            onClose();
                                        }}
                                        style={[styles.day, isSel && styles.daySel]}
                                        accessibilityRole="button"
                                        accessibilityState={{ disabled, selected: isSel }}
                                        accessibilityLabel={`${MONTHS[cursor.m]} ${d}, ${cursor.y}`}
                                    >
                                        <SynthText
                                            variant="body"
                                            style={[
                                                styles.dayTxt,
                                                disabled && styles.dayTxtOff,
                                                isSel && styles.dayTxtSel,
                                            ]}
                                        >
                                            {d}
                                        </SynthText>
                                    </Pressable>
                                </View>
                            );
                        })}
                    </View>

                    <View style={styles.quickRow}>
                        {[1, 7, 30].map((ago) => {
                            const t = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ago);
                            return (
                                <Pressable
                                    key={ago}
                                    style={styles.quickChip}
                                    onPress={() => {
                                        onSelect(ymd(t.getFullYear(), t.getMonth(), t.getDate()));
                                        onClose();
                                    }}
                                >
                                    <SynthText variant="meta">
                                        {ago === 1 ? 'Yesterday' : ago === 7 ? 'A week ago' : 'A month ago'}
                                    </SynthText>
                                </Pressable>
                            );
                        })}
                    </View>
                </ScrollView>
            </View>
        </Modal>
    );
}

const CELL = `${100 / 7}%`;

const styles = StyleSheet.create({
    sheet: { flex: 1, backgroundColor: '#fff' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
    },
    body: { padding: 16, paddingBottom: 40 },
    monthRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    monthLabel: { fontWeight: '700', fontSize: 17 },
    navBtn: { padding: 8, borderRadius: 10, backgroundColor: SynthTokens.colors.neutral100 },
    navBtnOff: { opacity: 0.4 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: CELL as any, alignItems: 'center', paddingVertical: 3 },
    weekday: { fontSize: 12 },
    day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    daySel: { backgroundColor: SynthTokens.colors.brandPink500 },
    dayTxt: { fontSize: 16 },
    dayTxtOff: { color: SynthTokens.colors.neutral400 },
    dayTxtSel: { color: '#fff', fontWeight: '700' },
    quickRow: { flexDirection: 'row', gap: 8, marginTop: 20, flexWrap: 'wrap' },
    quickChip: {
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 9,
        backgroundColor: SynthTokens.colors.neutral0,
    },
});
