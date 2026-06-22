import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { X, Share2 } from 'lucide-react-native';
import { SynthTokens } from '../../tokens/SynthTokens';
import { SynthText } from '../SynthText';
import { ShareAppService } from '../../services/shareAppService';
import { recordReferralShare } from '../../services/referralShareService';

const DISMISSED_KEY = 'share_with_friends_banner_dismissed';
const BANNER_MESSAGE = 'Share the app for a chance to win a $50 gift card!';

interface ShareWithFriendsBannerProps {
  referralCode?: string | null;
  source?: string;
}

export function ShareWithFriendsBanner({ referralCode, source }: ShareWithFriendsBannerProps) {
  // Start visible; AsyncStorage decides after read (avoids hiding until we know user dismissed).
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(DISMISSED_KEY).then((v) => {
      if (!mounted) return;
      setDismissed(v === 'true');
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    void AsyncStorage.setItem(DISMISSED_KEY, 'true');
  }, []);

  const handleShare = useCallback(() => {
    void recordReferralShare(source ?? 'banner');
    void ShareAppService.shareApp(referralCode ?? null);
  }, [referralCode, source]);

  if (dismissed) return null;

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <SynthText variant="meta" style={styles.message}>
        {BANNER_MESSAGE}
      </SynthText>
      <View style={styles.actions}>
        <Pressable
          onPress={handleShare}
          style={styles.shareButton}
          accessibilityRole="button"
          accessibilityLabel="Share the app"
        >
          <Share2 size={16} color={SynthTokens.colors.neutral50} />
          <SynthText variant="meta" style={styles.shareText}>
            Share
          </SynthText>
        </Pressable>
        <Pressable
          onPress={handleDismiss}
          style={styles.dismissButton}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <X size={18} color={SynthTokens.colors.neutral600} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: SynthTokens.spacing.screenMarginX,
    marginBottom: SynthTokens.spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.22)',
    backgroundColor: 'rgba(253, 242, 248, 0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  message: {
    flex: 1,
    color: SynthTokens.colors.neutral900,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: SynthTokens.colors.brandPink500,
  },
  shareText: {
    color: SynthTokens.colors.neutral50,
  },
  dismissButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(17, 17, 17, 0.10)',
  },
});

