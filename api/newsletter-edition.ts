import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

/**
 * Admin-only newsletter edition mutations that should not wait on Edge Function
 * deploys. Delete removes every unsent draft for an edition date.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ ok: false, error: "Newsletter edition API is not configured." });
    }

    const header = String(req.headers.authorization ?? "");
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    if (!token) return res.status(401).json({ ok: false, error: "Sign in again before managing editions." });

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ ok: false, error: "Sign in again before managing editions." });
    const { data: profile } = await db.from("users").select("account_type").eq("user_id", data.user.id).maybeSingle();
    if (profile?.account_type !== "admin") {
      return res.status(403).json({ ok: false, error: "Only admins can manage newsletter editions." });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
    const action = String(body.action ?? "").trim();
    if (action !== "delete_edition") {
      return res.status(400).json({ ok: false, error: "Unsupported action." });
    }

    const editionDate = String(body.editionDate ?? "").trim();
    if (!editionDate) return res.status(400).json({ ok: false, error: "editionDate is required." });

    const existing = await db
      .from("newsletter_drafts")
      .select("id, status, sent_at, brevo_message_id, delivery_state, send_claimed_at")
      .eq("edition_date", editionDate);
    if (existing.error) return res.status(500).json({ ok: false, error: existing.error.message });
    const rows = existing.data ?? [];
    if (!rows.length) return res.status(404).json({ ok: false, error: "No drafts found for that edition." });

    const locked = rows.filter((row) =>
      row.status === "sent"
      || Boolean(row.sent_at)
      || Boolean(row.brevo_message_id)
      || Boolean(row.send_claimed_at)
      || row.delivery_state === "uncertain"
    );
    if (locked.length) {
      return res.status(409).json({
        ok: false,
        error: `${locked.length} draft${locked.length === 1 ? " was" : "s were"} already sent or claimed. Editions with delivery history cannot be deleted.`,
      });
    }

    const { data: deletedRows, error: deleteError } = await db
      .from("newsletter_drafts")
      .delete()
      .eq("edition_date", editionDate)
      .neq("status", "sent")
      .is("sent_at", null)
      .is("brevo_message_id", null)
      .is("send_claimed_at", null)
      .select("id");
    if (deleteError) return res.status(500).json({ ok: false, error: deleteError.message });

    const deleted = deletedRows?.length ?? 0;
    if (deleted !== rows.length) {
      return res.status(409).json({
        ok: false,
        error: `Only deleted ${deleted} of ${rows.length} drafts. Reload and try again if a send started.`,
      });
    }

    return res.status(200).json({ ok: true, editionDate, deleted });
  } catch (deleteError) {
    const message = deleteError instanceof Error ? deleteError.message : "Could not delete this edition.";
    return res.status(500).json({ ok: false, error: message });
  }
}
