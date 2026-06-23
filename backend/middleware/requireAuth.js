/**
 * Security: Verifies Supabase JWT and attaches req.user = { id, email }.
 * Prevents IDOR on routes that accept userId in body/query without auth.
 */

const { createClient } = require('@supabase/supabase-js');
const { getSupabaseConfig } = require('../config/apiKeys');

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!token) {
      return res.status(401).json({ success: false, error: 'Missing bearer token' });
    }

    const config = getSupabaseConfig('anon', true);
    const supabase = createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) {
      console.error('[requireAuth] Invalid token:', error?.message);
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    req.user = {
      id: data.user.id,
      email: data.user.email ?? null,
    };
    req.authToken = token;
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Security: Rejects requests where body/query userId does not match authenticated user.
 * @param {'body'|'query'} source
 */
function requireSelfUserId(source = 'body') {
  return (req, res, next) => {
    const claimed =
      source === 'query'
        ? req.query.userId || req.query.user_id
        : req.body?.userId || req.body?.user_id;

    if (claimed && String(claimed) !== String(req.user?.id)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: userId does not match authenticated user',
      });
    }
    return next();
  };
}

module.exports = {
  requireAuth,
  requireSelfUserId,
};
