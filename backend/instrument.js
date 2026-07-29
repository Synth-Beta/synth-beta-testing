// Loaded first, before any other module, so Sentry's auto-instrumentation
// (http, express, etc.) can hook in before those modules are required.
const path = require('path');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env') });
require('dotenv').config({ path: path.join(root, '.env.local'), override: true });

const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN_BACKEND,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: 0.05,
});

module.exports = Sentry;
