import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type NewsletterSendAction = "get_recipients" | "send_test" | "send_batch";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
const unsubscribeSecret = Deno.env.get("NEWSLETTER_UNSUBSCRIBE_SECRET") ?? "";
const publicSiteUrl = Deno.env.get("PUBLIC_SITE_URL") ?? "https://getsynth.app";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const adminClient = createClient(supabaseUrl, serviceRoleKey);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

const signEmail = async (email: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(unsubscribeSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(normalizeEmail(email)));
  return toHex(new Uint8Array(sig));
};

const buildUnsubscribeUrl = async (email: string, newsletterSlug: string) => {
  const token = await signEmail(email);
  const base = `${supabaseUrl}/functions/v1/newsletter-unsubscribe`;
  return `${base}?email=${encodeURIComponent(normalizeEmail(email))}&token=${encodeURIComponent(token)}&slug=${encodeURIComponent(newsletterSlug)}&next=${encodeURIComponent(publicSiteUrl)}`;
};

const injectUnsubscribeLink = (html: string, unsubscribeUrl: string) => {
  if (/>\s*Unsubscribe\s*</i.test(html)) {
    return html.replace(
      /href="[^"]*"\s*style="color:#8A8F98;text-decoration:underline;">Unsubscribe<\/a>/i,
      `href="${unsubscribeUrl}" style="color:#8A8F98;text-decoration:underline;">Unsubscribe</a>`
    );
  }
  const fallbackSnippet = `<div style="font-size:12px;line-height:1.6;font-weight:500;margin-top:10px;"><a href="${unsubscribeUrl}" style="color:#8A8F98;text-decoration:underline;">Unsubscribe</a></div>`;
  if (html.includes("</body>")) {
    return html.replace("</body>", `${fallbackSnippet}</body>`);
  }
  return `${html}\n${fallbackSnippet}`;
};

const authenticateAdmin = async (authorizationHeader: string | null) => {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return { error: "Missing authorization token." };
  }

  const token = authorizationHeader.replace("Bearer ", "").trim();
  const { data: authData, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !authData.user) {
    return { error: "Invalid session." };
  }

  const { data: userRecord, error: userError } = await adminClient
    .from("users")
    .select("user_id, account_type, name")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (userError || !userRecord || userRecord.account_type !== "admin") {
    return { error: "Admin access required." };
  }

  return { userId: authData.user.id, userName: userRecord.name ?? "Admin" };
};

const getEligibleRecipients = async () => {
  const { data: users, error } = await adminClient
    .from("users")
    .select("user_id, email, name, account_status, is_bot")
    .eq("account_status", "active")
    .or("is_bot.is.false,is_bot.is.null")
    .not("email", "is", null);

  if (error) {
    throw new Error(`Failed to query users: ${error.message}`);
  }

  const { data: unsubscribes } = await adminClient
    .from("newsletter_unsubscribes")
    .select("email");
  const unsubscribeSet = new Set((unsubscribes ?? []).map((row) => normalizeEmail(String(row.email))));

  const recipients = (users ?? [])
    .filter((row) => row.email && isValidEmail(row.email))
    .filter((row) => !unsubscribeSet.has(normalizeEmail(String(row.email))))
    .map((row) => ({
      userId: row.user_id,
      email: normalizeEmail(String(row.email)),
      name: row.name ?? "",
    }));

  return recipients;
};

const resendSend = async (payload: Record<string, unknown>) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message ?? `Resend request failed (${response.status})`);
  }
  return body;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed." });

  if (!resendApiKey) return json(500, { ok: false, error: "RESEND_API_KEY is not configured." });
  if (!resendFromEmail) return json(500, { ok: false, error: "RESEND_FROM_EMAIL is not configured." });
  if (!unsubscribeSecret) {
    return json(500, { ok: false, error: "NEWSLETTER_UNSUBSCRIBE_SECRET is not configured." });
  }

  const auth = await authenticateAdmin(req.headers.get("Authorization"));
  if ("error" in auth) return json(403, { ok: false, error: auth.error });

  try {
    const body = await req.json();
    const action = body?.action as NewsletterSendAction;

    if (action === "get_recipients") {
      const recipients = await getEligibleRecipients();
      return json(200, {
        ok: true,
        eligibleCount: recipients.length,
        recipients: body?.includeRecipients ? recipients : undefined,
      });
    }

    if (action === "send_test") {
      const requestId = String(body?.requestId ?? "");
      const toEmail = normalizeEmail(String(body?.toEmail ?? ""));
      const subject = String(body?.subject ?? "").trim();
      const html = String(body?.html ?? "");
      const newsletterSlug = String(body?.newsletterSlug ?? "newsletter");

      if (!requestId) return json(400, { ok: false, error: "requestId is required." });
      if (!isValidEmail(toEmail)) return json(400, { ok: false, error: "Valid toEmail is required." });
      if (!subject) return json(400, { ok: false, error: "Subject is required." });
      if (!html) return json(400, { ok: false, error: "HTML payload is required." });

      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const recentJob = await adminClient
        .from("newsletter_send_jobs")
        .select("id, status, created_at")
        .eq("newsletter_slug", newsletterSlug)
        .eq("target_email", toEmail)
        .eq("send_type", "test")
        .in("status", ["processing", "completed"])
        .gte("created_at", tenMinutesAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recentJob.data) {
        return json(409, {
          ok: false,
          error: "A recent test send already exists for this recipient. Wait a few minutes before retrying.",
        });
      }

      const { error: lockError } = await adminClient.from("newsletter_send_jobs").insert({
        request_id: requestId,
        newsletter_slug: newsletterSlug,
        send_type: "test",
        initiated_by: auth.userId,
        target_email: toEmail,
        status: "processing",
        total_recipients: 1,
      });

      if (lockError) {
        if (lockError.code === "23505") {
          return json(409, { ok: false, error: "Duplicate request blocked (already submitted)." });
        }
        return json(500, { ok: false, error: lockError.message });
      }

      try {
        const { data: unsubscribed } = await adminClient
          .from("newsletter_unsubscribes")
          .select("id")
          .eq("email", toEmail)
          .maybeSingle();
        if (unsubscribed) {
          throw new Error("This address is unsubscribed and cannot receive newsletters.");
        }

        const unsubscribeUrl = await buildUnsubscribeUrl(toEmail, newsletterSlug);
        const htmlWithUnsubscribe = injectUnsubscribeLink(html, unsubscribeUrl);

        const resendPayload = {
          from: resendFromEmail,
          to: [toEmail],
          subject,
          html: htmlWithUnsubscribe,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        };
        const resendResult = await resendSend(resendPayload);

        await adminClient
          .from("newsletter_send_jobs")
          .update({
            status: "completed",
            success_count: 1,
            failure_count: 0,
            resend_batch_id: resendResult?.id ?? null,
          })
          .eq("request_id", requestId);

        return json(200, {
          ok: true,
          requestId,
          resendId: resendResult?.id ?? null,
        });
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : String(sendError);
        await adminClient
          .from("newsletter_send_jobs")
          .update({
            status: "failed",
            success_count: 0,
            failure_count: 1,
            error_message: message,
          })
          .eq("request_id", requestId);
        return json(500, { ok: false, error: message });
      }
    }

    if (action === "send_batch") {
      const requestId = String(body?.requestId ?? "");
      const newsletterSlug = String(body?.newsletterSlug ?? "newsletter");
      const messages = Array.isArray(body?.messages) ? body.messages : [];
      if (!requestId) return json(400, { ok: false, error: "requestId is required." });
      if (messages.length === 0) return json(400, { ok: false, error: "No messages provided." });

      const { error: lockError } = await adminClient.from("newsletter_send_jobs").insert({
        request_id: requestId,
        newsletter_slug: newsletterSlug,
        send_type: "batch",
        initiated_by: auth.userId,
        status: "processing",
        total_recipients: messages.length,
      });
      if (lockError) {
        if (lockError.code === "23505") {
          return json(409, { ok: false, error: "Duplicate request blocked (already submitted)." });
        }
        return json(500, { ok: false, error: lockError.message });
      }

      const unsubscribedRows = await adminClient.from("newsletter_unsubscribes").select("email");
      const unsubscribeSet = new Set(
        (unsubscribedRows.data ?? []).map((row) => normalizeEmail(String(row.email)))
      );

      let successCount = 0;
      let failureCount = 0;
      const failures: Array<{ email: string; error: string }> = [];

      for (const item of messages) {
        const toEmail = normalizeEmail(String(item?.toEmail ?? ""));
        const subject = String(item?.subject ?? "").trim();
        const html = String(item?.html ?? "");
        if (!toEmail || !subject || !html || !isValidEmail(toEmail) || unsubscribeSet.has(toEmail)) {
          failureCount += 1;
          failures.push({ email: toEmail || "(missing)", error: "Skipped (invalid or unsubscribed)." });
          continue;
        }

        try {
          const unsubscribeUrl = await buildUnsubscribeUrl(toEmail, newsletterSlug);
          const htmlWithUnsubscribe = injectUnsubscribeLink(html, unsubscribeUrl);
          await resendSend({
            from: resendFromEmail,
            to: [toEmail],
            subject,
            html: htmlWithUnsubscribe,
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          });
          successCount += 1;
        } catch (error) {
          failureCount += 1;
          failures.push({
            email: toEmail,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      await adminClient
        .from("newsletter_send_jobs")
        .update({
          status: failureCount === 0 ? "completed" : successCount > 0 ? "completed" : "failed",
          success_count: successCount,
          failure_count: failureCount,
          error_message: failures.length > 0 ? JSON.stringify(failures.slice(0, 10)) : null,
        })
        .eq("request_id", requestId);

      return json(200, {
        ok: true,
        requestId,
        successCount,
        failureCount,
        failures,
      });
    }

    return json(400, { ok: false, error: "Unsupported action." });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(500, { ok: false, error: message });
  }
});
