import * as Sentry from "@sentry/react";

// `vite preview` serves the production build, so import.meta.env.MODE alone
// can't tell a local preview run apart from the real deploy - hostname can.
const isLocalhost = typeof window !== 'undefined' &&
  /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: isLocalhost ? 'local' : import.meta.env.MODE,
  tracesSampleRate: 0.05,
});
