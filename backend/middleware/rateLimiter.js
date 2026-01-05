/**
 * Rate Limiting Middleware
 * 
 * Provides IP + user-based rate limiting with Upstash Redis backend for serverless environments.
 * Falls back to in-memory store if Upstash is not configured.
 * 
 * Follows OWASP best practices for rate limiting:
 * - Combines IP and user ID for accurate tracking
 * - Provides graceful 429 responses with Retry-After headers
 * - Supports multiple rate limit tiers
 */

const { Ratelimit } = require('@upstash/ratelimit');
const { Redis } = require('@upstash/redis');
const rateLimit = require('express-rate-limit');

// Rate limit tier configurations
const RATE_LIMIT_TIERS = {
  strict: {
    requests: 10,
    window: '1 m', // 1 minute
    description: 'Strict limits for search endpoints and data modification'
  },
  moderate: {
    requests: 30,
    window: '1 m', // 1 minute
    description: 'Moderate limits for read-only endpoints and profile views'
  },
  lenient: {
    requests: 100,
    window: '1 m', // 1 minute
    description: 'Lenient limits for health checks and static data'
  }
};

// In-memory fallback store for when Upstash is not configured
const inMemoryStore = new Map();

/**
 * Get client identifier (IP + user ID if available)
 * @param {Object} req - Express request object
 * @returns {string} - Client identifier string
 */
function getClientIdentifier(req) {
  // Try to get user ID from JWT token (if authenticated)
  let userId = null;
  try {
    // Check for Supabase auth header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // In a real implementation, you'd decode the JWT here
      // For now, we'll use IP + a hash of the token if present
      const token = authHeader.substring(7);
      // Simple hash for identification (not for security)
      userId = token.substring(0, 16);
    }
  } catch (error) {
    // If token parsing fails, fall back to IP only
    console.warn('Failed to extract user ID from token:', error.message);
  }

  // Get IP address (considering proxy headers)
  const ip = req.ip || 
             req.connection.remoteAddress || 
             req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             'unknown';

  // Combine IP and user ID for accurate tracking
  if (userId) {
    return `${ip}:${userId}`;
  }
  return ip;
}

/**
 * Initialize Upstash Redis rate limiter (if configured)
 * Falls back to in-memory if not available
 */
function initializeRateLimiter() {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    try {
      const redis = new Redis({
        url: upstashUrl,
        token: upstashToken,
      });

      return {
        type: 'upstash',
        ratelimit: new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow,
          analytics: true,
        }),
      };
    } catch (error) {
      console.warn('Failed to initialize Upstash Redis, falling back to in-memory:', error.message);
    }
  } else {
    console.log('Upstash Redis not configured (UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN), using in-memory rate limiting');
  }

  // Fallback to in-memory store
  return {
    type: 'memory',
    store: inMemoryStore,
  };
}

const rateLimiterBackend = initializeRateLimiter();

/**
 * In-memory rate limiting implementation
 */
function checkInMemoryRateLimit(identifier, tier) {
  const config = RATE_LIMIT_TIERS[tier];
  const windowMs = parseWindow(config.window);
  const now = Date.now();
  const key = `${identifier}:${tier}`;

  if (!inMemoryStore.has(key)) {
    inMemoryStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return { success: true, remaining: config.requests - 1, reset: now + windowMs };
  }

  const record = inMemoryStore.get(key);

  // Reset if window has passed
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
    inMemoryStore.set(key, record);
    return { success: true, remaining: config.requests - 1, reset: record.resetTime };
  }

  // Check if limit exceeded
  if (record.count >= config.requests) {
    return { 
      success: false, 
      remaining: 0, 
      reset: record.resetTime,
      limit: config.requests,
    };
  }

  // Increment counter
  record.count++;
  inMemoryStore.set(key, record);
  return { 
    success: true, 
    remaining: config.requests - record.count, 
    reset: record.resetTime 
  };
}

/**
 * Parse window string (e.g., "1 m", "5 s") to milliseconds
 */
function parseWindow(windowStr) {
  const parts = windowStr.trim().split(/\s+/);
  const value = parseInt(parts[0], 10);
  const unit = parts[1]?.toLowerCase() || 's';

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * (multipliers[unit] || 1000);
}

/**
 * Create rate limiting middleware for a specific tier
 * @param {string} tier - Rate limit tier: 'strict', 'moderate', or 'lenient'
 * @returns {Function} - Express middleware function
 */
function createRateLimiter(tier = 'moderate') {
  if (!RATE_LIMIT_TIERS[tier]) {
    throw new Error(`Invalid rate limit tier: ${tier}. Must be one of: ${Object.keys(RATE_LIMIT_TIERS).join(', ')}`);
  }

  const config = RATE_LIMIT_TIERS[tier];

  return async (req, res, next) => {
    const identifier = getClientIdentifier(req);

    try {
      let result;

      if (rateLimiterBackend.type === 'upstash') {
        // Use Upstash Redis rate limiting
        result = await rateLimiterBackend.ratelimit.limit(
          `${identifier}:${tier}`,
          {
            requests: config.requests,
            window: config.window,
          }
        );
      } else {
        // Use in-memory rate limiting
        result = checkInMemoryRateLimit(identifier, tier);
      }

      // Set rate limit headers (RFC 7231)
      res.set({
        'X-RateLimit-Limit': config.requests.toString(),
        'X-RateLimit-Remaining': result.remaining?.toString() || '0',
        'X-RateLimit-Reset': new Date(result.reset || Date.now()).toISOString(),
      });

      if (!result.success) {
        // Calculate retry after seconds
        const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);

        // Set Retry-After header (RFC 7231)
        res.set('Retry-After', retryAfter.toString());

        // Log rate limit violation for monitoring
        console.warn(`Rate limit exceeded for ${identifier} on tier ${tier}:`, {
          identifier,
          tier,
          limit: config.requests,
          retryAfter,
        });

        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          message: `Too many requests. Please try again after ${retryAfter} seconds.`,
          retry_after: retryAfter,
          limit: config.requests,
          window: config.window,
        });
      }

      // Rate limit check passed
      next();
    } catch (error) {
      // If rate limiting fails, log but don't block the request (fail open)
      console.error('Rate limiting error:', error);
      console.warn('Rate limiting failed, allowing request (fail-open)');
      next();
    }
  };
}

/**
 * Cleanup old entries from in-memory store periodically
 */
setInterval(() => {
  if (rateLimiterBackend.type === 'memory') {
    const now = Date.now();
    for (const [key, record] of inMemoryStore.entries()) {
      if (now > record.resetTime + 60000) { // Keep for 1 minute after reset
        inMemoryStore.delete(key);
      }
    }
  }
}, 60000); // Run every minute

module.exports = {
  createRateLimiter,
  RATE_LIMIT_TIERS,
};

