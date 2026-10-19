import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const unsubscribeSecret = Deno.env.get("NEWSLETTER_UNSUBSCRIBE_SECRET") ?? "";
const publicSiteUrl = Deno.env.get("PUBLIC_SITE_URL") ?? "https://getsynth.app";

const adminClient = createClient(supabaseUrl, serviceRoleKey);

const normalizeEmail = (email: string) => email.trim().toLowerCase();

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

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const htmlResponse = (status: number, html: string) =>
  new Response(html, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const page = (title: string, body: string) => `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background:#f7f7f9; padding:24px;">
  <div style="max-width:560px; margin:40px auto; background:#fff; border:1px solid #ececec; border-radius:12px; padding:24px;">
    <h1 style="margin:0 0 12px; font-size:24px;">${escapeHtml(title)}</h1>
    ${body}
    <p style="margin:20px 0 0;"><a href="${escapeHtml(publicSiteUrl)}" style="color:#cc2486; text-decoration:none; font-weight:700;">Return to Synth</a></p>
  </div>
</body>
</html>
`;

const confirmForm = (email: string, token: string, slug: string) => page(
  "Unsubscribe?",
  `<p style="margin:0 0 16px; color:#4b5563; line-height:1.6;">Are you sure you want to unsubscribe from the Synth newsletter?</p>
   <form method="POST" style="display:flex; gap:12px; flex-wrap:wrap;">
     <input type="hidden" name="email" value="${escapeHtml(email)}" />
     <input type="hidden" name="token" value="${escapeHtml(token)}" />
     <input type="hidden" name="slug" value="${escapeHtml(slug)}" />
     <input type="hidden" name="step" value="confirm" />
     <button name="sure" value="yes" style="background:#111; color:#fff; border:0; border-radius:8px; padding:10px 16px; font-weight:700;">Yes, unsubscribe</button>
     <button name="sure" value="no" style="background:#fff; color:#111; border:1px solid #d1d5db; border-radius:8px; padding:10px 16px; font-weight:700;">No, keep my emails</button>
   </form>`
);

const emailForm = (email: string, token: string, slug: string, error: string) => page(
  "Confirm your email",
  `${error ? `<p style="margin:0 0 16px; color:#b42318; line-height:1.6;">${escapeHtml(error)}</p>` : `<p style="margin:0 0 16px; color:#4b5563; line-height:1.6;">Type the email address you want to unsubscribe.</p>`}
   <form method="POST">
     <input type="hidden" name="email" value="${escapeHtml(email)}" />
     <input type="hidden" name="token" value="${escapeHtml(token)}" />
     <input type="hidden" name="slug" value="${escapeHtml(slug)}" />
     <input type="hidden" name="step" value="email" />
     <label style="display:block; font-weight:700; margin-bottom:8px;">Email
       <input type="email" name="typed_email" required autocomplete="email" style="display:block; width:100%; margin-top:8px; box-sizing:border-box; border:1px solid #d1d5db; border-radius:8px; padding:10px 12px; font-size:16px;" />
     </label>
     <button style="margin-top:16px; background:#111; color:#fff; border:0; border-radius:8px; padding:10px 16px; font-weight:700;">Unsubscribe this email</button>
   </form>`
);

const markUnsubscribed = async (email: string) => {
  const { data, error } = await adminClient.rpc("unsubscribe_newsletter_by_email", {
    target_email: email,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!unsubscribeSecret) {
    return htmlResponse(500, page("Unable to process", "<p>Unsubscribe secret is not configured.</p>"));
  }

  try {
    const url = new URL(req.url);
    let email = url.searchParams.get("email") ?? "";
    let token = url.searchParams.get("token") ?? "";
    let newsletterSlug = url.searchParams.get("slug") ?? "newsletter";
    let step = "";
    let sure = "";
    let typedEmail = "";
    let oneClick = false;

    if (req.method === "POST") {
      const raw = await req.text();
      const contentType = req.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const body = JSON.parse(raw || "{}");
        email = String(body?.email ?? email);
        token = String(body?.token ?? token);
        newsletterSlug = String(body?.slug ?? newsletterSlug);
        step = String(body?.step ?? "");
        sure = String(body?.sure ?? "");
        typedEmail = String(body?.typed_email ?? "");
        oneClick = body?.["List-Unsubscribe"] === "One-Click";
      } else {
        const form = new URLSearchParams(raw);
        email = form.get("email") ?? email;
        token = form.get("token") ?? token;
        newsletterSlug = form.get("slug") ?? newsletterSlug;
        step = form.get("step") ?? "";
        sure = form.get("sure") ?? "";
        typedEmail = form.get("typed_email") ?? "";
        oneClick = form.get("List-Unsubscribe") === "One-Click";
      }
    }

    email = normalizeEmail(email);
    token = token.trim().toLowerCase();
    newsletterSlug = newsletterSlug.trim() || "newsletter";

    if (!email || !token) {
      return htmlResponse(400, page("Invalid link", "<p>This unsubscribe link is missing required information.</p>"));
    }

    const expectedToken = await signEmail(email);
    if (expectedToken !== token) {
      return htmlResponse(403, page("Invalid link", "<p>This unsubscribe link is not valid.</p>"));
    }

    // Mail clients post one-click unsubscribe without showing this page.
    if (oneClick) {
      const updated = await markUnsubscribed(email);
      if (!updated) {
        return jsonResponse(404, { ok: false, error: "That email is not on the newsletter list." });
      }
      return jsonResponse(200, { ok: true });
    }

    if (req.method === "GET" || !step) {
      return htmlResponse(200, confirmForm(email, token, newsletterSlug));
    }

    if (step === "confirm" && sure !== "yes") {
      return htmlResponse(200, page(
        "Still subscribed",
        "<p style=\"margin:0; color:#4b5563; line-height:1.6;\">You are still subscribed. Nothing was changed.</p>"
      ));
    }

    if (step === "confirm") {
      return htmlResponse(200, emailForm(email, token, newsletterSlug, ""));
    }

    const updated = await markUnsubscribed(typedEmail);
    if (!updated) {
      return htmlResponse(200, emailForm(
        email,
        token,
        newsletterSlug,
        "That email doesn't match an email in our list. Type it again."
      ));
    }

    return htmlResponse(200, page(
      "You're unsubscribed",
      "<p style=\"margin:0; color:#4b5563; line-height:1.6;\">That address is unsubscribed and will no longer receive the newsletter.</p>"
    ));
  } catch (_error) {
    return htmlResponse(500, page("Unable to process request", "<p>Please try again later.</p>"));
  }
});
