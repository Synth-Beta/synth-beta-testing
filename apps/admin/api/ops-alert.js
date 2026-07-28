/**
 * getsynth.app/api/ops-alert → Slack #alerts
 * Called from admin Content Calendar when generate/research fails.
 */
export const config = { runtime: 'nodejs', maxDuration: 15 };

function corsHeaders(req) {
  const origin = req?.headers?.origin || req?.headers?.get?.('origin') || '';
  const allowed = new Set([
    'https://getsynth.app',
    'https://www.getsynth.app',
    'http://localhost:5173',
    'http://localhost:3000',
  ]);
  const allow = allowed.has(origin) ? origin : 'https://getsynth.app';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,content-type,apikey,x-client-info',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  };
}

function json(res, status, body, req) {
  const headers = corsHeaders(req);
  if (typeof res?.status === 'function') {
    res.statusCode = status;
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.end(JSON.stringify(body));
    return;
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function headerGet(req, name) {
  const h = req?.headers;
  if (!h) return null;
  if (typeof h.get === 'function') return h.get(name) || h.get(name.toLowerCase());
  const key = name.toLowerCase();
  const raw = h[name] ?? h[key];
  return Array.isArray(raw) ? raw[0] : raw ?? null;
}

async function readBody(req) {
  if (typeof req.json === 'function') return req.json().catch(() => ({}));
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function requireAdmin(req) {
  const auth = headerGet(req, 'authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const base =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://glpiolbrafqikqhnseto.supabase.co';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) return null;

  const userRes = await fetch(`${base.replace(/\/+$/g, '')}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: key },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  const uid = user?.id;
  if (!uid) return null;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || key;
  const rowsRes = await fetch(
    `${base.replace(/\/+$/g, '')}/rest/v1/users?user_id=eq.${uid}&select=account_type&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!rowsRes.ok) return null;
  const rows = await rowsRes.json();
  if (rows?.[0]?.account_type !== 'admin') return null;
  return uid;
}

function escapeSlack(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    if (res) {
      Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));
      res.statusCode = 200;
      res.end('ok');
      return;
    }
    return new Response('ok', { status: 200, headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' }, req);

  try {
    const adminId = await requireAdmin(req);
    if (!adminId) return json(res, 401, { error: 'Admin auth required' }, req);

    const webhook =
      process.env.SLACK_ALERTS_WEBHOOK_URL?.trim() ||
      process.env.SLACK_OPS_WEBHOOK_URL?.trim();
    if (!webhook) {
      return json(res, 500, { ok: false, error: 'SLACK_ALERTS_WEBHOOK_URL not configured' }, req);
    }

    const body = await readBody(req);
    const severity =
      body.severity === 'warning' || body.severity === 'degraded' ? body.severity : 'down';
    const title =
      severity === 'warning'
        ? '*Synth ops warning*'
        : severity === 'degraded'
          ? '*Synth ops degraded*'
          : '*Synth ops DOWN*';

    const lines = [
      title,
      `*Area:* \`${escapeSlack(body.area || 'admin-editorial')}\``,
      `*Fail log:* ${escapeSlack(String(body.fail_log || body.message || 'Unknown').slice(0, 800))}`,
      `*Link:* ${escapeSlack(body.link || 'https://getsynth.app/admin')}`,
    ];
    if (body.status != null) lines.push(`*HTTP:* \`${escapeSlack(String(body.status))}\``);
    if (body.subject_id) lines.push(`*Subject:* \`${escapeSlack(String(body.subject_id))}\``);
    if (body.next_step) lines.push(`*Next step:* ${escapeSlack(String(body.next_step))}`);
    lines.push(`*Admin:* \`${adminId}\``);

    const slackRes = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: lines.join('\n') }),
    });
    if (!slackRes.ok) {
      const errText = await slackRes.text().catch(() => '');
      return json(res, 502, { ok: false, error: `Slack ${slackRes.status}: ${errText.slice(0, 120)}` }, req);
    }
    return json(res, 200, { ok: true }, req);
  } catch (err) {
    console.error('[ops-alert]', err);
    return json(res, 500, { error: err?.message || 'ops-alert failed' }, req);
  }
}
