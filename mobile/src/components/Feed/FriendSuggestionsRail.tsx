import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Check, UserPlus, X } from 'lucide-react-native';
import { createFriendRequest } from '@synth/shared';
import { supabase } from '../../integrations/supabase/client';
import { SynthTokens } from '../../tokens/SynthTokens';
import type { FriendSuggestion } from '../../services/homeFeedService';
import { PressableScale } from '../../motion/PressableScale';
import { SkeletonBox } from '../skeletons';

interface FriendSuggestionsRailProps {
  suggestions: FriendSuggestion[];
}

/** How many suggestion cards to show at once; extras fill in when one is dismissed. */
const VISIBLE_SUGGESTION_COUNT = 5;

export const FriendSuggestionsRail: React.FC<FriendSuggestionsRailProps> = ({ suggestions }) => {
  const router = useRouter();
  const [exclusionsLoaded, setExclusionsLoaded] = useState(false);
  const [excludedUserIds, setExcludedUserIds] = useState<Set<string>>(new Set());
  const [sentUserIds, setSentUserIds] = useState<Set<string>>(new Set());
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [dismissedUserIds, setDismissedUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (suggestions.length === 0) {
      setExclusionsLoaded(true);
      return;
    }
    setExclusionsLoaded(false);

    const run = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        if (!user) {
          setExclusionsLoaded(true);
          return;
        }
        const userIds = suggestions.map(s => s.user_id);

        const { data: sent } = await supabase
          .from('user_relationships')
          .select('related_user_id')
          .eq('user_id', user.id)
          .eq('relationship_type', 'friend')
          .in('status', ['pending', 'accepted'])
          .in('related_user_id', userIds);

        const { data: received } = await supabase
          .from('user_relationships')
          .select('user_id')
          .eq('related_user_id', user.id)
          .eq('relationship_type', 'friend')
          .in('status', ['pending', 'accepted'])
          .in('user_id', userIds);

        const excluded = new Set<string>();
        sent?.forEach(r => excluded.add(r.related_user_id));
        received?.forEach(r => excluded.add(r.user_id));
        setExcludedUserIds(excluded);
      } catch {
        setExcludedUserIds(new Set());
      } finally {
        setExclusionsLoaded(true);
      }
    };

    void run();
  }, [suggestions]);

  const visible = suggestions
    .filter(s => !excludedUserIds.has(s.user_id) && !dismissedUserIds.has(s.user_id))
    .slice(0, VISIBLE_SUGGESTION_COUNT);

  const onDismissSuggestion = useCallback((userId: string) => {
    setDismissedUserIds(prev => {
      if (prev.has(userId)) return prev;
      return new Set(prev).add(userId);
    });
  }, []);

  const onOpenProfile = useCallback((userId: string) => {
    router.push(`/user/${userId}` as any);
  }, [router]);

  const onAddFriend = useCallback(
    async (userId: string) => {
      if (sentUserIds.has(userId) || sendingId) return;
      setSendingId(userId);
      try {
        const result = await createFriendRequest(supabase, userId);
        if (!result.ok && result.kind === 'network') {
          return;
        }
        setSentUserIds(prev => new Set(prev).add(userId));
        setTimeout(() => {
          setExcludedUserIds(prev => new Set(prev).add(userId));
        }, 400);
      } catch (e) {
        console.error('Friend request failed:', e);
      } finally {
        setSendingId(null);
      }
    },
    [sentUserIds, sendingId]
  );

  const initials = (name: string) =>
    name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  /** One reason per person: mutual friends beat shared genres; friend-of-a-friend is the fallback. */
  const reasonFor = (s: FriendSuggestion): string => {
    if (s.mutual_friends_count > 0) {
      return `${s.mutual_friends_count} mutual friend${s.mutual_friends_count !== 1 ? 's' : ''}`;
    }
    const genres = s.shared_genres_count ?? 0;
    if (genres > 0) return `${genres} shared genre${genres !== 1 ? 's' : ''}`;
    return s.connection_depth === 2 ? 'Friend of a friend' : '';
  };

  if (!exclusionsLoaded) {
    return (
      <View style={styles.section}>
        <Text style={styles.label}>People you may know</Text>
        <View style={[styles.row, styles.skeletonRow]}>
          {[0, 1, 2].map(i => (
            <SkeletonBox key={i} width={CARD_W} height={CARD_H} borderRadius={14} />
          ))}
        </View>
      </View>
    );
  }

  if (visible.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <Text style={styles.label}>People you may know</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {visible.map(s => {
          const sent = sentUserIds.has(s.user_id);
          const reason = reasonFor(s);
          return (
            <View key={s.user_id} style={styles.card}>
              <Pressable
                onPress={() => onOpenProfile(s.user_id)}
                style={styles.cardBody}
                accessibilityRole="link"
                accessibilityLabel={`Open ${s.name}'s profile`}
              >
                {s.avatar_url ? (
                  <Image source={{ uri: s.avatar_url }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitials}>{initials(s.name)}</Text>
                  </View>
                )}
                <View style={styles.textCol}>
                  <Text style={styles.name} numberOfLines={1}>
                    {s.name}
                  </Text>
                  {reason ? (
                    <Text style={styles.meta} numberOfLines={1}>
                      {reason}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
              <PressableScale
                haptic="light"
                style={[styles.addBtn, sent && styles.addBtnSent]}
                onPress={() => {
                  void onAddFriend(s.user_id);
                }}
                disabled={sent || sendingId === s.user_id}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={sent ? 'Friend request sent' : `Add ${s.name}`}
              >
                {sendingId === s.user_id ? (
                  <ActivityIndicator size="small" color={SynthTokens.colors.brandPink500} />
                ) : sent ? (
                  <Check size={16} color={SynthTokens.colors.success} />
                ) : (
                  <UserPlus size={16} color={SynthTokens.colors.brandPink500} />
                )}
              </PressableScale>
              <Pressable
                onPress={() => onDismissSuggestion(s.user_id)}
                style={styles.dismissBtn}
                hitSlop={{ top: 12, bottom: 12, left: 2, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Dismiss ${s.name}`}
              >
                <X size={14} color={SynthTokens.colors.neutral400} strokeWidth={2.25} />
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

/** Row cards: ~1.5 fit on a phone, so the rail reads as scrollable and costs one row of height. */
const CARD_W = 260;
const CARD_H = 64;

const styles = StyleSheet.create({
  section: {
    marginTop: SynthTokens.spacing.xs,
    marginBottom: SynthTokens.spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: SynthTokens.colors.neutral600,
    paddingHorizontal: SynthTokens.spacing.md,
    marginBottom: 8,
  },
  skeletonRow: {
    flexDirection: 'row',
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: SynthTokens.spacing.md,
    gap: 8,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: SynthTokens.colors.neutral0,
    paddingLeft: 12,
    paddingRight: 4,
    // One depth cue: a hairline ring, no colored border.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(14, 14, 14, 0.12)',
  },
  cardBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: '100%',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    backgroundColor: SynthTokens.colors.brandPink050,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 15,
    fontWeight: '600',
    color: SynthTokens.colors.brandPink500,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
    color: SynthTokens.colors.neutral900,
  },
  meta: {
    fontSize: 12,
    lineHeight: 16,
    color: SynthTokens.colors.neutral600,
  },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SynthTokens.colors.brandPink050,
    marginLeft: 8,
  },
  addBtnSent: {
    backgroundColor: SynthTokens.alpha('success', '1F'),
  },
  dismissBtn: {
    width: 28,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
