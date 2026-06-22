/**
 * Authentication Routes
 * 
 * Handles authentication endpoints, specifically Apple Sign In.
 * Uses strict rate limiting (more restrictive than normal APIs) to protect
 * high-value authentication endpoints from abuse.
 */

const express = require('express');
const { authenticateUser, createSession } = require('./services/authService');
const { createRateLimiter } = require('./middleware/rateLimiter');
const { validateBody } = require('./middleware/validateInput');
const { createSanitizationMiddleware } = require('./middleware/sanitizeInput');
const { appleAuthSchema } = require('./validation/schemas');

const NODE_ENV = process.env.NODE_ENV || 'development';

const router = express.Router();

// Sanitization middleware
const sanitize = createSanitizationMiddleware({ sanitizeBody: true });

// Rate limiting: Use strict tier for authentication endpoints (more restrictive than normal APIs)
// Authentication endpoints are high-value attack targets, so they need stricter limits
// DEV mode also respects rate limits to prevent abuse during development
const authRateLimiter = createRateLimiter('strict'); // 10 req/min per IP/user

/**
 * POST /auth/apple
 *
 * NOTE: This endpoint is NOT used in production.
 *
 * Real Apple Sign In flows through Supabase directly:
 *   iOS native → Apple identity token → supabase.auth.signInWithIdToken() → Supabase session
 * Supabase verifies the Apple token with Apple's servers and creates a real user session.
 * This backend route was scaffolded as a placeholder for a custom auth server that was
 * never needed. It is intentionally disabled in production to prevent accidental use.
 *
 * Dev mode only: returns a mock user so you can exercise backend endpoints without
 * a real Apple device present.
 *
 * Request body:
 * {
 *   "identityToken": "jwt_token_string"
 * }
 */
router.post('/auth/apple',
  sanitize,
  authRateLimiter, // Strict rate limiting for auth endpoints
  validateBody(appleAuthSchema),
  async (req, res) => {
    // Block in production — real auth goes through Supabase, not this endpoint.
    if (NODE_ENV === 'production') {
      return res.status(501).json({
        success: false,
        error: 'Not implemented',
        message: 'Apple authentication is handled by Supabase. This endpoint is not active in production.'
      });
    }

    try {
      const { identityToken } = req.body;

      // DEV mode: authenticate via AUTH_MODE (returns mock user for local testing)
      const user = await authenticateUser(identityToken);
      const session = createSession(user);

      res.json({
        success: true,
        session: {
          token: session.token,
          expiresAt: session.expiresAt
        },
        user: session.user
      });

    } catch (error) {
      console.error('Apple authentication error:', error);
      res.status(500).json({
        success: false,
        error: 'Authentication failed',
        message: 'Unable to authenticate user. Please try again.'
      });
    }
  }
);

module.exports = router;
