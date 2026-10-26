/**
 * Generates newsletter drafts at 9:00 America/New_York on Mondays.
 *
 * Vercel cron expressions are UTC and do not follow Eastern daylight time, so the
 * job is scheduled at both 13:00 and 14:00 UTC on Mondays. This handler runs only
 * when the current America/New_York weekday is Monday and the hour is 9. It never
 * sends or approves drafts. Manual Create/Regenerate in admin remains available.
 *
 * If the Monday edition already has drafts (for example from a weekend manual run),
 * generation is skipped so approvals are not cleared an hour before send.
 */
import { timingSafeEqual } from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { generateDraftsFromSource, loadEditionSource } from '../../../apps/admin/src/lib/newsletterEdition/gather.js';
import {
  SEND_TIME_ZONE,
  editionCalendarDate,
  isNewsletterGenerateWindow,
} from '../newsletterSchedule.js';

function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const toUpsertRow = (draft: {
  userId: string;
  email: string;
  subject: string;
  preheader: string;
  html: string;
  contentHash: string;
  sources: unknown;
}) => ({
  user_id: draft.userId,
  email: draft.email,
  subject: draft.subject,
  preheader: draft.preheader,
  html: draft.html,
  content_hash: draft.contentHash,
  sources: draft.sources ?? [],
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(500).json({ error: 'Cron not configured' });
  const authHeader = (req.headers.authorization as string) ?? '';
  if (!secureEquals(authHeader, `Bearer ${cronSecret}`)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date();
  if (!isNewsletterGenerateWindow(now)) {
    return res.status(200).json({
      ok: true,
      skipped: true,
      reason: 'Newsletter generation runs at 9:00 America/New_York on Mondays.',
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ ok: false, error: 'Newsletter generation is not configured.' });
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const editionDate = editionCalendarDate(now);

  try {
    const existing = await db
      .from('newsletter_drafts')
      .select('id')
      .eq('edition_date', editionDate)
      .limit(1);
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data?.length) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        editionDate,
        timeZone: SEND_TIME_ZONE,
        reason: 'Edition already has drafts; leaving manual or prior generation in place.',
      });
    }

    const generated = await generateDraftsFromSource(await loadEditionSource(db, now), now, editionDate);
    if (!generated.drafts.length) {
      return res.status(500).json({ ok: false, error: 'No drafts were built for this edition.' });
    }

    let replaced = 0;
    let kept = 0;
    for (let index = 0; index < generated.drafts.length; index += 5) {
      const chunk = generated.drafts.slice(index, index + 5).map(toUpsertRow);
      const { data, error } = await db.rpc('regenerate_newsletter_drafts', {
        p_edition_date: editionDate,
        p_drafts: chunk,
      });
      if (error) throw new Error(error.message);
      replaced += Number(data?.replaced ?? 0);
      kept += Number(data?.kept ?? 0);
    }

    return res.status(200).json({
      ok: true,
      skipped: false,
      editionDate,
      timeZone: SEND_TIME_ZONE,
      drafts: generated.drafts.length,
      held: generated.held,
      replaced,
      kept,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Newsletter generation failed.',
    });
  }
}
