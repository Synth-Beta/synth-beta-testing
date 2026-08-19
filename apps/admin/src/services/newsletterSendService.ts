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
