import React, { useState } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';

export const AI_AUTHOR_TYPE = 'ai_scene_guide';
/** User-facing label — do not say "AI". */
export const AI_DISCLOSURE_LABEL = 'Scene Guide';
/** Older messages may still carry this metadata value. */
export const LEGACY_AI_DISCLOSURE_LABEL = 'AI Scene Guide';
export const AI_ROOM_NOTICE = '';

export const AI_PROFILE_COPY = {
  operatedBy: 'Scene Guide operated by Synth',
  whatItDoes:
    'Shares sourced concert updates, artist context, and conversation starters. It does not attend shows or speak as a real person.',
  whySeeingThis:
    'Scene guides keep genre rooms from going quiet so fans have something to react to while the conversation grows.',
};

export function isAiSceneGuideMessage(message: {
  author_type?: string | null;
  metadata?: Record<string, unknown> | null;
}): boolean {
  if (message.author_type === AI_AUTHOR_TYPE) return true;
  const meta = message.metadata ?? {};
  return (
    meta.author_type === AI_AUTHOR_TYPE ||
    meta.disclosure_label === AI_DISCLOSURE_LABEL ||
    meta.disclosure_label === LEGACY_AI_DISCLOSURE_LABEL
  );
}

/** @deprecated Kept for imports; no longer rendered in consumer chat. */
export function AiBadge() {
  return null;
}

export function AiSceneGuideRoomNotice({
  muted,
  onMute,
}: {
  muted?: boolean;
  onMute?: () => void;
}) {
  if (!onMute) return null;
  return (
    <View style={styles.notice}>
      <Pressable onPress={onMute} style={styles.muteBtn}>
        <SynthText style={styles.muteText}>{muted ? 'Guides muted' : 'Mute scene guides'}</SynthText>
      </Pressable>
    </View>
  );
}

export function AiGuideMessageBubble({
  content,
  containsSetlistSpoiler,
}: {
  content: string;
  containsSetlistSpoiler?: boolean;
  senderName?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <View style={styles.bubble}>
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
      <SynthText style={{ fontWeight: '700' }}>{AI_DISCLOSURE_LABEL}</SynthText>
      <SynthText>{AI_PROFILE_COPY.operatedBy}</SynthText>
      <SynthText style={{ color: SynthTokens.colors.neutral600 }}>{AI_PROFILE_COPY.whatItDoes}</SynthText>
      <SynthText style={{ color: SynthTokens.colors.neutral600 }}>{AI_PROFILE_COPY.whySeeingThis}</SynthText>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    marginHorizontal: 12,
    marginVertical: 8,
    padding: 4,
    alignItems: 'flex-end',
  },
  muteBtn: {
    alignSelf: 'flex-end',
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
