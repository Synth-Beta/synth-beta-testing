/**
 * Seed bot user accounts in Supabase Auth + public.users.
 *
 * ANALYTICS EXCLUSION: Bot users have is_bot=true.
 * Filter from DAU/MAU: WHERE COALESCE(is_bot, false) = false
 *
 * Usage:
 *   node scripts/seed-bot-accounts.mjs [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  BOT_ACCOUNTS,
  BOT_SEED_ANALYTICS_NOTE,
  botEmail,
  log,
  normalizeSignalGenre,
  parseArgs,
} from './lib/bot-seed-shared.mjs';

dotenv.config({ path: '.env.local' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, 'bot-accounts.json');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const { dryRun } = parseArgs();
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function probeSchema() {
  const { data, error } = await supabase.from('users').select('*').limit(1);
  if (error) {
    log('err', `Cannot read users table: ${error.message}`);
    process.exit(1);
  }
  const row = data?.[0];
  if (row && !('is_bot' in row)) {
    log('err', 'users.is_bot column missing — run migration 20260606100000_add_is_bot_to_users.sql first');
    process.exit(1);
  }
  log('ok', 'Schema probe passed (users.is_bot present or table empty)');
}

async function findAuthUserByEmail(email) {
  let page = 1;
  const perPage = 200;
  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < perPage) break;
    page++;
  }
  return null;
}

async function ensureBotAccount(config) {
  const email = botEmail(config.slug);
  const existing = await findAuthUserByEmail(email);

  let userId = existing?.id ?? null;

  if (!userId) {
    if (dryRun) {
      log('ok', `[dry-run] Would create auth user ${email} (${config.displayName})`);
      userId = `00000000-0000-4000-8000-${config.slug.padEnd(12, '0').slice(0, 12)}`;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: randomUUID(),
        email_confirm: true,
        user_metadata: { name: config.displayName, is_bot: true },
      });
      if (error) throw new Error(`createUser ${email}: ${error.message}`);
      userId = data.user.id;
      log('ok', `Created auth user ${email} → ${userId}`);
      await sleep(300);
    }
  } else {
    log('ok', `Auth user exists ${email} → ${userId}`);
  }

  if (dryRun) {
    log('ok', `[dry-run] Would update users row: is_bot=true, name=${config.displayName}`);
  } else {
    await sleep(400);

    const profilePayload = {
      name: config.displayName,
      username: config.slug,
      avatar_url: null,
      bio: config.bio,
      is_bot: true,
      is_public_profile: true,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedRows, error: updateErr } = await supabase
      .from('users')
      .update(profilePayload)
      .eq('user_id', userId)
      .select('user_id');

    if (updateErr) {
      throw new Error(`users update ${email}: ${updateErr.message}`);
    }

    if (!updatedRows?.length) {
      const { error: insertErr } = await supabase.from('users').insert({
        user_id: userId,
        name: config.displayName,
        username: config.slug,
        avatar_url: null,
        bio: config.bio,
        is_bot: true,
        is_public_profile: true,
        account_type: 'user',
      });
      if (insertErr) throw new Error(`users insert ${email}: ${insertErr.message}`);
      log('ok', `Inserted users profile for ${config.displayName}`);
    } else {
      log('ok', `Updated users profile for ${config.displayName}`);
    }

    const { data: verify } = await supabase
      .from('users')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!verify?.user_id) {
      throw new Error(`users row missing after upsert for ${email}`);
    }
  }

  const { data: existingSignals } = dryRun
    ? { data: [] }
    : await supabase
        .from('user_preference_signals')
        .select('id')
        .eq('user_id', userId)
        .eq('signal_type', 'genre_manual_preference')
        .contains('context', { source: 'bot_seed' });

  if ((existingSignals?.length ?? 0) === 0) {
    const now = new Date().toISOString();
    const rows = config.genres.map((genreSlug) => ({
      user_id: userId,
      signal_type: 'genre_manual_preference',
      entity_type: 'genre',
      entity_id: null,
      entity_name: null,
      genre: normalizeSignalGenre(genreSlug),
      signal_weight: 0.9,
      context: { source: 'bot_seed' },
      occurred_at: now,
    }));

    if (dryRun) {
      log('ok', `[dry-run] Would insert ${rows.length} preference signals for ${config.slug}`);
    } else {
      const { error: sigErr } = await supabase.from('user_preference_signals').insert(rows);
      if (sigErr) throw new Error(`signals ${email}: ${sigErr.message}`);
      log('ok', `Inserted ${rows.length} preference signals for ${config.slug}`);
    }
  } else {
    log('ok', `Preference signals already exist for ${config.slug}`);
  }

  if (!dryRun) {
    const { error: rpcErr } = await supabase.rpc('refresh_user_preferences_v5', { p_user_id: userId });
    if (rpcErr) log('warn', `refresh_user_preferences_v5 for ${config.slug}: ${rpcErr.message}`);
    else log('ok', `Refreshed user_preferences for ${config.slug}`);
  } else {
    log('ok', `[dry-run] Would call refresh_user_preferences_v5 for ${config.slug}`);
  }

  return {
    slug: config.slug,
    name: config.displayName,
    email,
    user_id: userId,
    genres: config.genres,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`\n${BOT_SEED_ANALYTICS_NOTE}\n`);
  if (dryRun) log('warn', 'DRY RUN — no writes\n');

  await probeSchema();

  const bots = [];
  for (const config of BOT_ACCOUNTS) {
    try {
      const bot = await ensureBotAccount(config);
      bots.push(bot);
    } catch (err) {
      log('err', `${config.slug}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  const output = { generated_at: new Date().toISOString(), bots };
  if (dryRun) {
    log('ok', `[dry-run] Would write ${OUTPUT_PATH} (${bots.length} bots)`);
  } else {
    writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    log('ok', `Wrote ${OUTPUT_PATH}`);
  }

  log('ok', `Done — ${bots.length} bot accounts processed`);
}

main().catch((err) => {
  log('err', err.message);
  process.exit(1);
});
