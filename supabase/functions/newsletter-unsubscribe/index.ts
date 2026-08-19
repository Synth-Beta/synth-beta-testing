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

const renderPage = (title: string, body: string) => `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background:#f7f7f9; padding:24px;">
  <div style="max-width:560px; margin:40px auto; background:#fff; border:1px solid #ececec; border-radius:12px; padding:24px;">
    <h1 style="margin:0 0 12px; font-size:24px;">${title}</h1>
    <p style="margin:0 0 16px; color:#4b5563; line-height:1.6;">${body}</p>
    <a href="${publicSiteUrl}" style="color:#cc2486; text-decoration:none; font-weight:700;">Return to Synth</a>
  </div>
</body>
</html>
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!unsubscribeSecret) {
    return htmlResponse(500, renderPage("Unable to process", "Unsubscribe secret is not configured."));
  }

  try {
    const url = new URL(req.url);
    let email = url.searchParams.get("email") ?? "";
    let token = url.searchParams.get("token") ?? "";
    const newsletterSlug = url.searchParams.get("slug") ?? "newsletter";

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      email = String(body?.email ?? email);
      token = String(body?.token ?? token);
    }

    email = normalizeEmail(email);
    token = token.trim().toLowerCase();

    if (!email || !token) {
      return htmlResponse(400, renderPage("Invalid link", "This unsubscribe link is missing required information."));
    }

    const expectedToken = await signEmail(email);
    if (expectedToken !== token) {
      return htmlResponse(403, renderPage("Invalid link", "This unsubscribe link is not valid."));
    }

    const userLookup = await adminClient
      .from("users")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();

    const userId = userLookup.data?.user_id ?? null;

    // Upsert by normalized email uniqueness index.
    const { error } = await adminClient.from("newsletter_unsubscribes").upsert(
      {
        email,
        user_id: userId,
        source: "email_link",
        reason: `Unsubscribed from ${newsletterSlug}`,
      },
      { onConflict: "email" }
    );

    if (error) {
      return htmlResponse(500, renderPage("Unable to unsubscribe", "We couldn't update your preferences right now."));
    }

    if (req.method === "POST") {
      return jsonResponse(200, { ok: true });
    }

    return htmlResponse(
      200,
      renderPage(
        "You’re unsubscribed",
        "You will no longer receive this newsletter at this email address."
      )
    );
  } catch (_error) {
    return htmlResponse(500, renderPage("Unable to process request", "Please try again later."));
  }
});
