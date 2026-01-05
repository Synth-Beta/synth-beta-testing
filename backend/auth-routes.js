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
 * Authenticate user with Apple Sign In identity token.
 * 
 * Currently supports:
 * - DEV mode: Returns mock user for testing
 * - APPLE mode: Stub that accepts token but returns mock user (verification not yet implemented)
 * 
 * Request body:
 * {
 *   "identityToken": "jwt_token_string"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "session": {
 *     "token": "jwt_session_token",
 *     "expiresAt": "2024-12-31T23:59:59.000Z"
 *   },
 *   "user": {
 *     "id": "uuid",
 *     "apple_user_id": "string",
 *     "email": "string | null",
 *     "name": "string",
 *     ...
 *   }
 * }
 */
router.post('/auth/apple',
  sanitize,
  authRateLimiter, // Strict rate limiting for auth endpoints
  validateBody(appleAuthSchema),
  async (req, res) => {
    try {
      const { identityToken } = req.body;

      // Authenticate user based on AUTH_MODE
      const user = await authenticateUser(identityToken);

      // Create session for authenticated user
      const session = createSession(user);

      // Return success response with session and user data
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
      
      // Return generic error (don't expose implementation details)
      res.status(500).json({
        success: false,
        error: 'Authentication failed',
        message: 'Unable to authenticate user. Please try again.'
      });
    }
  }
);

module.exports = router;

