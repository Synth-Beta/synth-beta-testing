import { historyArtists } from "./editorial.ts";
import { runEventQuery } from "./eventQuery.ts";
import { lookupRecordings } from "./tracks.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { loadEventsNearPlaces, placeKey, rankedArtistNames, withHubPlaces, type EventQuery } from "./nearby.ts";
import { fetchMusicNews } from "./news.ts";
import { readAll, requireRows, enrichReviewArtists, loadListeningStats, loadTasteSignals } from "./queries.ts";
import { sendBrevoNewsletter } from "../../../api/_lib/brevoNewsletter.ts";
import { deliverApprovedDrafts, reconcileNewsletterDelivery, deliveryKey, type StoredDraft } from "../../../api/_lib/newsletterDelivery.ts";

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
const brevoApiKey = Deno.env.get("BREVO_API_KEY") ?? "";
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
    .select("user_id, email, name, username, account_status, is_bot, newsletter_subscription")
    .eq("account_status", "active").eq("newsletter_subscription", "subscribed").or("is_bot.is.false,is_bot.is.null")
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
  if (!brevoApiKey) return "BREVO_API_KEY is not configured.";
  if (!unsubscribeSecret) return "NEWSLETTER_UNSUBSCRIBE_SECRET is not configured.";
  return null;
};

const draftColumns = "id, edition_date, user_id, email, subject, preheader, html, content_hash, sources, retrieved_at, status, approved_content_hash, sent_at, brevo_message_id, delivery_state, delivery_error, send_claimed_at";

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
      const recentUncertain = await adminClient
        .from("newsletter_send_jobs")
        .select("id")
        .eq("newsletter_slug", newsletterSlug)
        .eq("target_email", toEmail)
        .eq("send_type", "test")
        .eq("status", "failed")
        .ilike("error_message", "%Acceptance was not confirmed%")
        .gte("created_at", tenMinutesAgo)
        .limit(1)
        .maybeSingle();
      if (recentUncertain.data) {
        return json(409, {
          ok: false,
          error: "Brevo did not confirm the last test to this address. Check Brevo before trying again.",
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
        const brevoMessageId = await sendBrevoNewsletter(brevoApiKey, {
          to: toEmail,
          subject,
          html: htmlWithUnsubscribe,
          unsubscribeUrl,
          deliveryKey: `newsletter-test:${requestId}`,
        });

        await adminClient
          .from("newsletter_send_jobs")
          .update({
            status: "completed",
            success_count: 1,
            failure_count: 0,
            brevo_message_id: brevoMessageId,
          })
          .eq("request_id", requestId);

        return json(200, {
          ok: true,
          requestId,
          brevoMessageId,
          accepted: true,
        });
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : String(sendError);
        await adminClient
          .from("newsletter_send_jobs")
          .update({
            status: "failed",
            success_count: 0,
            failure_count: 1,
            error_message: message.slice(0, 500),
          })
          .eq("request_id", requestId);
        return json(500, { ok: false, error: message });
      }
    }

    if (action === "source_edition") {
      const users = await readAll(() => adminClient.from("users")
        .select("user_id, email, name, username, location_city, location_state, newsletter_subscription")
        .eq("account_status", "active").eq("newsletter_subscription", "subscribed").or("is_bot.is.false,is_bot.is.null")
        .not("email", "is", null).order("user_id"), "Load users");
      const unsubscribes = await readAll(() => adminClient.from("newsletter_unsubscribes")
        .select("email").order("email"), "Load unsubscribes");
      const unsubscribed = new Set((unsubscribes ?? []).map((row) => normalizeEmail(String(row.email))));
      const recipients = (users ?? []).filter((user) => user.email && isValidEmail(user.email) && !unsubscribed.has(normalizeEmail(user.email)));
      const storedNews = await adminClient.from("news_items").select("id, title, url, source, created_at, seo_description").order("created_at", { ascending: false }).limit(40);
      const rss = await fetchMusicNews();
      const news = [...rss, ...requireRows(storedNews, "Load stored news")];
      const userIds = recipients.map((user) => user.user_id);
      const reviews: unknown[] = [];
      for (let index = 0; index < userIds.length; index += 40) {
        const ids = userIds.slice(index, index + 40);
        reviews.push(...await readAll(() => adminClient.from("reviews")
          .select("id, user_id, rating, review_text, Event_date, setlist, user_created_artist_id, artists(name), venues(name)")
          .in("user_id", ids).eq("is_draft", false)
          .order("Event_date", { ascending: false }).order("id"), "Load review history"));
      }
      const stats = await loadListeningStats(adminClient, userIds);
      const enrichedReviews = await enrichReviewArtists(adminClient, reviews);
      const artistNames = rankedArtistNames(userIds.map((id) => {
        const fromReviews = historyArtists(enrichedReviews.filter((row: any) => row.user_id === id));
        const listening = stats.filter((row: any) => row.user_id === id).flatMap((stat: any) => Array.isArray(stat.top_artists) ? stat.top_artists.slice(0, 8).map((artist: any) => artist.name) : []);
        return [...listening, ...fromReviews];
      }));
      const places = withHubPlaces([...new Map(recipients.map((user) => {
        const city = String(user.location_city || "").trim();
        return [placeKey(city, user.location_state), { city, state: user.location_state ?? null }];
      })).values()].filter((place) => place.city));
      const loaded = await loadEventsNearPlaces(places, artistNames, new Date(), (spec: EventQuery) => runEventQuery(adminClient, spec));
      const signals = await loadTasteSignals(adminClient, userIds);
      const seenEventIds = new Set(loaded.events.map((row) => String(row.id)));
      const missingIds = [...new Set(signals.interests.map((row) => String(row.event_id)))].filter((id) => !seenEventIds.has(id));
      for (let index = 0; index < missingIds.length; index += 80) {
        const ids = missingIds.slice(index, index + 80);
        for (const row of await runEventQuery(adminClient, { kind: "ids", ids, limit: ids.length })) {
          if (row?.id && !seenEventIds.has(String(row.id))) {
            seenEventIds.add(String(row.id));
            loaded.events.push(row);
          }
        }
      }
      const listens = await lookupRecordings(loaded.events.map((event) => String(event.artists?.name ?? event.artist_name ?? "")));
      const publicFives = await readAll(() => adminClient.from("reviews").select("user_id, artists(name)").eq("is_public", true).eq("is_draft", false).gte("rating", 5).order("user_id"), "Load community reviews");
      return json(200, {
        ok: true,
        users: recipients.map((user) => {
          const center = loaded.centers.get(placeKey(user.location_city, user.location_state));
          const mine = signals.interests.filter((row) => row.user_id === user.user_id);
          return {
            ...user,
            latitude: center?.latitude ?? null,
            longitude: center?.longitude ?? null,
            interestedEventIds: mine.filter((row) => row.relationship_type !== "going").map((row) => String(row.event_id)),
            goingEventIds: mine.filter((row) => row.relationship_type === "going").map((row) => String(row.event_id)),
            followedArtists: signals.follows.filter((row) => row.user_id === user.user_id).map((row) => row.artistName),
            followedVenues: signals.venueFollows.filter((row) => row.user_id === user.user_id).map((row) => row.venueName),
          };
        }),
        news,
        reviews: enrichedReviews,
        stats,
        events: loaded.events,
        listens,
        publicFives,
      });
    }

    if (action === "list_drafts") {
      const editionDate = String(body?.editionDate ?? "").trim();
      if (!editionDate) return json(400, { ok: false, error: "editionDate is required." });
      const { data, error } = await adminClient
        .from("newsletter_drafts")
        .select(draftColumns)
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
        .select("id, status, content_hash, sent_at, brevo_message_id, delivery_state, send_claimed_at")
        .eq("id", draftId)
        .maybeSingle();
      if (existing.error) return json(500, { ok: false, error: existing.error.message });
      if (!existing.data) return json(404, { ok: false, error: "Draft not found." });
      if (existing.data.status === "sent" || existing.data.sent_at || existing.data.brevo_message_id) {
        return json(409, { ok: false, error: "Sent newsletters cannot be changed." });
      }
      if (existing.data.delivery_state === "uncertain" || existing.data.send_claimed_at) {
        return json(409, { ok: false, error: "Brevo has not confirmed this send. Check Brevo before changing it." });
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
        .is("brevo_message_id", null)
        .is("send_claimed_at", null)
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

      await reconcileNewsletterDelivery(adminClient, editionDate);
      const drafts = await readAll(() => adminClient
        .from("newsletter_drafts")
        .select("id, user_id, email, subject, html, content_hash, approved_content_hash, status, sent_at, brevo_message_id, delivery_state, send_claimed_at")
        .eq("edition_date", editionDate)
        .eq("status", "approved")
        .is("sent_at", null).order("id"), "Load approved drafts");
      const eligibleRecipients = await getEligibleRecipients();
      const eligible = new Set(eligibleRecipients.map((recipient) => `${recipient.userId}:${recipient.email}`));
      const ready = (drafts ?? []).filter(
        (draft) => eligible.has(`${draft.user_id}:${normalizeEmail(String(draft.email))}`) && draft.approved_content_hash && draft.approved_content_hash === draft.content_hash
      );
      const stored: StoredDraft[] = ready.map((draft) => ({
        id: String(draft.id),
        editionDate,
        userId: String(draft.user_id),
        email: normalizeEmail(String(draft.email)),
        subject: String(draft.subject),
        html: String(draft.html),
        contentHash: String(draft.content_hash),
        status: "approved",
        approvedContentHash: String(draft.approved_content_hash),
        sentAt: draft.sent_at ? String(draft.sent_at) : null,
        brevoMessageId: draft.brevo_message_id ? String(draft.brevo_message_id) : null,
        deliveryState: draft.delivery_state ?? null,
        sendClaimedAt: draft.send_claimed_at ? String(draft.send_claimed_at) : null,
      }));

      const unsubscribedRows = await readAll(() => adminClient.from("newsletter_unsubscribes")
        .select("email").order("email"), "Load unsubscribes before sending");
      const unsubscribeSet = new Set(unsubscribedRows.map((row) => normalizeEmail(String(row.email))));

      const { error: lockError } = await adminClient.from("newsletter_send_jobs").insert({
        request_id: requestId,
        newsletter_slug: newsletterSlug,
        send_type: "batch",
        initiated_by: auth.userId,
        status: "processing",
        total_recipients: stored.length,
      });
      if (lockError) {
        if (lockError.code === "23505") {
          return json(409, { ok: false, error: "Duplicate request blocked (already submitted)." });
        }
        return json(500, { ok: false, error: lockError.message });
      }

      const failures: Array<{ email: string; error: string }> = [];
      try {
        const result = await deliverApprovedDrafts({
          drafts: stored,
          unsubscribedEmails: unsubscribeSet,
          claim: async (draft) => {
            const claimed = await adminClient
              .from("newsletter_drafts")
              .update({ send_claimed_at: new Date().toISOString(), delivery_error: null })
              .eq("id", draft.id)
              .eq("status", "approved")
              .eq("content_hash", draft.contentHash)
              .eq("approved_content_hash", draft.contentHash)
              .is("sent_at", null)
              .is("brevo_message_id", null)
              .is("send_claimed_at", null)
              .or("delivery_state.is.null,delivery_state.eq.failed")
              .select("id");
            if (claimed.error) throw new Error(claimed.error.message);
            return Boolean(claimed.data?.length);
          },
          sendEmail: async (draft) => {
            const toEmail = normalizeEmail(draft.email);
            const unsubscribeUrl = await buildUnsubscribeUrl(toEmail, newsletterSlug);
            return sendBrevoNewsletter(brevoApiKey, {
              to: toEmail,
              subject: draft.subject,
              html: injectUnsubscribeLink(draft.html, unsubscribeUrl),
              unsubscribeUrl,
              deliveryKey: deliveryKey(draft),
            });
          },
          confirm: async (draft, messageId) => {
            const recorded = await adminClient
              .from("newsletter_drafts")
              .update({ brevo_message_id: messageId, delivery_state: "accepted", delivery_error: null })
              .eq("id", draft.id)
              .eq("status", "approved")
              .is("sent_at", null)
              .select("id");
            if (recorded.error) throw new Error(recorded.error.message);
            if (!recorded.data?.length) return false;
            const marked = await adminClient
              .from("newsletter_drafts")
              .update({ status: "sent", sent_at: new Date().toISOString(), delivery_state: "accepted" })
              .eq("id", draft.id)
              .eq("status", "approved")
              .eq("brevo_message_id", messageId)
              .is("sent_at", null)
              .select("id");
            if (marked.error) throw new Error(marked.error.message);
            return Boolean(marked.data?.length);
          },
          release: async (draft, error) => {
            const message = (error ?? "Brevo rejected the message.").slice(0, 500);
            const released = await adminClient
              .from("newsletter_drafts")
              .update({ send_claimed_at: null, delivery_state: "failed", delivery_error: message })
              .eq("id", draft.id)
              .eq("status", "approved")
              .is("sent_at", null)
              .is("brevo_message_id", null);
            if (released.error) throw new Error(released.error.message);
            failures.push({ email: draft.email, error: message });
          },
          hold: async (draft, error) => {
            const message = error.slice(0, 500);
            const held = await adminClient
              .from("newsletter_drafts")
              .update({ delivery_state: "uncertain", delivery_error: message })
              .eq("id", draft.id)
              .eq("status", "approved")
              .is("sent_at", null)
              .is("brevo_message_id", null);
            if (held.error) throw new Error(held.error.message);
            failures.push({ email: draft.email, error: message });
          },
        });
        for (const skipped of result.skip) {
          const draft = stored.find((item) => item.id === skipped.id);
          failures.push({ email: draft?.email ?? skipped.id, error: skipped.reason });
        }
        const failureCount = result.failed + result.uncertain + result.skip.length;
        await adminClient
          .from("newsletter_send_jobs")
          .update({
            status: failureCount === 0 ? "completed" : result.sent > 0 ? "completed" : "failed",
            success_count: result.sent,
            failure_count: failureCount,
            error_message: failures.length > 0 ? JSON.stringify(failures.slice(0, 10)) : null,
          })
          .eq("request_id", requestId);

        return json(200, {
          ok: true,
          requestId,
          successCount: result.sent,
          failureCount,
          unconfirmedCount: result.uncertain,
          failures: failures.slice(0, 10),
        });
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : String(sendError);
        await adminClient
          .from("newsletter_send_jobs")
          .update({ status: "failed", error_message: message.slice(0, 500) })
          .eq("request_id", requestId);
        return json(500, { ok: false, error: message });
      }
    }

    return json(400, { ok: false, error: "Unsupported action." });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(500, { ok: false, error: message });
  }
});
