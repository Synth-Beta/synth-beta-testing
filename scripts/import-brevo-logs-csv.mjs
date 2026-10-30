#!/usr/bin/env node
/**
 * Import a Brevo Transactional → Logs CSV export into brevo_email_events.
 *
 * Usage:
 *   node scripts/import-brevo-logs-csv.mjs path/to/logs.csv
 *   node scripts/import-brevo-logs-csv.mjs path/to/logs.csv --dry-run
 *
 * Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local (or env).
 * Timestamps in the export are interpreted as America/New_York (Brevo UI timezone).
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function loadEnvLocal() {
  const envPath = path.join(repoRoot, '.env.local');
  try {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      const key = line.slice(0, i).trim();
      if (process.env[key]) continue;
      let value = line.slice(i + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    /* optional */
  }
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

const CSV_EVENT_MAP = {
  sent: 'sent',
  delivered: 'delivered',
  opened: 'opened',
  'first opening': 'unique_opened',
  clicked: 'click',
  'hard bounce': 'hard_bounce',
  'soft bounce': 'soft_bounce',
  blocked: 'blocked',
  'loaded by proxy': 'loaded_by_proxy',
};

function normalizeCsvEventType(stText) {
  const key = stText.trim().toLowerCase();
  return CSV_EVENT_MAP[key] ?? key.replace(/\s+/g, '_');
}

/** MM-DD-YYYY HH:mm:ss in America/New_York → ISO UTC */
function parseBrevoExportTimestamp(ts) {
  const m = ts.trim().match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) throw new Error(`Unrecognized timestamp: ${ts}`);
  const [, mm, dd, yyyy, HH, MM, SS] = m;
  const localIso = `${yyyy}-${mm}-${dd}T${HH}:${MM}:${SS}`;
  const utcMs = Date.parse(`${localIso}Z`);
  const nyParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'longOffset',
  })
    .formatToParts(new Date(utcMs))
    .find((p) => p.type === 'timeZoneName')?.value;
  const offset = nyParts?.replace('GMT', '') ?? '-04:00';
  const normalizedOffset =
    offset === '' || offset === '0' ? '+00:00' : offset.includes(':') ? offset : `${offset}:00`;
  return new Date(`${localIso}${normalizedOffset}`).toISOString();
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  const idx = (name) => header.indexOf(name);
  const col = {
    st: idx('st_text'),
    ts: idx('ts'),
    sub: idx('sub'),
    frm: idx('frm'),
    email: idx('email'),
    tag: idx('tag'),
    mid: idx('mid'),
    link: idx('link'),
  };
  for (const [k, v] of Object.entries(col)) {
    if (v < 0) throw new Error(`Missing column for ${k} in CSV header: ${header.join(',')}`);
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length < header.length) continue;
    const stText = cells[col.st];
    const eventType = normalizeCsvEventType(stText);
    const email = cells[col.email]?.trim().toLowerCase() || null;
    const messageId = cells[col.mid]?.trim() || null;
    const subject = cells[col.sub]?.trim() || null;
    const tagRaw = cells[col.tag]?.trim();
    const tags = tagRaw && tagRaw !== 'NA' ? [tagRaw] : [];
    const linkRaw = cells[col.link]?.trim();
    const link = linkRaw && linkRaw !== 'NA' ? linkRaw : null;
    const eventAt = parseBrevoExportTimestamp(cells[col.ts]);
    const linkKey = link ?? '';
    const emailKey = email ?? '';
    const messageKey = messageId ?? '';
    rows.push({
      event_type: eventType,
      email,
      brevo_message_id: messageId,
      event_at: eventAt,
      subject,
      tags,
      link,
      reason: null,
      custom_delivery_key: null,
      raw: {
        source: 'brevo_logs_csv',
        st_text: stText,
        frm: cells[col.frm]?.trim() ?? null,
      },
      idempotency_key: [messageKey, eventType, eventAt, emailKey, linkKey].join('|'),
    });
  }
  return rows;
}

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
  const dryRun = process.argv.includes('--dry-run');
  const csvPath = args[0];
  if (!csvPath) {
    console.error('Usage: node scripts/import-brevo-logs-csv.mjs <logs.csv> [--dry-run]');
    process.exit(1);
  }

  const content = readFileSync(path.resolve(csvPath), 'utf8');
  const rows = parseCsv(content);
  console.log(`Parsed ${rows.length} events from ${csvPath}`);

  const byType = rows.reduce((acc, r) => {
    acc[r.event_type] = (acc[r.event_type] ?? 0) + 1;
    return acc;
  }, {});
  console.log('By type:', byType);

  if (dryRun) {
    console.log('Dry run — no database writes.');
    return;
  }

  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error, count } = await supabase.from('brevo_email_events').upsert(batch, {
      onConflict: 'idempotency_key',
      ignoreDuplicates: true,
      count: 'exact',
    });
    if (error) {
      console.error('Insert failed:', error.message);
      process.exit(1);
    }
    inserted += count ?? batch.length;
  }
  console.log(`Done. Upserted batch rows; new inserts (approx): ${inserted}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
