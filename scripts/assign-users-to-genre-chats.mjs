/**
 * Assign real users to genre chats based on music preferences.
 *
 * ANALYTICS EXCLUSION: Bot users have is_bot=true.
 * Filter from DAU/MAU: WHERE COALESCE(is_bot, false) = false
 *
 * Usage:
 *   node scripts/assign-users-to-genre-chats.mjs [--dry-run] [--user-id=<uuid>] [--no-welcome]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {
  BOT_SEED_ANALYTICS_NOTE,
  getGenreConfig,
  log,
  parseArgs,
  resolveUserGenreToChatSlug,
} from './lib/bot-seed-shared.mjs';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const { dryRun, noWelcome, userId: singleUserId } = parseArgs();
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function loadGenreChatMap() {
  const { data, error } = await supabase
    .from('chats')
    .select('id, entity_id, chat_name')
    .eq('entity_type', 'genre')
    .eq('is_group_chat', true);

  if (error) throw error;
  const map = new Map();
  for (const row of data || []) {
    if (row.entity_id) map.set(row.entity_id, row);
  }
  return map;
}

async function loadBotUsersInChat(chatId) {
  const { data: bots } = await supabase
    .from('users')
    .select('user_id, name, username')
    .eq('is_bot', true);

  if (!bots?.length) return [];

  const { data: participants } = await supabase
    .from('chat_participants')
    .select('user_id')
    .eq('chat_id', chatId)
    .in(
      'user_id',
      bots.map((b) => b.user_id)
    );

  const inChat = new Set((participants || []).map((p) => p.user_id));
  return bots.filter((b) => inChat.has(b.user_id));
}

function topGenresForUser(pref) {
  const slugs = new Set();
  const scores = pref.genre_preference_scores || {};

  for (const g of pref.top_genres || []) {
    const slug = resolveUserGenreToChatSlug(g);
    if (slug) slugs.add(slug);
  }

  const sortedScoreKeys = Object.entries(scores)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([k]) => k);

  for (const g of sortedScoreKeys) {
    const slug = resolveUserGenreToChatSlug(g);
    if (slug) slugs.add(slug);
    if (slugs.size >= 3) break;
  }

  return [...slugs].slice(0, 3);
}

async function isParticipant(chatId, userId) {
  const { data } = await supabase
    .from('chat_participants')
    .select('id')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(data?.id);
}

async function welcomeAlreadySent(chatId, targetUserId) {
  const { data } = await supabase
    .from('messages')
    .select('id, metadata')
    .eq('chat_id', chatId)
    .contains('metadata', { bot_seed: true, batch: 'welcome' })
    .limit(100);

  return (data || []).some((m) => m.metadata?.welcome_user_id === targetUserId);
}

async function sendWelcomeMessage(chatId, genreSlug, user, botsInChat) {
  if (noWelcome || !botsInChat.length) return false;
  if (await welcomeAlreadySent(chatId, user.user_id)) return false;

  const bot = botsInChat[Math.floor(Math.random() * botsInChat.length)];
  const genreConfig = getGenreConfig(genreSlug);
  const genreLabel = genreConfig?.fullName || genreSlug;
  const mention = user.username || user.name?.replace(/\s+/g, '').toLowerCase() || 'there';
  const content = `Welcome to the ${genreLabel} chat @${mention}! Drop your favorite ${genreLabel} record below`;

  if (dryRun) {
    log('ok', `[dry-run] Would send welcome in #${genreSlug} for @${mention}`);
    return true;
  }

  const { error } = await supabase.from('messages').insert({
    chat_id: chatId,
    sender_id: bot.user_id,
    content,
    message_type: 'text',
    is_encrypted: false,
    metadata: { bot_seed: true, batch: 'welcome', welcome_user_id: user.user_id },
  });

  if (error) {
    log('warn', `Welcome message #${genreSlug}: ${error.message}`);
    return false;
  }

  await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);
  log('ok', `Welcome message in #${genreSlug} for @${mention}`);
  return true;
}

/** One digest notification when a real user joins a genre chat (not per bot message). */
async function notifyDigestForUser(chatId, chatName, userId, genreSlug) {
  if (dryRun) return;

  const { data: existing } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'chat_message')
    .eq('is_read', false)
    .contains('data', { chat_id: chatId, batched: true })
    .limit(1);

  if (existing?.length) return;

  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type: 'chat_message',
    title: chatName,
    message: `New messages in ${chatName}`,
    is_read: false,
    data: {
      chat_id: chatId,
      chat_name: chatName,
      batched: true,
      source: 'bot_seed',
      genre: genreSlug,
    },
  });

  if (error) {
    log('warn', `Digest notification for ${userId} in #${genreSlug}: ${error.message}`);
  }
}

async function fetchUsersWithPreferences() {
  let query = supabase
    .from('user_preferences')
    .select('user_id, top_genres, genre_preference_scores');

  if (singleUserId) query = query.eq('user_id', singleUserId);

  const { data: prefs, error } = await query;
  if (error) throw error;
  if (!prefs?.length) {
    log('warn', singleUserId ? `No preferences for user ${singleUserId}` : 'No user_preferences rows found');
    return [];
  }

  const userIds = prefs.map((p) => p.user_id);
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('user_id, name, username, is_bot')
    .in('user_id', userIds);

  if (usersErr) throw usersErr;

  const userMap = new Map((users || []).map((u) => [u.user_id, u]));

  return prefs
    .map((p) => ({ ...p, user: userMap.get(p.user_id) }))
    .filter((p) => p.user && !p.user.is_bot);
}

async function main() {
  console.log(`\n${BOT_SEED_ANALYTICS_NOTE}\n`);
  if (dryRun) log('warn', 'DRY RUN — no writes\n');

  const chatMap = await loadGenreChatMap();
  const users = await fetchUsersWithPreferences();

  let usersProcessed = 0;
  let membershipsAdded = 0;
  let welcomeCount = 0;

  for (const pref of users) {
    const slugs = topGenresForUser(pref);
    if (!slugs.length) continue;

    usersProcessed++;
    let addedForUser = 0;

    for (const slug of slugs) {
      if (addedForUser >= 3) break;

      const chat = chatMap.get(slug);
      if (!chat) {
        log('warn', `No genre chat for slug ${slug} — run seed-genre-chats.mjs`);
        continue;
      }

      if (await isParticipant(chat.id, pref.user_id)) continue;

      if (dryRun) {
        log('ok', `[dry-run] Would assign ${pref.user.username || pref.user.name} → #${slug}`);
        membershipsAdded++;
        addedForUser++;
      } else {
        const { error } = await supabase.from('chat_participants').insert({
          chat_id: chat.id,
          user_id: pref.user_id,
        });

        if (error && error.code !== '23505') {
          log('warn', `Assign ${pref.user_id} → #${slug}: ${error.message}`);
        } else if (!error) {
          membershipsAdded++;
          addedForUser++;
          log('ok', `Assigned ${pref.user.username || pref.user.name} → #${slug}`);
          await notifyDigestForUser(chat.id, chat.chat_name, pref.user_id, slug);
        }
      }

      const botsInChat = dryRun
        ? [{ user_id: 'dry-run' }]
        : await loadBotUsersInChat(chat.id);

      if (await sendWelcomeMessage(chat.id, slug, pref.user, botsInChat)) {
        welcomeCount++;
      }
    }
  }

  log(
    'ok',
    `Assigned ${usersProcessed} users → ${membershipsAdded} new chat memberships (${welcomeCount} welcome messages)`
  );
}

main().catch((err) => {
  log('err', err.message);
  process.exit(1);
});
