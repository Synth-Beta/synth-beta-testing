import React, { useState } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';

export const AI_AUTHOR_TYPE = 'ai_scene_guide';
export const AI_DISCLOSURE_LABEL = 'AI Scene Guide';
export const AI_ROOM_NOTICE =
  'This room includes AI Scene Guides that share sourced concert updates and conversation starters.';

export const AI_PROFILE_COPY = {
  operatedBy: 'AI Scene Guide operated by Synth',
  whatItDoes:
    'Shares sourced concert updates, artist context, and conversation starters. It does not attend shows or speak as a real person.',
  whySeeingThis:
    'Why am I seeing this? Genre rooms use disclosed AI guides so new rooms are not empty while real fans join the conversation.',
};

export function isAiSceneGuideMessage(message: {
  author_type?: string | null;
  metadata?: Record<string, unknown> | null;
}): boolean {
  if (message.author_type === AI_AUTHOR_TYPE) return true;
  const meta = message.metadata ?? {};
  return meta.author_type === AI_AUTHOR_TYPE || meta.disclosure_label === AI_DISCLOSURE_LABEL;
}

export function AiBadge() {
  return (
    <View style={styles.badge}>
      <SynthText style={styles.badgeText}>AI</SynthText>
    </View>
  );
}

export function AiSceneGuideRoomNotice({
  muted,
  onMute,
}: {
  muted?: boolean;
  onMute?: () => void;
}) {
  return (
    <View style={styles.notice}>
      <SynthText style={styles.noticeText}>{AI_ROOM_NOTICE}</SynthText>
      {onMute ? (
        <Pressable onPress={onMute} style={styles.muteBtn}>
          <SynthText style={styles.muteText}>{muted ? 'AI muted' : 'Mute AI Scene Guides'}</SynthText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function AiGuideMessageBubble({
  content,
  containsSetlistSpoiler,
  senderName,
}: {
  content: string;
  containsSetlistSpoiler?: boolean;
  senderName?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <View style={styles.bubble}>
      <View style={styles.row}>
        <AiBadge />
        <SynthText style={styles.label}>{senderName ? `${senderName} · ` : ''}{AI_DISCLOSURE_LABEL}</SynthText>
      </View>
      {containsSetlistSpoiler && !revealed ? (
        <Pressable onPress={() => setRevealed(true)} style={styles.spoiler}>
          <SynthText style={styles.spoilerText}>Show setlist spoiler</SynthText>
        </Pressable>
      ) : (
        <SynthText style={styles.body}>{content}</SynthText>
      )}
    </View>
  );
}

export function AiSceneGuideProfileCopy() {
  return (
    <View style={{ gap: 8, padding: 16 }}>
      <View style={styles.row}>
        <AiBadge />
        <SynthText style={{ fontWeight: '700' }}>{AI_DISCLOSURE_LABEL}</SynthText>
      </View>
      <SynthText>{AI_PROFILE_COPY.operatedBy}</SynthText>
      <SynthText style={{ color: SynthTokens.colors.neutral600 }}>{AI_PROFILE_COPY.whatItDoes}</SynthText>
      <SynthText style={{ color: SynthTokens.colors.neutral600 }}>{AI_PROFILE_COPY.whySeeingThis}</SynthText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: SynthTokens.colors.neutral200,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: SynthTokens.colors.neutral900,
  },
  notice: {
    marginHorizontal: 12,
    marginVertical: 8,
    padding: 12,
    backgroundColor: SynthTokens.colors.neutral100,
    borderRadius: 8,
    gap: 8,
  },
  noticeText: {
    fontSize: 13,
    color: SynthTokens.colors.neutral600,
    lineHeight: 18,
  },
  muteBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  muteText: { fontSize: 12 },
  bubble: {
    maxWidth: '78%',
    backgroundColor: SynthTokens.colors.neutral100,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    borderRadius: 10,
    padding: 12,
    opacity: 0.95,
    gap: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 11, color: SynthTokens.colors.neutral600 },
  body: { fontSize: 14, lineHeight: 20, color: SynthTokens.colors.neutral900 },
  spoiler: {
    backgroundColor: SynthTokens.colors.neutral200,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  spoilerText: { fontSize: 13 },
});
