import { supabase } from "@/integrations/supabase/client";
import { buildPersonalizationContextForUser, resolveNewsletterForContext } from "@/lib/newsletterPersonalization";
import { renderNewsletterHtml } from "@/lib/newsletterRenderer";
import { NewsletterIssue } from "@/types/newsletter";

export interface SendTestNewsletterInput {
  newsletter: NewsletterIssue;
  previewUserId: string;
  toEmail: string;
}

const newRequestId = () => crypto.randomUUID();

export interface NewsletterApprovalRecipient {
  userId: string;
  email: string;
  name: string;
  username: string;
  approvalStatus: "approved" | "pending";
}

export const listNewsletterApprovals = async (newsletterSlug: string) => {
  const { data, error } = await supabase.functions.invoke("newsletter-send", {
    body: {
      action: "list_approvals",
      newsletterSlug,
    },
  });
  if (error) throw new Error(error.message || "Unable to load newsletters to proof.");
  if (!data?.ok) throw new Error(data?.error || "Unable to load newsletters to proof.");
  return (data.recipients ?? []) as NewsletterApprovalRecipient[];
};

export const setNewsletterApproval = async ({
  newsletterSlug,
  userId,
  status,
}: {
  newsletterSlug: string;
  userId: string;
  status: "approved" | "revoked";
}) => {
  const { data, error } = await supabase.functions.invoke("newsletter-send", {
    body: {
      action: "set_approval",
      newsletterSlug,
      userId,
      status,
    },
  });
  if (error) throw new Error(error.message || "Unable to update approval.");
  if (!data?.ok) throw new Error(data?.error || "Unable to update approval.");
  return data;
};

export const getEligibleRecipientCount = async () => {
  const { data, error } = await supabase.functions.invoke("newsletter-send", {
    body: {
      action: "get_recipients",
      includeRecipients: false,
    },
  });
  if (error) throw new Error(error.message || "Unable to fetch recipient eligibility.");
  return Number(data?.eligibleCount ?? 0);
};

export const sendTestNewsletter = async ({ newsletter, previewUserId, toEmail }: SendTestNewsletterInput) => {
  const context = await buildPersonalizationContextForUser(previewUserId);
  const resolved = resolveNewsletterForContext(newsletter, context, "resolved");
  const html = renderNewsletterHtml(resolved.newsletter, {
    mode: "email",
    absoluteBaseUrl: "https://getsynth.app",
  });

  const { data, error } = await supabase.functions.invoke("newsletter-send", {
    body: {
      action: "send_test",
      requestId: newRequestId(),
      newsletterSlug: newsletter.slug,
      subject: newsletter.subjectLine,
      toEmail,
      html,
      recipientUserId: previewUserId,
    },
  });
  if (error) throw new Error(error.message || "Test send failed.");
  if (!data?.ok) throw new Error(data?.error || "Test send failed.");
  return data;
};

const invokeNewsletter = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("newsletter-send", { body });
  if (error) {
    let detail = error.message || "Newsletter request failed.";
    try {
      const response = (error as { context?: Response }).context;
      if (response) detail = (await response.clone().json())?.error || detail;
    } catch { /* Preserve the original error if the response isn't JSON. */ }
    throw new Error(detail);
  }
  if (!data?.ok) throw new Error(data?.error || "Newsletter request failed.");
  return data;
};

export interface NewsletterDraftRow {
  id: string;
  edition_date: string;
  user_id: string;
  email: string;
  subject: string;
  preheader: string;
  html: string;
  content_hash: string;
  sources: Array<{ label: string; url: string; retrievedAt?: string }>;
  retrieved_at: string;
  status: "needs_approval" | "approved" | "sent";
  approved_content_hash: string | null;
  sent_at: string | null;
}

export const listNewsletterDrafts = async (editionDate: string) => {
  const data = await invokeNewsletter({ action: "list_drafts", editionDate });
  return (data.drafts ?? []) as NewsletterDraftRow[];
};

export const loadNewsletterSource = async () => invokeNewsletter({ action: "source_edition" });

export const saveNewsletterDrafts = async (
  editionDate: string,
  drafts: Array<{
    userId: string;
    email: string;
    subject: string;
    preheader: string;
    html: string;
    sources: unknown;
  }>
) => invokeNewsletter({ action: "upsert_drafts", editionDate, drafts });

export const setDraftApproval = async (draftId: string, status: "approved" | "needs_approval") =>
  invokeNewsletter({ action: "set_draft_approval", draftId, status });

export const approveDrafts = async (editionDate: string, draftIds?: string[]) =>
  invokeNewsletter({ action: "approve_all_drafts", editionDate, draftIds: draftIds ?? null });

/** Explicit admin action; sends only already approved exact-content drafts. */
export const sendApprovedEditionNow = async (editionDate: string) =>
  invokeNewsletter({ action: "send_batch", editionDate, requestId: newRequestId() });
