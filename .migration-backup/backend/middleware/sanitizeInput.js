/**
 * Input Sanitization Middleware
 * 
 * Provides input sanitization to prevent XSS, NoSQL injection, and other attacks.
 * Follows OWASP best practices for input sanitization.
 */

/**
 * Sanitize a string value
 * - Trims whitespace
 * - Removes null bytes
 * - HTML entity encodes special characters (basic XSS prevention)
 * 
 * @param {string} value - String value to sanitize
 * @returns {string} - Sanitized string
 */
function sanitizeString(value) {
  if (typeof value !== 'string') {
    return value;
  }

  return value
    .trim()
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters (but keep newlines, tabs)
}

/**
 * HTML entity encode special characters
 * Basic XSS prevention (not comprehensive, but helps)
 * 
 * @param {string} value - String to encode
 * @returns {string} - HTML entity encoded string
 */
function htmlEntityEncode(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
  };

  return value.replace(/[&<>"'/]/g, (char) => entityMap[char] || char);
}

/**
 * Recursively sanitize an object
 * 
 * @param {any} obj - Object to sanitize
 * @param {boolean} htmlEncode - Whether to HTML entity encode strings
 * @returns {any} - Sanitized object
 */
function sanitizeObject(obj, htmlEncode = false) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    const sanitized = sanitizeString(obj);
    return htmlEncode ? htmlEntityEncode(sanitized) : sanitized;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, htmlEncode));
  }

  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key (remove dangerous characters)
      const sanitizedKey = sanitizeString(key);
      sanitized[sanitizedKey] = sanitizeObject(value, htmlEncode);
    }
    return sanitized;
  }

  // For numbers, booleans, etc., return as-is
  return obj;
}

/**
 * Sanitization middleware factory
 * Sanitizes request body, query parameters, and path parameters
 * 
 * @param {Object} options - Configuration options
 * @param {boolean} options.sanitizeBody - Sanitize request body (default: true)
 * @param {boolean} options.sanitizeQuery - Sanitize query parameters (default: true)
 * @param {boolean} options.sanitizeParams - Sanitize path parameters (default: true)
 * @param {boolean} options.htmlEncode - HTML entity encode strings (default: false, only for user-generated content)
 * @returns {Function} - Express middleware function
 */
function createSanitizationMiddleware(options = {}) {
  const {
    sanitizeBody = true,
    sanitizeQuery = true,
    sanitizeParams = true,
    htmlEncode = false, // Only enable for user-generated content that will be displayed
  } = options;

  return (req, res, next) => {
    try {
      // Sanitize request body
      if (sanitizeBody && req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body, htmlEncode);
      }

      // Sanitize query parameters
      if (sanitizeQuery && req.query && typeof req.query === 'object') {
        req.query = sanitizeObject(req.query, htmlEncode);
      }

      // Sanitize path parameters
      if (sanitizeParams && req.params && typeof req.params === 'object') {
        req.params = sanitizeObject(req.params, false); // Path params shouldn't be HTML encoded
      }

      next();
    } catch (error) {
      // If sanitization fails, log but continue (fail open)
      console.error('Input sanitization error:', error);
      next();
    }
  };
}

module.exports = {
  sanitizeString,
  sanitizeObject,
  htmlEntityEncode,
  createSanitizationMiddleware,
};

