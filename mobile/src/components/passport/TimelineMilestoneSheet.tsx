import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';
import { X } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import type { ProfileTimelineItem } from '../../services/passportService';
import { PassportTimelineService, type TimelineMeta } from '../../services/passportTimelineService';

const PINK = SynthTokens.colors.brandPink500;

type MilestoneType = 'best_setlist' | 'first_artist' | 'first_venue' | 'custom';

const MILESTONE_OPTIONS: { key: MilestoneType; label: string }[] = [
    { key: 'best_setlist', label: 'Best setlist' },
    { key: 'first_artist', label: 'First time seeing artist' },
    { key: 'first_venue', label: 'First time at venue' },
    { key: 'custom', label: 'Custom' },
];

/** "Artist @ Venue" → { artist, venue } (either side may be missing). */
function splitTitle(title: string): { artist: string | null; venue: string | null } {
    const idx = title.indexOf(' @ ');
    if (idx === -1) return { artist: title || null, venue: null };
    return { artist: title.slice(0, idx) || null, venue: title.slice(idx + 3) || null };
}

function detectType(significance: string | null): MilestoneType {
    const sig = (significance || '').toLowerCase();
    if (sig.includes('best setlist')) return 'best_setlist';
    if (sig.includes('first time seeing')) return 'first_artist';
    if (sig.includes('first time at')) return 'first_venue';
    return 'custom';
}

export function TimelineMilestoneSheet({
    visible,
    userId,
    item,
    existingMeta,
    onClose,
    onSaved,
}: {
    visible: boolean;
    userId: string;
    item: ProfileTimelineItem | null;
    existingMeta: TimelineMeta | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const hasExisting = !!existingMeta?.significance;
    const [milestoneType, setMilestoneType] = useState<MilestoneType>('best_setlist');
    const [customName, setCustomName] = useState('');
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!visible) return;
        if (hasExisting && existingMeta) {
            const type = detectType(existingMeta.significance);
            setMilestoneType(type);
            setCustomName(type === 'custom' ? existingMeta.significance || '' : '');
            setDescription(existingMeta.description || '');
        } else {
            setMilestoneType('best_setlist');
            setCustomName('');
            setDescription('');
        }
    }, [visible, hasExisting, existingMeta]);

    const names = useMemo(() => splitTitle(item?.title || ''), [item]);
    const showDescription = milestoneType === 'best_setlist' || milestoneType === 'custom';

    const buildSignificance = (): string | null => {
        if (milestoneType === 'best_setlist') return 'Best setlist';
        if (milestoneType === 'first_artist') return `First time seeing ${names.artist || 'this artist'}`;
        if (milestoneType === 'first_venue') return `First time at ${names.venue || 'this venue'}`;
        const name = customName.trim();
        return name || null;
    };

    const handleSave = async () => {
        if (!item) return;
        const significance = buildSignificance();
        if (!significance) {
            Alert.alert('Name your milestone', 'Give your custom milestone a short name first.');
            return;
        }
        setSaving(true);
        try {
            await PassportTimelineService.saveMilestone(
                userId,
                item.id,
                significance,
                showDescription && description.trim() ? description.trim() : null,
                item.title || null
            );
            onSaved();
            onClose();
        } catch (e) {
            Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = () => {
        if (!existingMeta) return;
        Alert.alert('Remove milestone', 'Remove this milestone from your timeline?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: () =>
                    void (async () => {
                        setSaving(true);
                        try {
                            await PassportTimelineService.removeMilestone(userId, existingMeta);
                            onSaved();
                            onClose();
                        } catch (e) {
                            Alert.alert('Could not remove', e instanceof Error ? e.message : 'Please try again.');
                        } finally {
                            setSaving(false);
                        }
                    })(),
            },
        ]);
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
                <View style={styles.sheet}>
                    <View style={styles.grabber} />
                    <View style={styles.headerRow}>
                        <SynthText variant="h2" style={styles.headerTitle}>
                            {hasExisting ? 'Edit milestone' : 'Add milestone'}
                        </SynthText>
                        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                            <X size={20} color={SynthTokens.colors.neutral600} />
                        </Pressable>
                    </View>

                    {item ? (
                        <SynthText variant="meta" color="secondary" numberOfLines={1} style={styles.showLine}>
                            {item.title}
                        </SynthText>
                    ) : null}

                    <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
                        <SynthText variant="meta" style={styles.label}>
                            What makes this moment significant?
                        </SynthText>
                        <View style={styles.typeRow}>
                            {MILESTONE_OPTIONS.map(opt => {
                                const active = milestoneType === opt.key;
                                return (
                                    <Pressable
                                        key={opt.key}
                                        style={[styles.typeChip, active && styles.typeChipOn]}
                                        onPress={() => setMilestoneType(opt.key)}
                                        accessibilityRole="button"
                                    >
                                        <SynthText variant="meta" style={[styles.typeChipTxt, active && styles.typeChipTxtOn]}>
                                            {opt.label}
                                        </SynthText>
                                    </Pressable>
                                );
                            })}
                        </View>

                        {milestoneType === 'custom' ? (
                            <>
                                <SynthText variant="meta" style={styles.label}>
                                    Milestone name
                                </SynthText>
                                <TextInput
                                    style={styles.input}
                                    placeholder="e.g. First festival, best encore…"
                                    placeholderTextColor={SynthTokens.colors.neutral400}
                                    value={customName}
                                    onChangeText={setCustomName}
                                    maxLength={100}
                                />
                            </>
                        ) : null}

                        {showDescription ? (
                            <>
                                <SynthText variant="meta" style={styles.label}>
                                    {milestoneType === 'best_setlist' ? 'Why was this the best setlist?' : 'Description (optional)'}
                                </SynthText>
                                <TextInput
                                    style={[styles.input, styles.textarea]}
                                    placeholder="Tell the story…"
                                    placeholderTextColor={SynthTokens.colors.neutral400}
                                    value={description}
                                    onChangeText={setDescription}
                                    multiline
                                    maxLength={500}
                                />
                                <SynthText variant="meta" color="secondary" style={styles.counter}>
                                    {description.length}/500
                                </SynthText>
                            </>
                        ) : null}

                        <Pressable
                            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                            onPress={() => void handleSave()}
                            disabled={saving}
                            accessibilityRole="button"
                        >
                            <SynthText variant="meta" style={styles.saveTxt}>
                                {saving ? 'Saving…' : hasExisting ? 'Update milestone' : 'Add to timeline'}
                            </SynthText>
                        </Pressable>

                        {hasExisting ? (
                            <Pressable style={styles.deleteBtn} onPress={handleDelete} disabled={saving} accessibilityRole="button">
                                <SynthText variant="meta" style={styles.deleteTxt}>
                                    Remove milestone
                                </SynthText>
                            </Pressable>
                        ) : null}
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: SynthTokens.colors.overlay50 },
    kav: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: SynthTokens.colors.neutral0,
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: Platform.OS === 'ios' ? 34 : 20,
        maxHeight: '85%',
    },
    grabber: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: SynthTokens.colors.neutral200,
        marginBottom: 12,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    headerTitle: { fontSize: 20 },
    showLine: { marginBottom: 14 },
    label: { fontWeight: '700', marginBottom: 8, marginTop: 8 },
    typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
    typeChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: SynthTokens.colors.neutral100,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },
    typeChipOn: { backgroundColor: SynthTokens.colors.brandPink050, borderColor: PINK },
    typeChipTxt: { fontSize: 13, fontWeight: '600', color: SynthTokens.colors.neutral600 },
    typeChipTxtOn: { color: PINK },
    input: {
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 11,
        fontSize: 15,
        fontFamily: SynthTokens.typography.fontFamily.medium,
        color: SynthTokens.colors.neutral900,
        backgroundColor: SynthTokens.colors.neutral50,
    },
    textarea: { minHeight: 96, textAlignVertical: 'top' },
    counter: { textAlign: 'right', marginTop: 4, fontSize: 12 },
    saveBtn: {
        marginTop: 16,
        backgroundColor: PINK,
        borderRadius: 999,
        paddingVertical: 13,
        alignItems: 'center',
    },
    saveBtnDisabled: { opacity: 0.6 },
    saveTxt: { color: '#fff', fontWeight: '800' },
    deleteBtn: { marginTop: 10, alignItems: 'center', paddingVertical: 10 },
    deleteTxt: { color: SynthTokens.colors.error, fontWeight: '700' },
});
