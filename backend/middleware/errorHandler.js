/**
 * Security: Global Express error handler — logs full errors server-side only;
 * never exposes Postgres stack traces or raw error.message to clients in production.
 */

const NODE_ENV = process.env.NODE_ENV || 'development';
const recentAlerts = new Map();

function statusWillAlert(error) {
  const status = error?.status || error?.statusCode || 500;
  return status >= 500;
}

function notifyAdminBot(error, req) {
  if (NODE_ENV === 'development' || NODE_ENV === 'test') return;
  const key = `${req.method} ${req.originalUrl} ${error?.message || ''}`.slice(0, 180);
  const now = Date.now();
  const last = recentAlerts.get(key) || 0;
  if (now - last < 30 * 60 * 1000) return;
  recentAlerts.set(key, now);
  fetch('https://join.getsynth.app/api/ops-alert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'client',
      surface: 'web',
      severity: 'bug',
      message: error?.message || 'Unhandled API error',
      stack: error?.stack,
      context: `${req.method} ${req.originalUrl}`,
      platform: 'api',
    }),
  }).catch(() => {});
}

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

  if (statusWillAlert(error)) {
    notifyAdminBot(error, req);
  }

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
