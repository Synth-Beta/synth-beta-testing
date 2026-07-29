import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { downloadArtifact, type DownloadKind } from '../lib/download';
import writingStyleGuide from '../../bundle/synth-brand/reference/writing-style-guide.md?raw';
import nicheAndDistribution from '../../bundle/synth-product/reference/niche-and-distribution.md?raw';

const COLORS = [
  { name: 'Brand Pink 500', hex: '#CC2486', token: '--brand-pink-500', role: 'Primary brand' },
  { name: 'Brand Pink 600', hex: '#951A6D', token: '--brand-pink-600', role: 'Hover' },
  { name: 'Brand Pink 700', hex: '#7B1559', token: '--brand-pink-700', role: 'Pressed' },
  { name: 'Brand Pink 050', hex: '#FDF2F7', token: '--brand-pink-050', role: 'Soft surface' },
  { name: 'Purple Accent', hex: '#8D1FF4', token: 'gradient end', role: 'Brand gradient' },
  { name: 'Neutral 900', hex: '#0E0E0E', token: '--neutral-900', role: 'Primary text' },
  { name: 'Neutral 600', hex: '#5D646F', token: '--neutral-600', role: 'Secondary text' },
  { name: 'Neutral 50', hex: '#FCFCFC', token: '--neutral-50', role: 'Page background' },
  { name: 'Success', hex: '#2E8B63', token: '--status-success-500', role: 'Success' },
  { name: 'Error', hex: '#C62828', token: '--status-error-500', role: 'Error' },
  { name: 'Warning', hex: '#B88900', token: '--status-warning-500', role: 'Warning' },
  { name: 'Info', hex: '#1F66EA', token: '--info-blue-500', role: 'Info' },
];

export function Guide() {
  const { user, signOut } = useAuth();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<DownloadKind | null>(null);

  async function onDownload(kind: DownloadKind) {
    setDownloadError(null);
    setDownloading(kind);
    try {
      await downloadArtifact(kind);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img src="/Main logo black background.png" alt="Synth" />
          <div>
            <p className="eyebrow">styleguide.getsynth.app</p>
            <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Synth Style Guide</h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            {user?.email}
          </span>
          <button className="btn btn-ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <section className="download-banner" id="download">
        <div>
          <h2 style={{ margin: 0, color: 'white' }}>Download the skills bundle</h2>
          <p>
            Plug into Cursor or any AI tool: brand tokens, product context, team, voice, and agent
            working rules. Same content powers this guide.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn"
            type="button"
            disabled={!!downloading}
            onClick={() => void onDownload('zip')}
          >
            {downloading === 'zip' ? 'Preparing…' : 'Download ZIP'}
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!!downloading}
            onClick={() => void onDownload('llms-full')}
          >
            {downloading === 'llms-full' ? 'Preparing…' : 'llms-full.txt'}
          </button>
        </div>
        {downloadError && (
          <p className="error" style={{ width: '100%', margin: '12px 0 0', color: '#fff' }}>
            {downloadError}
          </p>
        )}
      </section>

      <nav className="nav">
        {[
          ['#company', 'Company'],
          ['#niche', 'Niche & channels'],
          ['#people', 'People'],
          ['#brand', 'Brand'],
          ['#product', 'Product'],
          ['#data', 'Data'],
          ['#voice', 'Voice'],
          ['#download', 'Download'],
        ].map(([href, label]) => (
          <a key={href} href={href}>
            {label}
          </a>
        ))}
      </nav>

      <section className="section" id="company">
        <p className="eyebrow">Company</p>
        <h2>Mission, vision, history</h2>
        <div className="panel">
          <h3>Positioning</h3>
          <p className="muted">
            Synth is a live music discovery and community platform. Going to shows just got easier:
            find concerts, connect with peers, and share live music experiences in one place. Built
            for real music fans. Public framing: the Letterboxd for live music.
          </p>
          <h3 style={{ marginTop: 20 }}>Mission</h3>
          <p className="muted">
            Music is better when shared. Synth was born from missing amazing concerts because no one
            was free to go. We are building the platform we wished existed: safe, friendly concert
            experiences and real community around live music.
          </p>
          <h3 style={{ marginTop: 20 }}>Vision</h3>
          <p className="muted">
            A world where every music lover can find their people and every show sparks lasting
            connections powered by community.
          </p>
          <h3 style={{ marginTop: 20 }}>The problem we solve</h3>
          <p className="muted">
            Live music is everywhere, but the experience is scattered. Shows live in ticketing apps.
            Songs live in streaming. Memories live in camera rolls. Opinions live in group chats.
            Setlists live online. After the night ends, none of it connects. Synth covers the whole
            live event journey: track shows, review while memory is fresh, discover worldwide, and
            find people to go with so shows do not have to be solo.
          </p>
          <h3 style={{ marginTop: 20 }}>History (repo + public narrative)</h3>
          <ul className="list-tight">
            <li>
              Early codebase shipped as PlusOne / event-crew: discover local events and find people
              to attend with.
            </li>
            <li>
              Rebranded and expanded as Synth: social concert discovery, passport of live history,
              personalized feed, chats, streaming taste sync (Spotify / Apple Music).
            </li>
            <li>
              2026: App Store launch messaging; web release at join.getsynth.app for browser access.
            </li>
            <li>
              Stack today: Expo React Native primary mobile, Vite web, Supabase backend, JamBase and
              other event data pipelines.
            </li>
          </ul>
        </div>
      </section>

      <section className="section" id="niche">
        <p className="eyebrow">Niche &amp; channels</p>
        <h2>Category, acquisition, distribution partners</h2>
        <div className="panel">
          <p className="muted">
            Deep brief for GTM, partnerships, and content routing. Also ships in the skills bundle as{' '}
            <code>synth-product/reference/niche-and-distribution.md</code>. Content Calendar idea
            reservoir on getsynth.app/admin uses the same channel buckets.
          </p>
          <div className="grid-2" style={{ marginTop: 16, marginBottom: 16 }}>
            <article className="person">
              <p className="role">Category</p>
              <h3>Live music social discovery</h3>
              <p className="muted">
                Identity, companionship, and archive around nights — not ticketing, streaming, or
                generic listings. Public framing: Letterboxd for live music.
              </p>
            </article>
            <article className="person">
              <p className="role">Wedge</p>
              <h3>DC / DMV first</h3>
              <p className="muted">
                Prove venue + review + graph density in one metro, then clone city playbooks.
                Consumer channels plus partner pipes (venues, campus, writers).
              </p>
            </article>
          </div>
          <pre className="voice-doc" style={{ marginTop: 16 }}>
            {nicheAndDistribution}
          </pre>
        </div>
      </section>

      <section className="section" id="people">
        <p className="eyebrow">People</p>
        <h2>Who builds Synth</h2>
        <div className="grid-2">
          <article className="person">
            <p className="role">Co-Founder &amp; CEO</p>
            <h3>Sam Loiterstein</h3>
            <p className="muted">
              Product leader focused on safe, friendly concert experiences and real community around
              live music. Public LinkedIn narrative: GWU founder path into Synth.
            </p>
          </article>
          <article className="person">
            <p className="role">Co-Founder &amp; CTO</p>
            <h3>Tej Patel</h3>
            <p className="muted">
              Engineer focused on modern, privacy-conscious platforms that bring music fans together.
              Data science and mathematics background.
            </p>
          </article>
          <article className="person">
            <p className="role">CPO / Frontend &amp; UX</p>
            <h3>Lauren Pesce</h3>
            <p className="muted">
              Product strategy, UX design, and frontend engineering. Joined after Sam and Tej found
              her portfolio on LinkedIn; builds authentic social experiences for dedicated live music
              fans.
            </p>
          </article>
          <article className="person">
            <p className="role">Operations</p>
            <h3>Theo Kagan</h3>
            <p className="muted">
              Building Synth (social concert discovery); operations. Listed on the company LinkedIn
              page.
            </p>
          </article>
        </div>
        <p className="muted" style={{ marginTop: 16, fontSize: '0.9rem' }}>
          Sources: getsynth.app team section, LinkedIn company page getsynthapp. Access to this guide
          is gated by Supabase <code>account_type = admin</code>, not by this roster alone.
        </p>
      </section>

      <section className="section" id="brand">
        <p className="eyebrow">Brand</p>
        <h2>Logo, color, type</h2>

        <div className="panel" style={{ marginBottom: 20 }}>
          <h3>Logo</h3>
          <p className="muted">
            Use the official Synth mark. Prefer the black-background mark on dark UI chrome and the
            white-background mark on light surfaces. Do not recolor the mark with arbitrary hues.
            Keep clear space around the mark roughly equal to the height of the wordmark stem.
          </p>
          <div className="logo-row" style={{ marginTop: 16 }}>
            <div className="logo-tile dark">
              <img src="/Main logo black background.png" alt="Synth logo on black" />
            </div>
            <div className="logo-tile light">
              <img src="/Main Lolo White background.png" alt="Synth logo on white" />
            </div>
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: 20 }}>
          {COLORS.map((c) => (
            <div className="swatch" key={c.hex + c.name}>
              <div className="swatch-color" style={{ background: c.hex }} />
              <div className="swatch-meta">
                <strong>{c.name}</strong>
                <span className="mono">{c.hex}</span>
                <div className="muted">
                  {c.token} · {c.role}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="panel">
          <h3>Typography</h3>
          <p className="type-sample" style={{ fontSize: 35, fontWeight: 700, lineHeight: 1.2 }}>
            H1 · 35 / 700 / 1.2
          </p>
          <p className="type-sample" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.3 }}>
            H2 · 24 / 700 / 1.3
          </p>
          <p className="type-sample" style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.5 }}>
            Body · 20 / 500 / 1.5
          </p>
          <p className="type-sample muted" style={{ fontSize: 16, fontWeight: 500 }}>
            Meta / steps · 16 / 500 · Inter
          </p>
          <p className="muted">
            Screen horizontal margin 20px. Default corner radius 10px. Button height 36px. Input /
            touch target height 44px. Page backgrounds use <code>--neutral-50</code>.
          </p>
        </div>
      </section>

      <section className="section" id="product">
        <p className="eyebrow">Product</p>
        <h2>What the app is</h2>
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Surface</th>
                <th>Job</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Discover</td>
                <td>Find artists, venues, events; location and vibe filters.</td>
              </tr>
              <tr>
                <td>Home / Feed</td>
                <td>Personalized live music feed (v5), friends activity, recommendations.</td>
              </tr>
              <tr>
                <td>Passport</td>
                <td>
                  Live music identity: stamps, timeline, achievements, bucket list, travel map.
                </td>
              </tr>
              <tr>
                <td>Reviews</td>
                <td>Structured concert reviews, photos, setlists, friend tags.</td>
              </tr>
              <tr>
                <td>Chat</td>
                <td>DMs, group chats, genre / verified entity chats.</td>
              </tr>
              <tr>
                <td>Onboarding</td>
                <td>Profile, city/scene, artists, genres, streaming connect.</td>
              </tr>
              <tr>
                <td>Streaming</td>
                <td>Spotify and Apple Music taste sync into preference signals.</td>
              </tr>
              <tr>
                <td>Mobile</td>
                <td>
                  Primary store app is Expo under <code>mobile/</code>. Capacitor web shell is legacy.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="section" id="data">
        <p className="eyebrow">Data</p>
        <h2>Product data model (agent overview)</h2>
        <div className="panel">
          <p className="muted">
            High-level entities in Supabase. Do not invent columns. Confirm in migrations before
            querying. Never dump end-user PII into prompts or public docs.
          </p>
          <ul className="list-tight" style={{ marginTop: 12 }}>
            <li>
              <strong>users</strong> / <code>users_complete</code>: profiles,{' '}
              <code>account_type</code> (user | creator | business | admin), onboarding, location.
            </li>
            <li>
              <strong>events</strong>, <strong>artists</strong>, <strong>venues</strong>: catalog
              from JamBase sync and related pipelines; genres and media attached.
            </li>
            <li>
              <strong>reviews</strong>: user concert reviews linked to events / entities.
            </li>
            <li>
              <strong>chats</strong>, <strong>messages</strong>, <strong>chat_participants</strong>:
              direct, group, verified, genre chats.
            </li>
            <li>
              <strong>passport_*</strong>: identity, timeline, achievements, bucket list progress.
            </li>
            <li>
              <strong>user_preference_signals</strong> / feed cache: personalization for feed v5.
            </li>
            <li>
              <strong>friendships</strong> / notifications / push device tokens: social graph and
              delivery.
            </li>
          </ul>
        </div>
      </section>

      <section className="section" id="voice">
        <p className="eyebrow">Voice</p>
        <h2>Writing style guide</h2>
        <div className="panel">
          <p className="muted">
            Authoritative. Apply this document exactly to every Synth draft, prompt, product string,
            and marketing line. The same file ships in the skills bundle as{' '}
            <code>synth-brand/reference/writing-style-guide.md</code>.
          </p>
          <pre className="voice-doc" style={{ marginTop: 16 }}>
            {writingStyleGuide}
          </pre>
          <p className="muted" style={{ marginTop: 16 }}>
            Install path for agents: unzip the bundle into <code>.cursor/skills/</code> or{' '}
            <code>.agents/skills/</code>, or paste <code>llms-full.txt</code> into project context.
          </p>
        </div>
      </section>
    </div>
  );
}
