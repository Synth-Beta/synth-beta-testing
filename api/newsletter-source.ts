import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const REVIEWER = "pesceelauren@gmail.com";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ ok: false, error: "Newsletter source is not configured." });
    }

    const header = String(req.headers.authorization ?? "");
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    if (!token) return res.status(401).json({ ok: false, error: "Sign in again before creating an edition." });

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await db.auth.getUser(token);
    if (error || data.user?.email?.toLowerCase() !== REVIEWER) {
      return res.status(403).json({ ok: false, error: "Only the newsletter reviewer can load edition data." });
    }

    const { loadEditionSource } = await import("../apps/admin/src/lib/newsletterEdition/gather");
    const source = await loadEditionSource(db, new Date());
    return res.status(200).json({ ok: true, ...source });
  } catch (loadError) {
    const message = loadError instanceof Error ? loadError.message : "Could not load newsletter data.";
    return res.status(500).json({ ok: false, error: message });
  }
}
