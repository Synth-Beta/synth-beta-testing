/**
 * Input Validation Middleware
 * 
 * Provides schema-based validation using Joi.
 * Follows OWASP best practices:
 * - Validates all input fields
 * - Rejects unexpected fields (prevents mass assignment)
 * - Provides clear error messages
 * - Type coercion where safe
 */

const Joi = require('joi');

/**
 * Create validation middleware for request body
 * 
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {Object} options - Validation options
 * @param {boolean} options.stripUnknown - Strip unknown fields instead of rejecting (default: false for security)
 * @param {boolean} options.abortEarly - Return all errors or stop at first (default: false)
 * @returns {Function} - Express middleware function
 */
function validateBody(schema, options = {}) {
  const {
    stripUnknown = false, // Default to false to reject unexpected fields (more secure)
    abortEarly = false, // Return all errors for better UX
  } = options;

  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly,
      stripUnknown,
      allowUnknown: false, // Reject unknown fields for security
      convert: true, // Type coercion where safe
    });

    if (error) {
      // Format validation errors
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      // Log rejected fields for debugging
      if (!stripUnknown) {
        const rejectedFields = errors
          .filter(e => e.message.includes('not allowed'))
          .map(e => e.field);
        if (rejectedFields.length > 0) {
          console.warn('Rejected unexpected fields:', rejectedFields);
        }
      }

      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Invalid input data',
        details: errors,
      });
    }

    // Replace request body with validated (and potentially coerced) value
    req.body = value;
    // Also store in req.validated for explicit access
    req.validated = value;
    next();
  };
}

/**
 * Create validation middleware for query parameters
 * 
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {Object} options - Validation options
 * @returns {Function} - Express middleware function
 */
function validateQuery(schema, options = {}) {
  const {
    stripUnknown = false,
    abortEarly = false,
  } = options;

  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly,
      stripUnknown,
      allowUnknown: false,
      convert: true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Invalid query parameters',
        details: errors,
      });
    }

    req.query = value;
    req.validatedQuery = value;
    next();
  };
}

/**
 * Create validation middleware for path parameters
 * 
 * @param {Object.<string, Joi.Schema>} schemaMap - Map of parameter names to schemas
 * @returns {Function} - Express middleware function
 */
function validateParams(schemaMap) {
  return (req, res, next) => {
    const errors = [];
    const validated = {};

    for (const [paramName, schema] of Object.entries(schemaMap)) {
      const value = req.params[paramName];
      const { error, value: validatedValue } = schema.validate(value, {
        convert: true,
      });

      if (error) {
        errors.push({
          field: paramName,
          message: error.details[0].message,
          value,
        });
      } else {
        validated[paramName] = validatedValue;
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Invalid path parameters',
        details: errors,
      });
    }

    // Update params with validated values
    Object.assign(req.params, validated);
    req.validatedParams = validated;
    next();
  };
}

/**
 * Combined validation middleware for convenience
 * Validates body, query, and params all at once
 * 
 * @param {Object} schemas - Object with body, query, and/or params schemas
 * @param {Joi.Schema} schemas.body - Schema for request body
 * @param {Joi.Schema} schemas.query - Schema for query parameters
 * @param {Object.<string, Joi.Schema>} schemas.params - Map of path parameter schemas
 * @returns {Function} - Express middleware function
 */
function validateInput(schemas) {
  const middlewares = [];

  if (schemas.body) {
    middlewares.push(validateBody(schemas.body, schemas.bodyOptions || {}));
  }

  if (schemas.query) {
    middlewares.push(validateQuery(schemas.query, schemas.queryOptions || {}));
  }

  if (schemas.params) {
    middlewares.push(validateParams(schemas.params));
  }

  // Return middleware chain
  return (req, res, next) => {
    let index = 0;

    function runNext() {
      if (index >= middlewares.length) {
        return next();
      }

      const middleware = middlewares[index++];
      middleware(req, res, (err) => {
        if (err) {
          return next(err);
        }
        runNext();
      });
    }

    runNext();
  };
}

module.exports = {
  validateBody,
  validateQuery,
  validateParams,
  validateInput,
};

