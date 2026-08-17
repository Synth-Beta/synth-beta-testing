/**
 * Legacy `/admin` on the consumer Vite app (port 5174) is retired.
 * Canonical ops portal is `apps/admin` → getsynth.app/admin (local :5173).
 */
import { useEffect } from 'react';

const CANONICAL_ADMIN_PROD = 'https://getsynth.app/admin';
const CANONICAL_ADMIN_LOCAL = 'http://localhost:5173/admin';

function resolveCanonicalAdminUrl(): string {
  const fromEnv = import.meta.env.VITE_CANONICAL_ADMIN_URL?.trim();
  if (fromEnv) {
    return fromEnv.includes('?') || fromEnv.includes('#')
      ? fromEnv
      : `${fromEnv.replace(/\/$/, '')}?tab=ai-scene-guides`;
  }
  const base =
    import.meta.env.DEV || window.location.hostname === 'localhost'
      ? CANONICAL_ADMIN_LOCAL
      : CANONICAL_ADMIN_PROD;
  return `${base}?tab=ai-scene-guides`;
}

export default function AdminRedirect() {
  const href = resolveCanonicalAdminUrl();

  useEffect(() => {
    window.location.replace(href);
  }, [href]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
        background: '#fafafa',
        color: '#111',
      }}
    >
      <h1 style={{ margin: 0, fontSize: 20 }}>Redirecting to Synth Admin…</h1>
      <p style={{ margin: 0, color: '#555', textAlign: 'center', maxWidth: 420 }}>
        The consumer-app <code>/admin</code> page was removed. Canonical admin lives in{' '}
        <code>apps/admin</code>.
      </p>
      <a href={href} style={{ color: '#CC2486', fontWeight: 600 }}>
        Continue to admin (AI Scene Guides)
      </a>
    </div>
  );
}
