/**
 * Security: Global Express error handler — logs full errors server-side only;
 * never exposes Postgres stack traces or raw error.message to clients in production.
 */

const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * @param {Error} error
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  console.error('Unhandled server error:', {
    path: req.originalUrl,
    method: req.method,
    message: error?.message,
    stack: error?.stack,
  });

  const status = error.status || error.statusCode || 500;
  res.status(status).json({
    success: false,
    error: status >= 500 ? 'Something went wrong' : (error.message || 'Request failed'),
    ...(NODE_ENV === 'development' && { details: error.message }),
  });
}

/**
 * Wrap async route handlers so rejections reach errorHandler.
 * @param {import('express').RequestHandler} fn
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  errorHandler,
  asyncHandler,
};
