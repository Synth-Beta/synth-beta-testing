import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Check, UserPlus } from 'lucide-react-native';
import { createFriendRequest } from '@synth/shared';
import { supabase } from '../../integrations/supabase/client';
import { SynthTokens } from '../../tokens/SynthTokens';
import type { FriendSuggestion } from '../../services/homeFeedService';

interface FriendSuggestionsRailProps {
  suggestions: FriendSuggestion[];
}

export const FriendSuggestionsRail: React.FC<FriendSuggestionsRailProps> = ({ suggestions }) => {
  const [exclusionsLoaded, setExclusionsLoaded] = useState(false);
  const [excludedUserIds, setExcludedUserIds] = useState<Set<string>>(new Set());
  const [sentUserIds, setSentUserIds] = useState<Set<string>>(new Set());
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    if (suggestions.length === 0) {
      setExclusionsLoaded(true);
      return;
    }
    setExclusionsLoaded(false);

    const run = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
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

  const visible = suggestions.filter(s => !excludedUserIds.has(s.user_id));

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

  if (!exclusionsLoaded) {
    return (
      <View style={styles.section}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Who You Should Know</Text>
          <Text style={styles.subtitle}>People you may know</Text>
        </View>
        <View style={styles.skeletonRow}>
          {[0, 1, 2].map(i => (
            <View key={i} style={styles.skeletonCard} />
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
      <View style={styles.titleBlock}>
        <Text style={styles.title}>Who You Should Know</Text>
        <Text style={styles.subtitle}>People you may know</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {visible.map(s => {
          const sent = sentUserIds.has(s.user_id);
          return (
            <View key={s.user_id} style={styles.card}>
              <View style={styles.avatarWrap}>
                {s.avatar_url ? (
                  <Image source={{ uri: s.avatar_url }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitials}>{initials(s.name)}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {s.name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {s.mutual_friends_count > 0
                  ? `${s.mutual_friends_count} mutual friend${s.mutual_friends_count !== 1 ? 's' : ''}`
                  : ' '}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {(s.shared_genres_count ?? 0) > 0
                  ? `${s.shared_genres_count} shared genre${(s.shared_genres_count ?? 0) !== 1 ? 's' : ''}`
                  : ' '}
              </Text>
              <TouchableOpacity
                style={[styles.addBtn, sent && styles.addBtnSent]}
                onPress={e => {
                  e.stopPropagation();
                  void onAddFriend(s.user_id);
                }}
                disabled={sent || sendingId === s.user_id}
              >
                {sendingId === s.user_id ? (
                  <ActivityIndicator size="small" color={SynthTokens.colors.brandPink500} />
                ) : sent ? (
                  <>
                    <Check size={14} color="#16a34a" />
                    <Text style={styles.addBtnTextSent}>Sent</Text>
                  </>
                ) : (
                  <>
                    <UserPlus size={14} color={SynthTokens.colors.neutral600} />
                    <Text style={styles.addBtnText}>Add</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const CARD_W = 148;

const styles = StyleSheet.create({
  section: {
    marginBottom: SynthTokens.spacing.md,
    marginTop: SynthTokens.spacing.xs,
  },
  titleBlock: {
    alignItems: 'center',
    marginBottom: SynthTokens.spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: SynthTokens.colors.neutral600,
    marginTop: 2,
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  skeletonCard: {
    width: CARD_W,
    height: 200,
    borderRadius: 16,
    backgroundColor: SynthTokens.colors.neutral100,
  },
  row: {
    paddingHorizontal: SynthTokens.spacing.md,
    gap: 12,
    paddingBottom: 8,
  },
  card: {
    width: CARD_W,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.25)',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  avatarWrap: {
    marginBottom: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarFallback: {
    backgroundColor: 'rgba(236, 72, 153, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 22,
    fontWeight: '600',
    color: SynthTokens.colors.brandPink500,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: SynthTokens.colors.neutral900,
    textAlign: 'center',
    width: '100%',
    marginBottom: 4,
  },
  meta: {
    fontSize: 11,
    color: SynthTokens.colors.neutral600,
    textAlign: 'center',
    width: '100%',
    minHeight: 14,
  },
  addBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: '100%',
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral50,
  },
  addBtnSent: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: SynthTokens.colors.neutral600,
  },
  addBtnTextSent: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16a34a',
  },
});
