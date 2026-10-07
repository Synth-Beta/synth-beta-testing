import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { loadEventsNearPlaces, placeKey, type EventQuery } from "./nearby.ts";
import { fetchMusicNews } from "./news.ts";
import { readAll, requireRows, enrichReviewArtists } from "./queries.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type NewsletterSendAction =
  | "source_edition"
  | "get_recipients"
  | "list_approvals"
  | "set_approval"
  | "list_drafts"
  | "upsert_drafts"
  | "set_draft_approval"
  | "approve_all_drafts"
  | "send_test"
  | "send_batch";

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
  const users = await readAll(() => adminClient.from("users")
    .select("user_id, email, name, username, account_status, is_bot")
    .eq("account_status", "active").or("is_bot.is.false,is_bot.is.null")
    .not("email", "is", null).order("user_id"), "Load eligible users");
  const unsubscribes = await readAll(() => adminClient.from("newsletter_unsubscribes")
    .select("email").order("email"), "Load unsubscribes");
  const unsubscribeSet = new Set((unsubscribes ?? []).map((row) => normalizeEmail(String(row.email))));

  const recipients = (users ?? [])
    .filter((row) => row.email && isValidEmail(row.email))
    .filter((row) => !unsubscribeSet.has(normalizeEmail(String(row.email))))
    .map((row) => ({
      userId: row.user_id,
      email: normalizeEmail(String(row.email)),
      name: row.name ?? "",
      username: row.username ?? "",
    }));

  return recipients;
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const requireSendConfig = () => {
  if (!resendApiKey) return "RESEND_API_KEY is not configured.";
  if (!resendFromEmail) return "RESEND_FROM_EMAIL is not configured.";
  if (!unsubscribeSecret) return "NEWSLETTER_UNSUBSCRIBE_SECRET is not configured.";
  return null;
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

    if (action === "list_approvals") {
      const newsletterSlug = String(body?.newsletterSlug ?? "").trim();
      if (!newsletterSlug) return json(400, { ok: false, error: "newsletterSlug is required." });

      const recipients = await getEligibleRecipients();
      const { data: approvals, error: approvalError } = await adminClient
        .from("newsletter_approvals")
        .select("user_id, status")
        .eq("newsletter_slug", newsletterSlug)
        .eq("status", "approved");
      if (approvalError) {
        return json(500, { ok: false, error: approvalError.message });
      }
      const approvedIds = new Set((approvals ?? []).map((row) => String(row.user_id)));

      return json(200, {
        ok: true,
        recipients: recipients.map((recipient) => ({
          ...recipient,
          approvalStatus: approvedIds.has(recipient.userId) ? "approved" : "pending",
        })),
      });
    }

    if (action === "set_approval") {
      const newsletterSlug = String(body?.newsletterSlug ?? "").trim();
      const userId = String(body?.userId ?? "").trim();
      const status = String(body?.status ?? "").trim();
      if (!newsletterSlug) return json(400, { ok: false, error: "newsletterSlug is required." });
      if (!userId) return json(400, { ok: false, error: "userId is required." });
      if (status !== "approved" && status !== "revoked") {
        return json(400, { ok: false, error: "status must be approved or revoked." });
      }

      const { data: userRow, error: userError } = await adminClient
        .from("users")
        .select("user_id, email")
        .eq("user_id", userId)
        .maybeSingle();
      if (userError || !userRow?.email || !isValidEmail(userRow.email)) {
        return json(400, { ok: false, error: "That user does not have a valid email." });
      }

      const { error: upsertError } = await adminClient.from("newsletter_approvals").upsert(
        {
          newsletter_slug: newsletterSlug,
          user_id: userId,
          email: normalizeEmail(String(userRow.email)),
          status,
          approved_by: auth.userId,
          approved_at: new Date().toISOString(),
        },
        { onConflict: "newsletter_slug,user_id" }
      );
      if (upsertError) return json(500, { ok: false, error: upsertError.message });

      return json(200, { ok: true, userId, status });
    }

    if (action === "send_test") {
      const sendConfigError = requireSendConfig();
      if (sendConfigError) return json(500, { ok: false, error: sendConfigError });
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

    if (action === "source_edition") {
      const users = await readAll(() => adminClient.from("users")
        .select("user_id, email, name, username, location_city, location_state")
        .eq("account_status", "active").or("is_bot.is.false,is_bot.is.null")
        .not("email", "is", null).order("user_id"), "Load users");
      const unsubscribes = await readAll(() => adminClient.from("newsletter_unsubscribes")
        .select("email").order("email"), "Load unsubscribes");
      const unsubscribed = new Set((unsubscribes ?? []).map((row) => normalizeEmail(String(row.email))));
      const recipients = (users ?? []).filter((user) => user.email && isValidEmail(user.email) && !unsubscribed.has(normalizeEmail(user.email)));
      const storedNews = await adminClient.from("news_items").select("id, title, url, source, created_at").order("created_at", { ascending: false }).limit(40);
      const rss = await fetchMusicNews();
      const news = [...rss, ...requireRows(storedNews, "Load stored news")];
      const userIds = recipients.map((user) => user.user_id);
      const reviews: unknown[] = [];
      const stats: unknown[] = [];
      for (let index = 0; index < userIds.length; index += 40) {
        const ids = userIds.slice(index, index + 40);
        reviews.push(...await readAll(() => adminClient.from("reviews")
          .select("id, user_id, rating, review_text, Event_date, setlist, user_created_artist_id, artists(name), venues(name)")
          .in("user_id", ids).eq("is_draft", false)
          .order("Event_date", { ascending: false }).order("id"), "Load review history"));
        stats.push(...await readAll(() => adminClient.from("user_streaming_stats_summary")
          .select("user_id, top_artists, top_genres, service_type")
          .in("user_id", ids).order("user_id").order("service_type"), "Load listening history"));
      }
      const enrichedReviews = await enrichReviewArtists(adminClient, reviews);
      const artistNames = [...new Set(userIds.flatMap((id) => {
        const fromReviews = enrichedReviews.filter((row: any) => row.user_id === id).slice(0, 2).map((row: any) => (row.artistName ?? row.artists?.name ?? row.user_created_artists?.name ?? row.setlist?.artist?.name)).filter(Boolean);
        const stat: any = stats.find((row: any) => row.user_id === id);
        const listening = Array.isArray(stat?.top_artists) ? stat.top_artists.slice(0, 3).map((artist: any) => artist.name) : [];
        return [...listening, ...fromReviews];
      }))];
      const places = [...new Map(recipients.map((user) => {
        const city = String(user.location_city || "").trim();
        return [placeKey(city, user.location_state), { city, state: user.location_state ?? null }];
      })).values()].filter((place) => place.city);
      const eventSelect = "id, title, event_date, doors_time, venue_city, venue_state, latitude, longitude, ticket_available, ticket_urls, genres, event_status, artists(name), venues(name)";
      const loaded = await loadEventsNearPlaces(places, artistNames, new Date(), async (spec: EventQuery) => {
        if (spec.kind === "city-sample") {
          const rows = await adminClient.from("events").select("latitude, longitude, venue_state").ilike("venue_city", spec.city).gte("event_date", spec.from).not("latitude", "is", null).limit(12);
          return requireRows(rows, "Load event listings");
        }
        if (spec.kind === "city") {
          const rows = await adminClient.from("events").select(eventSelect).ilike("venue_city", spec.city)
            .gte("event_date", spec.from).lte("event_date", spec.until).order("event_date", { ascending: true }).limit(40);
          return requireRows(rows, "Load city event listings");
        }
        if (spec.kind === "box") {
          const rows = await adminClient.from("events").select(eventSelect).gte("latitude", spec.minLat).lte("latitude", spec.maxLat).gte("longitude", spec.minLng).lte("longitude", spec.maxLng).gte("event_date", spec.from).lte("event_date", spec.until).order("event_date", { ascending: true }).limit(40);
          return requireRows(rows, "Load event listings");
        }
        const rows = await adminClient.from("events").select(eventSelect).ilike("title", `%${spec.artist}%`).gte("event_date", spec.from).lte("event_date", spec.until).order("event_date", { ascending: true }).limit(8);
        return requireRows(rows, "Load event listings");
      });
      const fives = await adminClient.from("reviews").select("user_id, artists(name)").eq("is_public", true).eq("is_draft", false).gte("rating", 5).limit(300);
      return json(200, {
        ok: true,
        users: recipients.map((user) => {
          const center = loaded.centers.get(placeKey(user.location_city, user.location_state));
          return { ...user, latitude: center?.latitude ?? null, longitude: center?.longitude ?? null };
        }),
        news,
        reviews: enrichedReviews,
        stats,
        events: loaded.events,
        publicFives: requireRows(fives, "Load community reviews"),
      });
    }

    if (action === "list_drafts") {
      const editionDate = String(body?.editionDate ?? "").trim();
      if (!editionDate) return json(400, { ok: false, error: "editionDate is required." });
      const { data, error } = await adminClient
        .from("newsletter_drafts")
        .select("id, edition_date, user_id, email, subject, preheader, html, content_hash, sources, retrieved_at, status, approved_content_hash, sent_at")
        .eq("edition_date", editionDate)
        .order("email", { ascending: true });
      if (error) return json(500, { ok: false, error: error.message });
      return json(200, { ok: true, drafts: data ?? [] });
    }

    if (action === "upsert_drafts") {
      const editionDate = String(body?.editionDate ?? "").trim();
      const drafts = Array.isArray(body?.drafts) ? body.drafts : [];
      if (!editionDate) return json(400, { ok: false, error: "editionDate is required." });
      if (drafts.length > 15) return json(400, { ok: false, error: "Save at most 15 drafts per batch." });
      const rows = [];
      for (const draft of drafts) {
        const userId = String(draft?.userId ?? "").trim();
        const email = normalizeEmail(String(draft?.email ?? ""));
        const subject = String(draft?.subject ?? "").trim();
        const html = String(draft?.html ?? "");
        if (!userId || !isValidEmail(email) || !subject || !html) {
          return json(400, { ok: false, error: "Each draft needs a user, valid email, subject and HTML." });
        }
        rows.push({ user_id: userId, email, subject, html,
          preheader: String(draft?.preheader ?? ""),
          content_hash: await sha256(`${subject}\n${html}`),
          sources: Array.isArray(draft?.sources) ? draft.sources : [],
        });
      }
      // The database locks each row while replacing it, so a concurrent send
      // cannot have its claimed/sent row overwritten by regeneration.
      const { data, error } = await adminClient.rpc("regenerate_newsletter_drafts", {
        p_edition_date: editionDate, p_drafts: rows,
      });
      if (error) return json(500, { ok: false, error: `Drafts were not saved: ${error.message}` });
      return json(200, { ok: true, ...data });
    }

    if (action === "set_draft_approval") {
      const draftId = String(body?.draftId ?? "").trim();
      const status = String(body?.status ?? "").trim();
      if (!draftId) return json(400, { ok: false, error: "draftId is required." });
      if (status !== "approved" && status !== "needs_approval") {
        return json(400, { ok: false, error: "status must be approved or needs_approval." });
      }
      const existing = await adminClient
        .from("newsletter_drafts")
        .select("id, status, content_hash, sent_at")
        .eq("id", draftId)
        .maybeSingle();
      if (existing.error) return json(500, { ok: false, error: existing.error.message });
      if (!existing.data) return json(404, { ok: false, error: "Draft not found." });
      if (existing.data.status === "sent" || existing.data.sent_at) {
        return json(409, { ok: false, error: "Sent newsletters cannot be changed." });
      }
      const { data: updatedRows, error } = await adminClient
        .from("newsletter_drafts")
        .update(
          status === "approved"
            ? {
                status: "approved",
                approved_content_hash: existing.data.content_hash,
                approved_by: auth.userId,
                approved_at: new Date().toISOString(),
              }
            : { status: "needs_approval", approved_content_hash: null, approved_by: null, approved_at: null }
        )
        .eq("id", draftId)
        .eq("content_hash", existing.data.content_hash)
        .neq("status", "sent")
        .is("sent_at", null)
        .select("id");
      if (error) return json(500, { ok: false, error: error.message });
      if (!updatedRows?.length) return json(409, { ok: false, error: "Draft changed while you were reviewing. Reload and review its latest version." });
      return json(200, { ok: true, draftId, status });
    }

    if (action === "approve_all_drafts") {
      const editionDate = String(body?.editionDate ?? "").trim();
      const ids = Array.isArray(body?.draftIds) ? body.draftIds.map(String) : null;
      if (!editionDate) return json(400, { ok: false, error: "editionDate is required." });
      let query = adminClient
        .from("newsletter_drafts")
        .select("id, content_hash")
        .eq("edition_date", editionDate)
        .eq("status", "needs_approval");
      if (ids) query = query.in("id", ids);
      const { data, error } = await query;
      if (error) return json(500, { ok: false, error: error.message });
      let approved = 0;
      for (const row of data ?? []) {
        const { data: updatedRows, error: updateError } = await adminClient
          .from("newsletter_drafts")
          .update({
            status: "approved",
            approved_content_hash: row.content_hash,
            approved_by: auth.userId,
            approved_at: new Date().toISOString(),
          })
          .eq("id", row.id)
          .eq("status", "needs_approval")
          .eq("content_hash", row.content_hash)
          .is("sent_at", null)
          .select("id");
        if (updateError) return json(500, { ok: false, error: `Approval failed after ${approved} updates: ${updateError.message}` });
        approved += updatedRows?.length ?? 0;
      }
      return json(200, { ok: true, approved });
    }

    if (action === "send_batch") {
      const sendConfigError = requireSendConfig();
      if (sendConfigError) return json(500, { ok: false, error: sendConfigError });

      const requestId = String(body?.requestId ?? "");
      const editionDate = String(body?.editionDate ?? "").trim();
      const newsletterSlug = editionDate || String(body?.newsletterSlug ?? "newsletter");
      if (!requestId) return json(400, { ok: false, error: "requestId is required." });
      if (!editionDate) {
        return json(400, { ok: false, error: "editionDate is required. Production send uses approved drafts only." });
      }

      const { data: drafts, error: draftError } = await adminClient
        .from("newsletter_drafts")
        .select("id, email, subject, html, content_hash, approved_content_hash, status, sent_at")
        .eq("edition_date", editionDate)
        .eq("status", "approved")
        .is("sent_at", null);
      if (draftError) return json(500, { ok: false, error: draftError.message });
      const ready = (drafts ?? []).filter(
        (draft) => draft.approved_content_hash && draft.approved_content_hash === draft.content_hash
      );

      const unsubscribedRows = await readAll(() => adminClient.from("newsletter_unsubscribes")
        .select("email").order("email"), "Load unsubscribes before sending");
      const unsubscribeSet = new Set(unsubscribedRows.map((row) => normalizeEmail(String(row.email))));

      const { error: lockError } = await adminClient.from("newsletter_send_jobs").insert({
        request_id: requestId,
        newsletter_slug: newsletterSlug,
        send_type: "batch",
        initiated_by: auth.userId,
        status: "processing",
        total_recipients: ready.length,
      });
      if (lockError) {
        if (lockError.code === "23505") {
          return json(409, { ok: false, error: "Duplicate request blocked (already submitted)." });
        }
        return json(500, { ok: false, error: lockError.message });
      }



      let successCount = 0;
      let failureCount = 0;
      const failures: Array<{ email: string; error: string }> = [];

      for (const draft of ready) {
        const toEmail = normalizeEmail(String(draft.email ?? ""));
        if (!toEmail || !isValidEmail(toEmail) || unsubscribeSet.has(toEmail)) {
          failureCount += 1;
          failures.push({ email: toEmail || "(missing)", error: "Skipped (invalid or unsubscribed)." });
          continue;
        }
        const claimed = await adminClient
          .from("newsletter_drafts")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", draft.id)
          .eq("status", "approved")
          .eq("content_hash", draft.content_hash)
          .eq("approved_content_hash", draft.content_hash)
          .is("sent_at", null)
          .select("id");
        if (!claimed.data?.length) continue;

        try {
          const unsubscribeUrl = await buildUnsubscribeUrl(toEmail, newsletterSlug);
          const htmlWithUnsubscribe = injectUnsubscribeLink(draft.html, unsubscribeUrl);
          // Pace delivery requests to reduce bursts.
          await new Promise((resolve) => setTimeout(resolve, 550));
          await resendSend({
            from: resendFromEmail,
            to: [toEmail],
            subject: draft.subject,
            html: htmlWithUnsubscribe,
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          });
          successCount += 1;
        } catch (error) {
          await adminClient
            .from("newsletter_drafts")
            .update({ status: "approved", sent_at: null })
            .eq("id", draft.id)
            .eq("status", "sent");
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
