import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { parseShareUrl, buildWebAppUrlFromShare } from '@synth/shared';

function useQuery(): URLSearchParams {
  const { search } = useLocation();
  return React.useMemo(() => new URLSearchParams(search), [search]);
}

/**
 * Dev-only fallback for Vite.
 *
 * In production on Vercel, `/share?...` is rewritten to the server-rendered OG
 * endpoint in `api/share.ts` via `vercel.json`.
 */
export function SharePage() {
  const q = useQuery();
  const event = q.get('event');
  const review = q.get('review');
  const artist = q.get('artist');
  const venue = q.get('venue');

  const kind = event ? 'event' : review ? 'review' : artist ? 'artist' : venue ? 'venue' : null;
  const id = event ?? review ?? artist ?? venue;

  const pending = parseShareUrl(q.toString() ? `?${q.toString()}` : '');
  const siteUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://join.getsynth.app';
  const inAppPath = pending
    ? (() => {
        const u = new URL(buildWebAppUrlFromShare(siteUrl, pending));
        return `${u.pathname}${u.search}`;
      })()
    : '/';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>Synth share link</h1>
        {kind && id ? (
          <p style={{ marginBottom: 16, color: 'rgba(0,0,0,0.7)' }}>
            This is a <b>{kind}</b> share link. In production, this route is server-rendered for iMessage/OG previews.
          </p>
        ) : (
          <p style={{ marginBottom: 16, color: 'rgba(0,0,0,0.7)' }}>
            Missing share parameters. Expected one of <code>?event=</code>, <code>?review=</code>, <code>?artist=</code>, or <code>?venue=</code>.
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link
            to="/"
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              background: '#111',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Open Synth (home)
          </Link>
          {kind && id && pending ? (
            <Link
              to={inAppPath}
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: 'rgba(0,0,0,0.06)',
                color: '#111',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              Open {kind} in app
            </Link>
          ) : null}
        </div>

        <div style={{ marginTop: 18, fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>
          If you see a 404 on <code>localhost</code>, it means Vite is not applying the Vercel rewrite. Production will use
          <code> vercel.json </code> rewrite: <code>/share → /api/share</code>.
        </div>
      </div>
    </div>
  );
}
