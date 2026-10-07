export type DraftStatus = "needs_approval" | "approved" | "sent";

export interface StoredDraft {
  id: string;
  editionDate: string;
  userId: string;
  email: string;
  subject: string;
  html: string;
  contentHash: string;
  status: DraftStatus;
  approvedContentHash: string | null;
  sentAt: string | null;
}

export const contentHash = async (subject: string, html: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${subject}\n${html}`));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const canSendDraft = (
  draft: StoredDraft,
  unsubscribedEmails: Set<string>
): { ok: boolean; reason: string } => {
  const email = draft.email.trim().toLowerCase();
  if (draft.sentAt || draft.status === "sent") return { ok: false, reason: "already sent" };
  if (unsubscribedEmails.has(email)) return { ok: false, reason: "unsubscribed" };
  if (draft.status !== "approved") return { ok: false, reason: "not approved" };
  if (!draft.approvedContentHash || draft.approvedContentHash !== draft.contentHash) {
    return { ok: false, reason: "approval does not match the reviewed content" };
  }
  return { ok: true, reason: "approved exact content" };
};

export const planSend = (drafts: StoredDraft[], unsubscribedEmails: Set<string>) => {
  const send: StoredDraft[] = [];
  const skip: Array<{ id: string; reason: string }> = [];
  const seen = new Set<string>();
  for (const draft of drafts) {
    const key = `${draft.editionDate}:${draft.email.trim().toLowerCase()}`;
    if (seen.has(key)) {
      skip.push({ id: draft.id, reason: "duplicate" });
      continue;
    }
    seen.add(key);
    const decision = canSendDraft(draft, unsubscribedEmails);
    if (!decision.ok) {
      skip.push({ id: draft.id, reason: decision.reason });
      continue;
    }
    send.push(draft);
  }
  return { send, skip };
};

export const deliverApprovedDrafts = async (input: {
  drafts: StoredDraft[];
  unsubscribedEmails: Set<string>;
  claim: (draft: StoredDraft) => Promise<boolean>;
  sendEmail: (draft: StoredDraft) => Promise<void>;
  release: (draft: StoredDraft) => Promise<void>;
}) => {
  const plan = planSend(input.drafts, input.unsubscribedEmails);
  let sent = 0;
  let failed = 0;
  for (const draft of plan.send) {
    const claimed = await input.claim(draft);
    if (!claimed) continue;
    try {
      await input.sendEmail(draft);
      sent += 1;
    } catch {
      await input.release(draft);
      failed += 1;
    }
  }
  return { sent, failed, skip: plan.skip };
};

export const regenerateDecision = (
  existing: { status: DraftStatus } | null
): "replace" | "keep" => {
  if (!existing) return "replace";
  if (existing.status === "approved" || existing.status === "sent") return "keep";
  return "replace";
};
