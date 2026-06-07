/**
 * Seed genre group chats with bot members and initial messages.
 *
 * ANALYTICS EXCLUSION: Bot users have is_bot=true.
 * Filter from DAU/MAU: WHERE COALESCE(is_bot, false) = false
 *
 * Usage:
 *   node scripts/seed-genre-chats.mjs [--dry-run]
 *   node scripts/seed-genre-chats.mjs --reseed   # delete old bot seed msgs and re-insert
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  BOT_SEED_ANALYTICS_NOTE,
  GENRE_CONFIGS,
  generateSeedMessages,
  log,
  parseArgs,
} from './lib/bot-seed-shared.mjs';

dotenv.config({ path: '.env.local' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOT_ACCOUNTS_PATH = join(__dirname, 'bot-accounts.json');
const SEED_BATCH = 'initial-v2';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const { dryRun, reseed } = parseArgs();
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function loadBots() {
  let bots = [];

  if (existsSync(BOT_ACCOUNTS_PATH)) {
    const data = JSON.parse(readFileSync(BOT_ACCOUNTS_PATH, 'utf8'));
    if (data.bots?.length) {
      bots = data.bots.map((b) => ({
        user_id: b.user_id,
        displayName: b.name,
        username: b.slug,
      }));
    }
  }

  const { data: dbBots, error } = await supabase
    .from('users')
    .select('user_id, name, username')
    .eq('is_bot', true);

  if (error) throw error;
  if (!dbBots?.length && !bots.length) {
    throw new Error('No bots found — run seed-bot-accounts.mjs first');
  }

  const dbMap = new Map((dbBots || []).map((b) => [b.user_id, b]));
  if (bots.length) {
    log('ok', `Loaded ${bots.length} bots from bot-accounts.json`);
    return bots.map((b) => ({
      user_id: b.user_id,
      displayName: dbMap.get(b.user_id)?.name ?? b.displayName,
      username: dbMap.get(b.user_id)?.username ?? b.username,
    }));
  }

  log('ok', `Loaded ${dbBots.length} bots from users WHERE is_bot=true`);
  return dbBots.map((u) => ({
    user_id: u.user_id,
    displayName: u.name,
    username: u.username,
  }));
}

async function findOrCreateGenreChat(genre) {
  const { data: existing } = await supabase
    .from('chats')
    .select('id')
    .eq('entity_type', 'genre')
    .eq('entity_id', genre.id)
    .eq('is_group_chat', true)
    .maybeSingle();

  if (existing?.id) {
    log('ok', `Genre chat exists #${genre.id} → ${existing.id}`);
    return existing.id;
  }

  const insertRow = {
    chat_name: `${genre.emoji} ${genre.fullName}`,
    is_group_chat: true,
    entity_type: 'genre',
    entity_id: genre.id,
  };

  if (dryRun) {
    log('ok', `[dry-run] Would create genre chat #${genre.id}`);
    return `dry-run-chat-${genre.id}`;
  }

  const { data: created, error } = await supabase
    .from('chats')
    .insert(insertRow)
    .select('id')
    .single();

  if (error) {
    const { data: retry } = await supabase
      .from('chats')
      .select('id')
      .eq('entity_type', 'genre')
      .eq('entity_id', genre.id)
      .eq('is_group_chat', true)
      .maybeSingle();
    if (retry?.id) return retry.id;
    throw new Error(`create chat #${genre.id}: ${error.message}`);
  }

  log('ok', `Created genre chat #${genre.id} → ${created.id}`);
  return created.id;
}

async function addBotParticipants(chatId, bots, genreLabel) {
  let added = 0;
  for (const bot of bots) {
    if (dryRun) {
      log('ok', `[dry-run] Would add bot ${bot.username || bot.displayName} to #${genreLabel}`);
      added++;
      continue;
    }

    const { error } = await supabase.from('chat_participants').insert({
      chat_id: chatId,
      user_id: bot.user_id,
    });

    if (error && error.code !== '23505') {
      log('warn', `chat_participants ${genreLabel}: ${error.message}`);
    } else if (!error) {
      added++;
      log('ok', `Added bot ${bot.username || bot.displayName} to #${genreLabel}`);
    }
  }
  return added;
}

async function deleteBotSeedMessages(chatId, genreLabel) {
  if (dryRun) {
    log('ok', `[dry-run] Would delete bot seed messages in #${genreLabel}`);
    return;
  }

  const { data: rows, error } = await supabase
    .from('messages')
    .select('id, metadata')
    .eq('chat_id', chatId)
    .limit(2000);

  if (error) throw error;

  const ids = (rows || [])
    .filter((m) => m.metadata?.bot_seed === true)
    .map((m) => m.id);

  if (!ids.length) return;

  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { error: delErr } = await supabase.from('messages').delete().in('id', chunk);
    if (delErr) throw new Error(`delete bot messages #${genreLabel}: ${delErr.message}`);
  }

  log('ok', `Deleted ${ids.length} old bot seed messages in #${genreLabel}`);
}

async function hasSeedBatch(chatId, batch) {
  if (dryRun) return false;
  const { data } = await supabase
    .from('messages')
    .select('id, metadata')
    .eq('chat_id', chatId)
    .limit(500);

  return (data || []).some((m) => m.metadata?.bot_seed === true && m.metadata?.batch === batch);
}

async function seedMessages(chatId, genreSlug, bots, genreLabel) {
  if (reseed) {
    await deleteBotSeedMessages(chatId, genreLabel);
  } else if (await hasSeedBatch(chatId, SEED_BATCH)) {
    log('ok', `#${genreLabel} already has ${SEED_BATCH} messages — skipping (use --reseed to replace)`);
    return 0;
  }

  const rows = generateSeedMessages({
    genreSlug,
    bots,
    batch: SEED_BATCH,
    activeDays: 10,
  }).map((m) => ({ ...m, chat_id: chatId }));

  if (dryRun) {
    log('ok', `[dry-run] Would insert ${rows.length} messages in #${genreLabel}`);
    return rows.length;
  }

  const { error } = await supabase.from('messages').insert(rows);
  if (error) throw new Error(`messages #${genreLabel}: ${error.message}`);

  await supabase
    .from('chats')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', chatId);

  log('ok', `Inserted ${rows.length} messages in #${genreLabel}`);
  return rows.length;
}

/** Remove per-message spam from bot actors (legacy before trigger skip). */
async function cleanupBotSpamNotifications(botUserIds) {
  if (dryRun || !botUserIds.length) return 0;

  const { data: rows, error } = await supabase
    .from('notifications')
    .select('id, actor_user_id, data')
    .eq('type', 'chat_message');

  if (error) {
    log('warn', `Could not scan notifications for bot cleanup: ${error.message}`);
    return 0;
  }

  const botSet = new Set(botUserIds);
  const ids = (rows || [])
    .filter((n) => {
      // Keep digest notifications; remove per-message bot spam only.
      if (n.data?.batched === true) return false;
      return (
        (n.actor_user_id && botSet.has(n.actor_user_id)) ||
        n.data?.source === 'bot_seed'
      );
    })
    .map((n) => n.id);

  if (!ids.length) return 0;

  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { error: delErr } = await supabase.from('notifications').delete().in('id', chunk);
    if (delErr) {
      log('warn', `Notification cleanup batch failed: ${delErr.message}`);
      break;
    }
  }

  log('ok', `Removed ${ids.length} bot-related chat notifications`);
  return ids.length;
}

/** One digest notification per real user in a genre chat (not one per bot message). */
async function notifyRealUsersInChat(chatId, chatName, genreLabel) {
  if (dryRun) return;

  const { data: parts } = await supabase
    .from('chat_participants')
    .select('user_id')
    .eq('chat_id', chatId);

  if (!parts?.length) return;

  const participantIds = parts.map((p) => p.user_id);
  const { data: realUsers } = await supabase
    .from('users')
    .select('user_id')
    .in('user_id', participantIds)
    .eq('is_bot', false);

  if (!realUsers?.length) return;

  for (const row of realUsers) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', row.user_id)
      .eq('type', 'chat_message')
      .eq('is_read', false)
      .contains('data', { chat_id: chatId, batched: true })
      .limit(1);

    if (existing?.length) continue;

    const { error } = await supabase.from('notifications').insert({
      user_id: row.user_id,
      type: 'chat_message',
      title: chatName,
      message: `New messages in ${chatName}`,
      is_read: false,
      data: {
        chat_id: chatId,
        chat_name: chatName,
        batched: true,
        source: 'bot_seed',
        genre: genreLabel,
      },
    });

    if (error) {
      log('warn', `Digest notification for ${row.user_id} in #${genreLabel}: ${error.message}`);
    }
  }
}

async function main() {
  console.log(`\n${BOT_SEED_ANALYTICS_NOTE}\n`);
  if (dryRun) log('warn', 'DRY RUN — no writes\n');
  if (reseed) log('warn', 'RESEED — replacing bot seed message history\n');

  const bots = await loadBots();
  const botUserIds = bots.map((b) => b.user_id);
  await cleanupBotSpamNotifications(botUserIds);

  let totalMessages = 0;
  let totalParticipants = 0;

  for (const genre of GENRE_CONFIGS) {
    try {
      const chatId = await findOrCreateGenreChat(genre);
      totalParticipants += await addBotParticipants(chatId, bots, genre.id);
      const inserted = await seedMessages(chatId, genre.id, bots, genre.id);
      totalMessages += inserted;
      if (!dryRun && inserted > 0) {
        await notifyRealUsersInChat(chatId, `${genre.emoji} ${genre.fullName}`, genre.id);
      }
    } catch (err) {
      log('err', `#${genre.id}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  log('ok', `Done — ${totalMessages} messages, ${totalParticipants} participant inserts across ${GENRE_CONFIGS.length} genre chats`);
}

main().catch((err) => {
  log('err', err.message);
  process.exit(1);
});
