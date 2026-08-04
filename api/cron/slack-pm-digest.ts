/**
 * Synth PM digests — one function, three daily Vercel cron schedules
 * (Hobby: max 1 run/day per cron expression; max 12 serverless functions).
 *
 * Schedules (EDT = UTC-4):
 *   0 13 * * * → morning (9am ET)
 *   0 17 * * * → midday (1pm ET)
 *   0 21 * * * → eod (5pm ET)
 *
 * Kind is taken from `x-vercel-cron-schedule` when Vercel invokes the job,
 * so three schedules on the same path stay distinct.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 * Optional: ?kind=morning|midday|eod to force a slot
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleDigestCron } from '../_lib/slackPm/runDigestCron.js';
import type { DigestKind } from '../_lib/slackPm/digest.js';

export const config = { maxDuration: 60 };

function kindFromScheduleHeader(schedule: string | string[] | undefined): DigestKind | null {
  const raw = Array.isArray(schedule) ? schedule[0] : schedule;
  if (!raw) return null;
  // Exact expressions from vercel.json
  if (raw === '0 13 * * *' || raw.includes(' 13 ')) return 'morning';
  if (raw === '0 17 * * *' || raw.includes(' 17 ')) return 'midday';
  if (raw === '0 21 * * *' || raw.includes(' 21 ')) return 'eod';
  return null;
}

function kindFromUtcHour(hour: number): DigestKind {
  if (hour >= 19) return 'eod';
  if (hour >= 15) return 'midday';
  return 'morning';
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const forced = String(req.query.kind || '').toLowerCase();
  let kind: DigestKind | null = null;
  if (forced === 'midday' || forced === 'noon') kind = 'midday';
  else if (forced === 'eod' || forced === 'evening') kind = 'eod';
  else if (forced === 'morning') kind = 'morning';
  else {
    kind =
      kindFromScheduleHeader(req.headers['x-vercel-cron-schedule']) ||
      kindFromUtcHour(new Date().getUTCHours());
  }

  return handleDigestCron(req, res, kind);
}
