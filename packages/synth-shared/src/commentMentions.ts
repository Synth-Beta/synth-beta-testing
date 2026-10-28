/**
 * Structured @mentions in comment text.
 * Stored as: @[username](user:<uuid>)
 * Displayed as: @username (styled by the UI)
 */

export const COMMENT_MENTION_TOKEN_RE =
  /@\[([^\]]+)\]\(user:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

export type CommentMentionSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; username: string; userId: string; raw: string };

export function buildCommentMentionToken(username: string, userId: string): string {
  const clean = (username || 'user').replace(/[\[\]]/g, '').trim() || 'user';
  return `@[${clean}](user:${userId})`;
}

/** Prefill shown in the reply input (friendly @handle, not the storage token). */
export function buildReplyMentionPrefill(username: string): string {
  const clean = (username || 'user').replace(/^@/, '').trim() || 'user';
  return `@${clean} `;
}

export function extractMentionedUserIds(text: string): string[] {
  if (!text) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(COMMENT_MENTION_TOKEN_RE.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const id = match[2];
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Convert a friendly `@username ` prefix into a storage token when the caller
 * knows which user was being replied to. Leaves the rest of the message intact.
 */
export function materializeReplyMention(
  text: string,
  replyTo: { userId: string; username: string } | null | undefined
): string {
  if (!replyTo?.userId) return text;
  const username = (replyTo.username || 'user').replace(/^@/, '').trim() || 'user';
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefixRe = new RegExp(`^@${escaped}\\s*`, 'i');
  if (!prefixRe.test(text)) {
    // If the user deleted the @handle, still attach the mention for notifications
    // only when the text still starts with @ — otherwise leave as-is.
    return text;
  }
  const token = buildCommentMentionToken(username, replyTo.userId);
  return text.replace(prefixRe, `${token} `);
}

export function parseCommentMentionSegments(text: string): CommentMentionSegment[] {
  if (!text) return [];
  const segments: CommentMentionSegment[] = [];
  const re = new RegExp(COMMENT_MENTION_TOKEN_RE.source, 'gi');
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({
      type: 'mention',
      username: match[1],
      userId: match[2],
      raw: match[0],
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  if (segments.length === 0) {
    segments.push({ type: 'text', value: text });
  }
  return segments;
}

/** Plain-text fallback for previews / accessibility. */
export function commentTextToPlain(text: string): string {
  return text.replace(COMMENT_MENTION_TOKEN_RE, '@$1');
}
