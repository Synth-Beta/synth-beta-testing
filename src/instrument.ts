import * as Sentry from "@sentry/react";

// `vite preview` serves the production build, so import.meta.env.MODE alone
// can't tell a local preview run apart from the real deploy - hostname can.
const isLocalhost = typeof window !== 'undefined' &&
  /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

Sentry.init({
  // DSN is public. Fallback because VITE_SENTRY_DSN was missing in Vercel and prod shipped with dsn: undefined (Sentry silently off).
  dsn: import.meta.env.VITE_SENTRY_DSN || 'https://4fbeb83195790730e005e781854882ee@o4510262186409984.ingest.us.sentry.io/4510262206922752',
  enabled: import.meta.env.PROD,
  environment: isLocalhost ? 'local' : import.meta.env.MODE,
  tracesSampleRate: 0.05,
});
