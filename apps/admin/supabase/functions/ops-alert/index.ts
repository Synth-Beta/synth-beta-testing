/**
 * Admin → Slack #alerts
 * Used when Content Calendar generate/research fails in getsynth.app/admin.
 *
 * Secret: SLACK_ALERTS_WEBHOOK_URL (Incoming Webhook for #alerts)
 */
import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import { corsHeaders, jsonResponse, optionsResponse } from '../_shared/editorialRest.ts';

async function requireAdmin(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anon) return null;

  const userRes = await fetch(`${supabaseUrl.replace(/\/+$/g, '')}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anon },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  const uid = user?.id as string | undefined;
  if (!uid) return null;

  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? anon;
  const rowsRes = await fetch(
    `${supabaseUrl.replace(/\/+$/g, '')}/rest/v1/users?user_id=eq.${uid}&select=account_type&limit=1`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    },
  );
  if (!rowsRes.ok) return null;
  const rows = (await rowsRes.json()) as Array<{ account_type: string }>;
  if (rows?.[0]?.account_type !== 'admin') return null;
  return uid;
}

function escapeSlack(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const adminId = await requireAdmin(req.headers.get('authorization'));
    if (!adminId) return jsonResponse({ error: 'Admin auth required' }, 401);

    const webhook =
      Deno.env.get('SLACK_ALERTS_WEBHOOK_URL')?.trim() ||
      Deno.env.get('SLACK_OPS_WEBHOOK_URL')?.trim();
    if (!webhook) {
      console.warn('[ops-alert] SLACK_ALERTS_WEBHOOK_URL not configured');
      return jsonResponse({ error: 'Slack webhook not configured', ok: false }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const area = String(body.area || 'admin-editorial');
    const failLog = String(body.fail_log || body.message || 'Unknown failure').slice(0, 800);
    const severity = body.severity === 'warning' || body.severity === 'degraded' ? body.severity : 'down';
    const nextStep = body.next_step ? String(body.next_step) : null;
    const link = body.link ? String(body.link) : 'https://getsynth.app/admin';
    const subjectId = body.subject_id ? String(body.subject_id) : null;
    const status = body.status != null ? String(body.status) : null;

    const title =
      severity === 'warning'
        ? '*Synth ops warning*'
        : severity === 'degraded'
          ? '*Synth ops degraded*'
          : '*Synth ops DOWN*';

    const lines = [
      title,
      `*Area:* \`${escapeSlack(area)}\``,
      `*Fail log:* ${escapeSlack(failLog)}`,
      `*Link:* ${escapeSlack(link)}`,
    ];
    if (status) lines.push(`*HTTP:* \`${escapeSlack(status)}\``);
    if (subjectId) lines.push(`*Subject:* \`${escapeSlack(subjectId)}\``);
    if (nextStep) lines.push(`*Next step:* ${escapeSlack(nextStep)}`);
    lines.push(`*Admin:* \`${adminId}\``);

    const slackRes = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: lines.join('\n') }),
    });

    if (!slackRes.ok) {
      const errText = await slackRes.text().catch(() => '');
      console.error('[ops-alert] Slack post failed', slackRes.status, errText.slice(0, 200));
      return jsonResponse({ ok: false, error: `Slack ${slackRes.status}` }, 502);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('[ops-alert]', err);
    return jsonResponse({ error: (err as Error).message || 'ops-alert failed' }, 500);
  }
});
