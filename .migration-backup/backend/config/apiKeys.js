/**
 * API Key Management and Rotation Framework
 * 
 * Provides secure API key handling with support for key rotation.
 * Follows OWASP best practices:
 * - No hard-coded keys
 * - Support for primary/secondary keys during rotation
 * - Automatic fallback on key failure
 * - Logging for security monitoring
 */

/**
 * API Key Configuration
 * Supports primary and secondary keys for graceful rotation
 */
const keyConfig = {
  jambase: {
    primary: process.env.JAMBASE_API_KEY,
    secondary: process.env.JAMBASE_API_KEY_OLD, // Optional, for rotation
    rotationDate: process.env.JAMBASE_ROTATION_DATE ? new Date(process.env.JAMBASE_ROTATION_DATE) : null,
  },
  setlistFm: {
    primary: process.env.SETLIST_FM_API_KEY,
    secondary: process.env.SETLIST_FM_API_KEY_OLD,
    rotationDate: process.env.SETLIST_FM_ROTATION_DATE ? new Date(process.env.SETLIST_FM_ROTATION_DATE) : null,
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
};

/**
 * Track which key was used (for monitoring)
 */
const keyUsage = {
  jambase: { primary: 0, secondary: 0, failures: 0 },
  setlistFm: { primary: 0, secondary: 0, failures: 0 },
};

/**
 * Get API key for a service
 * Tries primary key first, falls back to secondary if primary fails
 * 
 * @param {string} service - Service name ('jambase' or 'setlistFm')
 * @param {boolean} requireKey - Whether to throw error if key is missing (default: true)
 * @returns {string} - API key
 */
function getApiKey(service, requireKey = true) {
  const config = keyConfig[service];

  if (!config) {
    throw new Error(`Unknown service: ${service}`);
  }

  // Check if primary key exists
  if (config.primary) {
    // Check if we're past rotation date (secondary should be used)
    if (config.rotationDate && new Date() > config.rotationDate && config.secondary) {
      console.warn(`⚠️  Rotation date passed for ${service}, using secondary key`);
      keyUsage[service].secondary++;
      return config.secondary;
    }

    keyUsage[service].primary++;
    return config.primary;
  }

  // Try secondary key if primary is missing
  if (config.secondary) {
    console.warn(`⚠️  Primary key missing for ${service}, using secondary key`);
    keyUsage[service].secondary++;
    return config.secondary;
  }

  // No key available
  if (requireKey) {
    throw new Error(`API key for ${service} is required but not configured. Set ${service.toUpperCase()}_API_KEY environment variable.`);
  }

  return null;
}

/**
 * Report API key failure
 * Can trigger fallback to secondary key if available
 * 
 * @param {string} service - Service name
 * @param {string} key - The key that failed
 * @param {Error} error - Error that occurred
 * @returns {string|null} - Alternative key if available, null otherwise
 */
function reportKeyFailure(service, key, error) {
  const config = keyConfig[service];
  keyUsage[service].failures++;

  console.error(`❌ API key failure for ${service}:`, error.message);

  // If primary key failed and secondary exists, try secondary
  if (key === config.primary && config.secondary) {
    console.log(`🔄 Falling back to secondary key for ${service}`);
    keyUsage[service].secondary++;
    return config.secondary;
  }

  return null;
}

/**
 * Get Supabase configuration
 * 
 * @param {string} keyType - 'anon' or 'serviceRole'
 * @param {boolean} requireKey - Whether to throw error if missing (default: true)
 * @returns {Object} - Supabase configuration object
 */
function getSupabaseConfig(keyType = 'anon', requireKey = true) {
  const { url, anonKey, serviceRoleKey } = keyConfig.supabase;

  if (!url) {
    if (requireKey) {
      throw new Error('SUPABASE_URL is required but not configured');
    }
    return null;
  }

  const key = keyType === 'serviceRole' ? serviceRoleKey : anonKey;

  if (!key) {
    if (requireKey) {
      throw new Error(`SUPABASE_${keyType === 'serviceRole' ? 'SERVICE_ROLE' : 'ANON'}_KEY is required but not configured`);
    }
    return null;
  }

  return { url, key };
}

/**
 * Validate all required API keys are configured
 * Call this at application startup
 * 
 * @param {boolean} allowMissing - Allow missing keys in development (default: false)
 */
function validateApiKeys(allowMissing = false) {
  const NODE_ENV = process.env.NODE_ENV || 'development';
  const errors = [];

  // Required keys (always required in production)
  const requiredKeys = [
    { env: 'SUPABASE_URL', name: 'Supabase URL' },
    { env: 'SUPABASE_ANON_KEY', name: 'Supabase Anon Key' },
    { env: 'JAMBASE_API_KEY', name: 'JamBase API Key' },
  ];

  for (const { env, name } of requiredKeys) {
    if (!process.env[env]) {
      errors.push(`${name} (${env}) is required`);
    }
  }

  // Optional keys (warn if missing)
  const optionalKeys = [
    { env: 'SETLIST_FM_API_KEY', name: 'Setlist.fm API Key' },
  ];

  for (const { env, name } of optionalKeys) {
    if (!process.env[env]) {
      console.warn(`⚠️  ${name} (${env}) is not configured. Setlist features will not work.`);
    }
  }

  // In production, require all keys
  if (NODE_ENV === 'production' && errors.length > 0) {
    throw new Error(`Missing required API keys:\n${errors.join('\n')}`);
  }

  // In development, log warnings if allowMissing is true
  if (allowMissing && errors.length > 0) {
    console.warn('⚠️  Missing API keys (development mode):', errors.join(', '));
  } else if (errors.length > 0) {
    throw new Error(`Missing required API keys:\n${errors.join('\n')}`);
  }

  console.log('✅ All required API keys are configured');
}

/**
 * Get key usage statistics (for monitoring)
 * 
 * @returns {Object} - Usage statistics
 */
function getKeyUsageStats() {
  return {
    ...keyUsage,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  getApiKey,
  reportKeyFailure,
  getSupabaseConfig,
  validateApiKeys,
  getKeyUsageStats,
  keyConfig, // Exported for testing only
};

