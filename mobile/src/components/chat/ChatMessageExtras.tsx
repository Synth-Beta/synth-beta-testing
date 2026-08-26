/**
 * Reactions, reply quotes and the typing indicator for the mobile chat thread.
 *
 * Kept in one file because the three pieces are small and only ever used
 * together by app/chat/[id].tsx. Mirrors the web components in
 * src/components/chat/ — same shared logic underneath, native presentation.
 */

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Reply } from 'lucide-react-native';
import {
    DEFAULT_REACTION_EMOJIS,
    formatTypingIndicator,
    type QuotedMessage,
    type ReactionSummary,
    type TypingUser,
} from '@synth/shared';
import { SynthTokens } from '../../tokens/SynthTokens';

const PINK = SynthTokens.colors.brandPink500;

/* -------------------------------------------------------------------------- */
/* Typing indicator                                                            */
/* -------------------------------------------------------------------------- */

export function TypingIndicator({ users }: { users: TypingUser[] }) {
    if (!users.length) return null;
    return (
        <View style={styles.typingRow}>
            <Text style={styles.typingText}>{formatTypingIndicator(users)}</Text>
        </View>
    );
}

/* -------------------------------------------------------------------------- */
/* Reply quote                                                                 */
/* -------------------------------------------------------------------------- */

export function ReplyQuote({
    quote,
    onSentBubble = false,
    onDismiss,
}: {
    quote: QuotedMessage;
    /** Rendered on the pink outgoing bubble, so it needs light-on-dark colours. */
    onSentBubble?: boolean;
    onDismiss?: () => void;
}) {
    const accent = onSentBubble ? 'rgba(255,255,255,0.75)' : PINK;
    const nameColor = onSentBubble ? 'rgba(255,255,255,0.95)' : SynthTokens.colors.neutral900;
    const textColor = onSentBubble ? 'rgba(255,255,255,0.75)' : SynthTokens.colors.neutral600;

    return (
        <View style={[styles.quoteRow, { borderLeftColor: accent }]}>
            <View style={styles.quoteTextWrap}>
                <Text style={[styles.quoteName, { color: nameColor }]} numberOfLines={1}>
                    {quote.sender_name}
                </Text>
                <Text style={[styles.quotePreview, { color: textColor }]} numberOfLines={1}>
                    {quote.preview}
                </Text>
            </View>
            {onDismiss ? (
                <Pressable
                    onPress={onDismiss}
                    hitSlop={10}
                    accessibilityLabel="Cancel reply"
                    style={styles.quoteDismiss}
                >
                    <Text style={styles.quoteDismissText}>✕</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

/* -------------------------------------------------------------------------- */
/* Reaction pills                                                              */
/* -------------------------------------------------------------------------- */

export function MessageReactions({
    reactions,
    isMine,
    onToggle,
}: {
    reactions: ReactionSummary[];
    isMine: boolean;
    onToggle: (emoji: string) => void;
}) {
    if (!reactions.length) return null;

    return (
        <View style={[styles.reactionRow, isMine ? styles.reactionRowMine : styles.reactionRowTheirs]}>
            {reactions.map((reaction) => (
                <Pressable
                    key={reaction.emoji}
                    onPress={() => onToggle(reaction.emoji)}
                    accessibilityLabel={`${reaction.emoji} ${reaction.count}`}
                    style={[styles.reactionPill, reaction.reactedByMe && styles.reactionPillMine]}
                >
                    <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
                    {reaction.count > 1 ? (
                        <Text style={styles.reactionCount}>{reaction.count}</Text>
                    ) : null}
                </Pressable>
            ))}
        </View>
    );
}

/* -------------------------------------------------------------------------- */
/* Long-press action sheet                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Long-pressing a message opens this: the emoji row plus Reply.
 * Touch has no hover, so an explicit sheet replaces the web's hover controls.
 */
export function MessageActionsSheet({
    visible,
    onClose,
    onReact,
    onReply,
}: {
    visible: boolean;
    onClose: () => void;
    onReact: (emoji: string) => void;
    onReply: () => void;
}) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.sheetBackdrop} onPress={onClose}>
                {/* Stops a tap inside the sheet from closing it. */}
                <Pressable style={styles.sheetCard} onPress={() => {}}>
                    <View style={styles.sheetEmojiRow}>
                        {DEFAULT_REACTION_EMOJIS.map((emoji) => (
                            <Pressable
                                key={emoji}
                                onPress={() => {
                                    onReact(emoji);
                                    onClose();
                                }}
                                accessibilityLabel={`React with ${emoji}`}
                                style={styles.sheetEmojiButton}
                            >
                                <Text style={styles.sheetEmoji}>{emoji}</Text>
                            </Pressable>
                        ))}
                    </View>

                    <Pressable
                        onPress={() => {
                            onReply();
                            onClose();
                        }}
                        style={styles.sheetAction}
                    >
                        <Reply size={18} color={SynthTokens.colors.neutral900} />
                        <Text style={styles.sheetActionText}>Reply</Text>
                    </Pressable>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    typingRow: {
        paddingHorizontal: SynthTokens.spacing.md,
        paddingBottom: 4,
    },
    typingText: {
        fontSize: 12,
        fontStyle: 'italic',
        color: SynthTokens.colors.neutral600,
    },

    quoteRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderLeftWidth: 3,
        paddingLeft: 8,
        marginBottom: 6,
        // Floor so a quoted reply reads as a rectangle rather than collapsing to
        // the width of the message text under it (same fix as web).
        minWidth: 190,
    },
    quoteTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    quoteName: {
        fontSize: 12,
        fontWeight: '600',
    },
    quotePreview: {
        fontSize: 12,
    },
    quoteDismiss: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    quoteDismissText: {
        fontSize: 14,
        color: SynthTokens.colors.neutral600,
    },

    reactionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
        marginTop: 4,
    },
    reactionRowMine: {
        justifyContent: 'flex-end',
    },
    reactionRowTheirs: {
        justifyContent: 'flex-start',
    },
    reactionPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: SynthTokens.radius.full,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        backgroundColor: SynthTokens.colors.neutral0,
    },
    reactionPillMine: {
        borderColor: PINK,
        backgroundColor: 'rgba(204, 36, 134, 0.10)',
    },
    reactionEmoji: {
        fontSize: 13,
    },
    reactionCount: {
        fontSize: 11,
        fontWeight: '600',
        color: SynthTokens.colors.neutral900,
    },

    sheetBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: SynthTokens.spacing.lg,
    },
    sheetCard: {
        width: '100%',
        maxWidth: 360,
        borderRadius: SynthTokens.radius.large,
        backgroundColor: SynthTokens.colors.neutral0,
        padding: SynthTokens.spacing.md,
        gap: SynthTokens.spacing.sm,
    },
    sheetEmojiRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    sheetEmojiButton: {
        padding: 6,
        borderRadius: SynthTokens.radius.small,
    },
    sheetEmoji: {
        fontSize: 26,
    },
    sheetAction: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SynthTokens.spacing.sm,
        paddingVertical: SynthTokens.spacing.sm,
        paddingHorizontal: 6,
        borderTopWidth: 1,
        borderTopColor: SynthTokens.colors.neutral200,
    },
    sheetActionText: {
        fontSize: 15,
        fontWeight: '500',
        color: SynthTokens.colors.neutral900,
    },
});
