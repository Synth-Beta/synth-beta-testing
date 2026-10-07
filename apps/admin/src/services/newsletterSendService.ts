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

const readInvokeError = async (error: unknown, data: unknown) => {
  if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) {
    return String((data as { error: unknown }).error);
  }
  const context = error && typeof error === "object" && "context" in error
    ? (error as { context?: { clone?: () => { json: () => Promise<unknown>; text: () => Promise<string> } } }).context
    : undefined;
  if (context && typeof context.clone === "function") {
    try {
      const body = await context.clone().json() as { error?: unknown; message?: unknown; msg?: unknown };
      const message = body?.error || body?.message || body?.msg;
      if (message) return String(message);
    } catch {
      try {
        const text = (await context.clone().text()).trim();
        if (text) return text.slice(0, 300);
      } catch {
        // The status body was already consumed.
      }
    }
  }
  return error instanceof Error ? error.message : "Newsletter request failed.";
};

const invokeNewsletter = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("newsletter-send", { body });
  if (error) throw new Error(await readInvokeError(error, data));
  if (!data?.ok) throw new Error(data?.error || "Newsletter request failed.");
  return data;
};

export interface NewsletterApprovalRecipient {
  userId: string;
  email: string;
  name: string;
  username: string;
  approvalStatus: "approved" | "pending";
}

export const listNewsletterApprovals = async (newsletterSlug: string) => {
  const data = await invokeNewsletter({
    action: "list_approvals",
    newsletterSlug,
  });
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
  return invokeNewsletter({
    action: "set_approval",
    newsletterSlug,
    userId,
    status,
  });
};

export const getEligibleRecipientCount = async () => {
  const data = await invokeNewsletter({
    action: "get_recipients",
    includeRecipients: false,
  });
  return Number(data?.eligibleCount ?? 0);
};

export const sendTestNewsletter = async ({ newsletter, previewUserId, toEmail }: SendTestNewsletterInput) => {
  const context = await buildPersonalizationContextForUser(previewUserId);
  const resolved = resolveNewsletterForContext(newsletter, context, "resolved");
  const html = renderNewsletterHtml(resolved.newsletter, {
    mode: "email",
    absoluteBaseUrl: "https://getsynth.app",
  });

  return invokeNewsletter({
    action: "send_test",
    requestId: newRequestId(),
    newsletterSlug: newsletter.slug,
    subject: newsletter.subjectLine,
    toEmail,
    html,
    recipientUserId: previewUserId,
  });
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
