import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../integrations/supabase/client';

/**
 * Friend invites (supabase/migrations/20261027120000_invites.sql).
 *
 * The invite code is the attribution: Apple drops link params through an App Store install,
 * so the friend types the code in onboarding. When they open join.getsynth.app/i/CODE with
 * the app installed, the code is saved here and prefilled instead.
 */

const PENDING_KEY = 'synth:pendingInviteCode';
export const INVITE_LINK_BASE = 'https://join.getsynth.app/i/';

export interface InvitePreview {
  code: string;
  inviter_id: string;
  inviter_name: string | null;
  inviter_avatar_url: string | null;
  event_id: string | null;
  event_title: string | null;
  event_venue: string | null;
  event_date: string | null;
}

export type RedeemResult =
  | { ok: true; inviter_id: string; event_id: string | null }
  | { ok: false; reason: 'not_found' | 'own_invite' | 'error' };

export function normalizeInviteCode(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase();
}

/** Pulls the code out of https://join.getsynth.app/i/CODE (or synth://i/CODE). */
export function inviteCodeFromUrl(url: string | null | undefined): string | null {
  const m = url?.match(/\/i\/([A-Za-z0-9]{4,12})(?:[/?#]|$)/);
  return m ? normalizeInviteCode(m[1]) : null;
}

export function inviteMessage(code: string, showLabel?: string | null): string {
  const link = `${INVITE_LINK_BASE}${code}`;
  const lead = showLabel ? `Come to ${showLabel} with me! ` : 'Come find shows with me! ';
  return `${lead}I'm on Synth. Get the app and use my invite code ${code}: ${link}`;
}

export class InviteService {
  static async create(eventId: string | null): Promise<string> {
    const { data, error } = await supabase.rpc('create_invite', { p_event_id: eventId });
    if (error || typeof data !== 'string') throw error ?? new Error('No invite code returned');
    return data;
  }

  static async preview(code: string): Promise<InvitePreview | null> {
    const { data, error } = await supabase.rpc('get_invite', { p_code: normalizeInviteCode(code) });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return (row as InvitePreview) ?? null;
  }

  static async redeem(code: string): Promise<RedeemResult> {
    const { data, error } = await supabase.rpc('redeem_invite', { p_code: normalizeInviteCode(code) });
    if (error || !data) return { ok: false, reason: 'error' };
    return data as RedeemResult;
  }

  static async savePending(code: string): Promise<void> {
    try {
      await AsyncStorage.setItem(PENDING_KEY, normalizeInviteCode(code));
    } catch {
      // storage unavailable: the friend can still type the code
    }
  }

  static async getPending(): Promise<string | null> {
    try {
      return (await AsyncStorage.getItem(PENDING_KEY)) || null;
    } catch {
      return null;
    }
  }

  static async clearPending(): Promise<void> {
    try {
      await AsyncStorage.removeItem(PENDING_KEY);
    } catch {
      // nothing to clear
    }
  }
}
