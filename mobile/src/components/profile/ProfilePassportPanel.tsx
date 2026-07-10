import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { supabase } from '../../integrations/supabase/client';
import type { ProfileTimelineItem } from '../../services/passportService';
import { PassportIdentityTab } from '../passport/PassportIdentityTab';
import { PassportStampsTab } from '../passport/PassportStampsTab';
import { PassportAchievementsTab } from '../passport/PassportAchievementsTab';
import { PassportTimelineTab } from '../passport/PassportTimelineTab';
import { PassportBucketTab } from '../passport/PassportBucketTab';

const PINK = SynthTokens.colors.brandPink500;

type SubTab = 'identity' | 'stamps' | 'achievements' | 'timeline' | 'bucket';

const SUB_TABS: { key: SubTab; label: string }[] = [
    { key: 'identity', label: 'Identity' },
    { key: 'stamps', label: 'Stamps' },
    { key: 'achievements', label: 'Achievements' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'bucket', label: 'Bucket List' },
];

/**
 * Live Music Passport — orchestrates the five sub-tabs. Each tab loads its own
 * data lazily on first visit and stays mounted afterwards so switching back is
 * instant. Editing (timeline milestones/pins, bucket list) is only enabled when
 * the viewer is looking at their own passport.
 */
export function ProfilePassportPanel({
    userId,
    timeline,
    displayName,
    isOwnProfile,
}: {
    userId: string;
    timeline?: ProfileTimelineItem[];
    displayName?: string;
    /** Override ownership; when omitted it is resolved from the current session. */
    isOwnProfile?: boolean;
}) {
    const [subTab, setSubTab] = useState<SubTab>('identity');
    const [visited, setVisited] = useState<Set<SubTab>>(() => new Set(['identity']));
    const [resolvedOwn, setResolvedOwn] = useState(false);

    useEffect(() => {
        if (isOwnProfile !== undefined) return;
        let cancelled = false;
        void (async () => {
            const { data } = await supabase.auth.getUser();
            if (!cancelled) setResolvedOwn(data.user?.id === userId);
        })();
        return () => {
            cancelled = true;
        };
    }, [isOwnProfile, userId]);

    const canEdit = isOwnProfile ?? resolvedOwn;

    const selectTab = (key: SubTab) => {
        setSubTab(key);
        setVisited(prev => {
            if (prev.has(key)) return prev;
            const next = new Set(prev);
            next.add(key);
            return next;
        });
    };

    const tabContent = useMemo(
        () => ({
            identity: <PassportIdentityTab userId={userId} displayName={displayName} />,
            stamps: <PassportStampsTab userId={userId} />,
            achievements: <PassportAchievementsTab userId={userId} />,
            timeline: <PassportTimelineTab userId={userId} canEdit={canEdit} timeline={timeline} />,
            bucket: <PassportBucketTab userId={userId} canEdit={canEdit} />,
        }),
        [userId, displayName, canEdit, timeline]
    );

    return (
        <View style={styles.wrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {SUB_TABS.map(t => (
                    <Pressable
                        key={t.key}
                        onPress={() => selectTab(t.key)}
                        style={[styles.chip, subTab === t.key && styles.chipOn]}
                        accessibilityRole="button"
                    >
                        <SynthText variant="meta" style={[styles.chipTxt, subTab === t.key && styles.chipTxtOn]}>
                            {t.label}
                        </SynthText>
                    </Pressable>
                ))}
            </ScrollView>

            <View style={styles.panel}>
                {SUB_TABS.map(t =>
                    visited.has(t.key) ? (
                        <View key={t.key} style={subTab === t.key ? undefined : styles.hidden}>
                            {tabContent[t.key]}
                        </View>
                    ) : null
                )}
            </View>
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
    hidden: { display: 'none' },
});
