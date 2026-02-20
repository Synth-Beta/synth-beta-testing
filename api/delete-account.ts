import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Always set JSON content type
  res.setHeader('Content-Type', 'application/json');

  // Enable CORS for iOS/Android/web
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[delete-account] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const authHeaderRaw = (req.headers.authorization || req.headers.Authorization) as string | undefined;
  const token =
    typeof authHeaderRaw === 'string' && authHeaderRaw.startsWith('Bearer ')
      ? authHeaderRaw.slice('Bearer '.length)
      : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const fkBlockerResponse = () =>
    res.status(409).json({
      error: 'Cannot delete account',
      message:
        "Your account couldn’t be deleted because some content in your account was unable to be deleted. Please contact support for help.",
    });

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Validate token and get user id
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      console.error('[delete-account] Invalid token', userError);
      return res.status(401).json({ error: 'Invalid token', message: userError?.message });
    }

    const userId = userData.user.id;
    console.log(`[delete-account] Received delete request for user ${userId}`);

    // Pre-step: scenes.created_by references auth.users without ON DELETE CASCADE
    // Null it out so auth deletion won't be blocked by FK constraints.
    const { error: scenesErr } = await supabase
      .from('scenes')
      .update({ created_by: null })
      .eq('created_by', userId);

    if (scenesErr) {
      console.error('[delete-account] Failed to null scenes.created_by:', scenesErr);
      return fkBlockerResponse();
    }

    // Delete the auth user (cascades to FK'd data where ON DELETE CASCADE is set)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('[delete-account] Failed to delete user:', deleteError);
      const msg = (deleteError.message || '').toLowerCase();
      const looksLikeFkViolation =
        msg.includes('foreign key') ||
        msg.includes('violates foreign key') ||
        msg.includes('constraint') ||
        msg.includes('sqlstate 23503') ||
        msg.includes('23503');

      if (looksLikeFkViolation) {
        return fkBlockerResponse();
      }

      return res.status(500).json({ error: 'Failed to delete account', message: deleteError.message });
    }

    console.log(`[delete-account] Successfully deleted user ${userId}`);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[delete-account] Unexpected error deleting account:', error);
    return res.status(500).json({
      error: 'Failed to delete account',
      message: 'An unexpected error occurred while deleting your account. Please try again later.',
    });
  }
}
