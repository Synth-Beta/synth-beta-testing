/**
 * Centralized Validation Schemas
 * 
 * Uses Joi for schema-based validation following OWASP best practices:
 * - Type checking
 * - Length limits
 * - Pattern validation (UUIDs, emails, etc.)
 * - Rejects unexpected fields (prevent mass assignment)
 */

const Joi = require('joi');

// Common validation patterns
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATE_CODE_PATTERN = /^[A-Z]{2}$/;
const ZIP_CODE_PATTERN = /^\d{5}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;

/**
 * Search Concert Request Schema
 * Used for POST /api/search-concerts
 */
const searchConcertSchema = Joi.object({
  query: Joi.string()
    .required()
    .min(1)
    .max(100)
    .trim()
    .messages({
      'string.empty': 'Search query cannot be empty',
      'string.max': 'Search query must be 100 characters or less',
    }),
  filters: Joi.object({
    dateRange: Joi.object({
      startDate: Joi.date().iso().allow(null),
      endDate: Joi.date().iso().greater(Joi.ref('startDate')).allow(null),
    }).allow(null),
    location: Joi.object({
      city: Joi.string().max(50).trim().allow(null),
      state: Joi.string().length(2).pattern(STATE_CODE_PATTERN).uppercase().allow(null),
      zipCode: Joi.string().pattern(ZIP_CODE_PATTERN).allow(null),
      radius: Joi.number().min(1).max(500).integer().allow(null),
    }).allow(null),
    genres: Joi.array()
      .items(Joi.string().max(20).trim())
      .max(10)
      .allow(null),
  }).allow(null),
  options: Joi.object({
    limit: Joi.number().min(5).max(20).integer().default(15),
    fuzzyThreshold: Joi.number().min(0.1).max(1.0).default(0.6),
  }).allow(null),
}).unknown(false); // Reject unexpected fields

/**
 * Streaming Profile Upload Schema
 * Used for POST /api/user/streaming-profile
 */
const streamingProfileUploadSchema = Joi.object({
  service: Joi.string()
    .required()
    .valid('spotify', 'apple-music')
    .messages({
      'any.only': 'Service must be either "spotify" or "apple-music"',
    }),
  data: Joi.object()
    .required()
    .unknown(true) // Allow flexible structure for streaming service data
    .custom((value, helpers) => {
      // Basic check: ensure data is an object (not too large)
      const stringified = JSON.stringify(value);
      if (stringified.length > 50000) { // 50KB limit
        return helpers.error('object.max');
      }
      return value;
    })
    .messages({
      'object.max': 'Profile data is too large (max 50KB)',
    }),
  userId: Joi.string()
    .pattern(UUID_PATTERN)
    .allow(null)
    .messages({
      'string.pattern.base': 'userId must be a valid UUID',
    }),
}).unknown(false);

/**
 * Streaming Profile Get Schema (query params)
 * Used for GET /api/user/streaming-profile/:service
 */
const streamingProfileGetQuerySchema = Joi.object({
  userId: Joi.string()
    .required()
    .pattern(UUID_PATTERN)
    .messages({
      'string.pattern.base': 'userId must be a valid UUID',
      'any.required': 'userId query parameter is required',
    }),
}).unknown(false);

/**
 * Streaming Profile Delete Schema
 * Used for DELETE /api/user/streaming-profile/:service
 */
const streamingProfileDeleteSchema = Joi.object({
  userId: Joi.string()
    .required()
    .pattern(UUID_PATTERN)
    .messages({
      'string.pattern.base': 'userId must be a valid UUID',
      'any.required': 'userId is required',
    }),
}).unknown(false);

/**
 * Setlist Search Query Schema
 * Used for GET /api/setlists/search
 */
const setlistSearchQuerySchema = Joi.object({
  artistName: Joi.string()
    .max(100)
    .trim()
    .allow(null, ''),
  date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$|^\d{2}-\d{2}-\d{4}$/)
    .allow(null, ''),
  venueName: Joi.string()
    .max(100)
    .trim()
    .allow(null, ''),
  cityName: Joi.string()
    .max(50)
    .trim()
    .allow(null, ''),
  stateCode: Joi.string()
    .length(2)
    .pattern(STATE_CODE_PATTERN)
    .uppercase()
    .allow(null, ''),
}).unknown(false);

/**
 * Location Search Query Schema
 * Used for GET /api/location/search
 */
const locationSearchQuerySchema = Joi.object({
  city: Joi.string()
    .max(50)
    .trim()
    .allow(null, ''),
  lat: Joi.number()
    .min(-90)
    .max(90)
    .allow(null),
  lng: Joi.number()
    .min(-180)
    .max(180)
    .allow(null),
  radius: Joi.number()
    .min(1)
    .max(500)
    .integer()
    .default(25)
    .allow(null),
  limit: Joi.number()
    .min(1)
    .max(100)
    .integer()
    .default(50)
    .allow(null),
}).unknown(false);

/**
 * Concert Search Query Schema (GET endpoint)
 * Used for GET /api/concerts/search
 */
const concertSearchQuerySchema = Joi.object({
  query: Joi.string()
    .max(100)
    .trim()
    .allow(null, ''),
  date: Joi.string()
    .pattern(ISO_DATE_PATTERN)
    .allow(null, ''),
  artist: Joi.string()
    .max(100)
    .trim()
    .allow(null, ''),
  venue: Joi.string()
    .max(100)
    .trim()
    .allow(null, ''),
  tour: Joi.string()
    .max(100)
    .trim()
    .allow(null, ''),
  limit: Joi.number()
    .min(1)
    .max(100)
    .integer()
    .default(10)
    .allow(null),
  offset: Joi.number()
    .min(0)
    .integer()
    .default(0)
    .allow(null),
}).unknown(false);

/**
 * Service Parameter Schema
 * Used for path parameters like :service
 */
const serviceParamSchema = Joi.string()
  .required()
  .valid('spotify', 'apple-music')
  .messages({
    'any.only': 'Service must be either "spotify" or "apple-music"',
  });

/**
 * UUID Parameter Schema
 * Used for path parameters that should be UUIDs
 */
const uuidParamSchema = Joi.string()
  .required()
  .pattern(UUID_PATTERN)
  .messages({
    'string.pattern.base': 'Parameter must be a valid UUID',
  });

module.exports = {
  searchConcertSchema,
  streamingProfileUploadSchema,
  streamingProfileGetQuerySchema,
  streamingProfileDeleteSchema,
  setlistSearchQuerySchema,
  locationSearchQuerySchema,
  concertSearchQuerySchema,
  serviceParamSchema,
  uuidParamSchema,
  
  // Common patterns for reuse
  UUID_PATTERN,
  EMAIL_PATTERN,
  STATE_CODE_PATTERN,
  ZIP_CODE_PATTERN,
  ISO_DATE_PATTERN,
};

