/**
 * Security: Validates required environment variables at startup so missing secrets
 * fail fast instead of falling back to hardcoded defaults in scripts or routes.
 */

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

/** @type {{ env: string; name: string; productionOnly?: boolean; backendOnly?: boolean }[]} */
const REQUIRED = [
  { env: 'SUPABASE_URL', name: 'Supabase URL' },
  { env: 'SUPABASE_ANON_KEY', name: 'Supabase anon/publishable key' },
  { env: 'JAMBASE_API_KEY', name: 'JamBase API key' },
];

/** @type {{ env: string; name: string }[]} */
const PRODUCTION_REQUIRED = [
  { env: 'SUPABASE_SERVICE_ROLE_KEY', name: 'Supabase service role key (server/scripts only)' },
  { env: 'CRON_SECRET', name: 'Cron/internal route shared secret' },
  { env: 'JWT_SECRET', name: 'Backend JWT secret (dev auth scaffold)' },
];

/** @type {{ env: string; name: string }[]} */
const OPTIONAL_WARN = [
  { env: 'SETLIST_FM_API_KEY', name: 'Setlist.fm API key' },
  { env: 'PUSH_WEBHOOK_SECRET', name: 'Push notification webhook shared secret' },
  { env: 'UPSTASH_REDIS_REST_URL', name: 'Upstash Redis URL (rate limiting)' },
  { env: 'UPSTASH_REDIS_REST_TOKEN', name: 'Upstash Redis token' },
  { env: 'TM_API_KEY', name: 'Ticketmaster API key (ingest scripts)' },
  { env: 'TICKETMASTER_API_KEY', name: 'Ticketmaster API key alias' },
];

/**
 * @param {boolean} [allowMissingInDev=false]
 * @returns {{ ok: boolean; errors: string[]; warnings: string[] }}
 */
function validateRequiredEnv(allowMissingInDev = false) {
  const errors = [];
  const warnings = [];

  for (const { env, name } of REQUIRED) {
    if (!process.env[env]?.trim()) {
      errors.push(`${name} (${env}) is required`);
    }
  }

  if (isProduction) {
    for (const { env, name } of PRODUCTION_REQUIRED) {
      if (!process.env[env]?.trim()) {
        errors.push(`${name} (${env}) is required in production`);
      }
    }
  }

  for (const { env, name } of OPTIONAL_WARN) {
    if (!process.env[env]?.trim()) {
      warnings.push(`${name} (${env}) is not set`);
    }
  }

  if (errors.length > 0 && !(allowMissingInDev && !isProduction)) {
    return { ok: false, errors, warnings };
  }

  return { ok: true, errors: [], warnings };
}

/**
 * @param {boolean} [allowMissingInDev=false]
 */
function assertRequiredEnv(allowMissingInDev = false) {
  const result = validateRequiredEnv(allowMissingInDev);
  for (const w of result.warnings) {
    console.warn(`⚠️  ${w}`);
  }
  if (!result.ok) {
    throw new Error(`Missing required environment variables:\n${result.errors.join('\n')}`);
  }
  console.log('✅ Required environment variables are configured');
}

module.exports = {
  validateRequiredEnv,
  assertRequiredEnv,
  REQUIRED,
  PRODUCTION_REQUIRED,
  OPTIONAL_WARN,
};
