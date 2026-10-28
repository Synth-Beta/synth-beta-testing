export type DraftStatus = "needs_approval" | "approved" | "sent";
export type DeliveryState = "accepted" | "failed" | "uncertain";

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
  /** Brevo message id. Present only after Brevo accepts the message, which is not inbox delivery. */
  brevoMessageId?: string | null;
  deliveryState?: DeliveryState | null;
  sendClaimedAt?: string | null;
}

/** A claim with no acceptance record is held, not retried, once it is this old. */
export const STALE_CLAIM_MS = 2 * 60 * 1000;

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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: "invalid email" };
  if (draft.sentAt || draft.status === "sent" || draft.brevoMessageId || draft.deliveryState === "accepted") {
    return { ok: false, reason: "already sent" };
  }
  if (draft.deliveryState === "uncertain" || draft.sendClaimedAt) {
    return { ok: false, reason: "acceptance was not confirmed" };
  }
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
    const decision = canSendDraft(draft, unsubscribedEmails);
    if (!decision.ok) {
      skip.push({ id: draft.id, reason: decision.reason });
      continue;
    }
    seen.add(key);
    send.push(draft);
  }
  return { send, skip };
};

export const deliverApprovedDrafts = async (input: {
  drafts: StoredDraft[];
  unsubscribedEmails: Set<string>;
  claim: (draft: StoredDraft) => Promise<boolean>;
  sendEmail: (draft: StoredDraft) => Promise<string | void>;
  /** Marks the draft sent. Call only after Brevo returns a message id. */
  confirm?: (draft: StoredDraft, messageId: string) => Promise<boolean>;
  /** Definite provider rejection. Leaves the draft approved so a later explicit send can retry. */
  release: (draft: StoredDraft, error?: string) => Promise<void>;
  /** Timeout or lost response. Must not clear the claim. */
  hold?: (draft: StoredDraft, error: string) => Promise<void>;
}) => {
  const plan = planSend(input.drafts, input.unsubscribedEmails);
  let sent = 0;
  let failed = 0;
  let uncertain = 0;
  for (const draft of plan.send) {
    if (await contentHash(draft.subject, draft.html) !== draft.contentHash) {
      plan.skip.push({ id: draft.id, reason: "stored content does not match its hash" });
      continue;
    }
    const claimed = await input.claim(draft);
    if (!claimed) continue;
    try {
      const messageId = await input.sendEmail(draft);
      if (input.confirm) {
        if (!messageId) {
          const message = "Brevo did not return a message id. Acceptance was not confirmed.";
          if (input.hold) await input.hold(draft, message);
          uncertain += 1;
          continue;
        }
        const confirmed = await input.confirm(draft, messageId);
        if (!confirmed) {
          const message = `Brevo accepted message ${messageId} but the sent status was not saved. Do not retry until that message is reconciled.`;
          if (input.hold) await input.hold(draft, message);
          uncertain += 1;
          continue;
        }
      }
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Newsletter delivery failed.";
      if (error instanceof Error && error.name === "DeliveryUncertainError") {
        if (input.hold) await input.hold(draft, message);
        uncertain += 1;
        continue;
      }
      await input.release(draft, message);
      failed += 1;
      const stopBatch = error instanceof Error
        && error.name === "DeliveryRejectedError"
        && (error as { stopBatch?: boolean }).stopBatch === true;
      if (stopBatch) break;
    }
  }
  return { sent, failed, uncertain, skip: plan.skip };
};

/** Records prior acceptance, and holds claims that never received a Brevo message id. */
export const reconcileNewsletterDelivery = async (
  db: { from: (table: "newsletter_drafts") => any },
  editionDate: string,
) => {
  const accepted = await db.from("newsletter_drafts").update({
    status: "sent",
    sent_at: new Date().toISOString(),
    delivery_state: "accepted",
  }).eq("edition_date", editionDate).eq("status", "approved").is("sent_at", null).not("brevo_message_id", "is", null);
  if (accepted.error) throw new Error(accepted.error.message);

  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const stale = await db.from("newsletter_drafts").update({
    delivery_state: "uncertain",
    delivery_error: "Send was claimed but Brevo did not confirm acceptance. Check Brevo before any retry.",
  }).eq("edition_date", editionDate).eq("status", "approved").is("sent_at", null).is("brevo_message_id", null).not("send_claimed_at", "is", null).lt("send_claimed_at", staleBefore);
  if (stale.error) throw new Error(stale.error.message);
};

export const regenerateDecision = (
  existing: { status: DraftStatus } | null
): "replace" | "keep" => {
  if (!existing) return "replace";
  if (existing.status === "sent") return "keep";
  return "replace";
};

/** Shared by manual and scheduled delivery so a retry has the same provider key. */
export const deliveryKey = (draft: Pick<StoredDraft, "id" | "editionDate" | "contentHash">) =>
  `newsletter:${draft.editionDate}:${draft.id}:${draft.contentHash}`;
