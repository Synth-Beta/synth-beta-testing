/** Aggregate unique featured cards (sections) across newsletter drafts. */

import { contentKeysForSource } from "./vetoes";

export type NewsletterSectionReviewStatus = "pending" | "approved" | "rejected";

export type NewsletterSectionKind = "event" | "news" | "listen" | "account";

export type DraftSourceLike = {
  kind?: string;
  label?: string;
  url?: string;
  retrievedAt?: string;
};

export type NewsletterSectionCatalogItem = {
  /** Stable identity used for status + veto rows. */
  contentKey: string;
  contentKeys: string[];
  kind: NewsletterSectionKind;
  label: string;
  url: string;
  usageCount: number;
  userIds: string[];
  emails: string[];
  draftIds: string[];
  status: NewsletterSectionReviewStatus;
};

const VETOABLE_KINDS = new Set<NewsletterSectionKind>(["event", "news", "listen", "account"]);

const primaryKey = (source: DraftSourceLike) => {
  const keys = contentKeysForSource(source);
  return keys[0] ?? "";
};

export const aggregateNewsletterSections = (
  drafts: Array<{
    id: string;
    user_id: string;
    email: string;
    status?: string;
    brevo_message_id?: string | null;
    send_claimed_at?: string | null;
    sources?: DraftSourceLike[] | null;
  }>,
  statusByKey: Map<string, NewsletterSectionReviewStatus>,
  vetoedKeys: Set<string> = new Set(),
): NewsletterSectionCatalogItem[] => {
  const byKey = new Map<string, NewsletterSectionCatalogItem>();

  for (const draft of drafts) {
    for (const source of draft.sources ?? []) {
      const kind = String(source.kind ?? "") as NewsletterSectionKind;
      if (!VETOABLE_KINDS.has(kind)) continue;
      const contentKeys = contentKeysForSource(source);
      const contentKey = primaryKey(source);
      if (!contentKey) continue;

      const existing = byKey.get(contentKey);
      if (existing) {
        existing.usageCount += 1;
        if (!existing.userIds.includes(draft.user_id)) existing.userIds.push(draft.user_id);
        if (!existing.emails.includes(draft.email)) existing.emails.push(draft.email);
        if (!existing.draftIds.includes(draft.id)) existing.draftIds.push(draft.id);
        for (const key of contentKeys) {
          if (!existing.contentKeys.includes(key)) existing.contentKeys.push(key);
        }
        continue;
      }

      const stored = statusByKey.get(contentKey);
      const status: NewsletterSectionReviewStatus = stored
        ?? (vetoedKeys.has(contentKey) || contentKeys.some((key) => vetoedKeys.has(key)) ? "rejected" : "pending");

      byKey.set(contentKey, {
        contentKey,
        contentKeys,
        kind,
        label: String(source.label ?? "").trim() || contentKey,
        url: String(source.url ?? "").trim(),
        usageCount: 1,
        userIds: [draft.user_id],
        emails: [draft.email],
        draftIds: [draft.id],
        status,
      });
    }
  }

  return [...byKey.values()].sort((left, right) =>
    right.usageCount - left.usageCount
    || left.label.localeCompare(right.label)
  );
};

export const draftContainsSection = (
  draft: { sources?: DraftSourceLike[] | null },
  contentKeys: string[],
) => {
  const needles = new Set(contentKeys.map((value) => value.trim()).filter(Boolean));
  if (!needles.size) return false;
  for (const source of draft.sources ?? []) {
    for (const key of contentKeysForSource(source)) {
      if (needles.has(key)) return true;
    }
  }
  return false;
};

export const regenerableDraft = (draft: {
  status?: string;
  brevo_message_id?: string | null;
  send_claimed_at?: string | null;
}) =>
  draft.status !== "sent"
  && !draft.brevo_message_id
  && !draft.send_claimed_at;
