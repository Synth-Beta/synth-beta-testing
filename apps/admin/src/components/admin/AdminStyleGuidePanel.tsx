import { useState } from 'react';
import { BookOpen, Download, Map, Palette, Users } from 'lucide-react';
import { WRITING_STYLE_GUIDE } from './style-guide/bundleFiles';
import { downloadStyleGuideArtifact, type StyleGuideDownloadKind } from './style-guide/downloadStyleGuide';
import nicheAndDistribution from './style-guide/content/synth-product/reference/niche-and-distribution.md?raw';

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

type StyleSection = 'overview' | 'niche' | 'brand' | 'voice' | 'product';

/**
 * Style guide panel for the admin analytics portal.
 * Relies on the parent portal auth gate; no second login.
 */
export function AdminStyleGuidePanel() {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<StyleGuideDownloadKind | null>(null);
  const [section, setSection] = useState<StyleSection>('overview');

  async function onDownload(kind: StyleGuideDownloadKind) {
    setDownloadError(null);
    setDownloading(kind);
    try {
      await downloadStyleGuideArtifact(kind);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 p-6 text-white shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <BookOpen className="h-6 w-6" />
              <h2 className="text-2xl font-bold">Synth Style Guide</h2>
            </div>
            <p className="max-w-2xl text-pink-50">
              Brand tokens, niche &amp; distribution, product context, team, and the writing style
              guide. Download the skills bundle for Cursor or any AI tool.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!downloading}
              onClick={() => void onDownload('zip')}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-pink-700 hover:bg-pink-50 disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {downloading === 'zip' ? 'Preparing…' : 'Download ZIP'}
            </button>
            <button
              type="button"
              disabled={!!downloading}
              onClick={() => void onDownload('llms-full')}
              className="inline-flex items-center gap-2 rounded-lg border border-white/40 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-60"
            >
              {downloading === 'llms-full' ? 'Preparing…' : 'llms-full.txt'}
            </button>
          </div>
        </div>
        {downloadError && <p className="mt-3 text-sm text-pink-100">{downloadError}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['overview', 'Company'],
            ['niche', 'Niche & channels'],
            ['brand', 'Brand'],
            ['voice', 'Voice'],
            ['product', 'Product'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              section === id
                ? 'bg-pink-600 text-white'
                : 'bg-white text-gray-600 shadow-sm hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {section === 'overview' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h3 className="mb-3 text-lg font-semibold text-gray-900">Mission</h3>
            <p className="text-sm leading-relaxed text-gray-600">
              Music is better when shared. Synth was born from missing amazing concerts because no
              one was free to go. The team is building the platform they wished existed: safe,
              friendly concert experiences and real community around live music.
            </p>
            <h3 className="mb-3 mt-6 text-lg font-semibold text-gray-900">Positioning</h3>
            <p className="text-sm leading-relaxed text-gray-600">
              Live music discovery and community. Discover, Connect, Share. Public framing: the
              Letterboxd for live music. Category: live music social discovery — not ticketing, not
              streaming, not generic listings. Deep niche, acquisition, and partner distribution
              live under <strong>Niche &amp; channels</strong>.
            </p>
          </div>
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-pink-600" />
              <h3 className="text-lg font-semibold text-gray-900">Team</h3>
            </div>
            <ul className="space-y-3 text-sm text-gray-600">
              <li>
                <strong className="text-gray-900">Sam Loiterstein</strong> · Co-Founder &amp; CEO
              </li>
              <li>
                <strong className="text-gray-900">Tej Patel</strong> · Co-Founder &amp; CTO
              </li>
              <li>
                <strong className="text-gray-900">Lauren Pesce</strong> · CPO / Frontend &amp; UX
              </li>
              <li>
                <strong className="text-gray-900">Theo Kagan</strong> · Operations
              </li>
            </ul>
          </div>
        </div>
      )}

      {section === 'niche' && (
        <div className="space-y-6">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Map className="h-5 w-5 text-pink-600" />
              <h3 className="text-lg font-semibold text-gray-900">
                Niche, acquisition &amp; distribution
              </h3>
            </div>
            <p className="mb-4 text-sm text-gray-600">
              Authoritative brief for GTM, partnerships, and content routing. Use with the Content
              Calendar idea reservoir (angles → channel buckets → specific copy).
            </p>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 mb-6">
              {[
                {
                  title: 'Category',
                  body: 'Live music social discovery: identity, companionship, and archive around nights — not tickets or streams.',
                },
                {
                  title: 'Wedge',
                  body: 'DC / DMV first. Prove venue + review + graph density, then clone metro playbooks.',
                },
                {
                  title: 'Dual growth',
                  body: 'Consumer channels (IG, TikTok, Substack, Reddit, campus) + partner pipes (venues, writers, orgs).',
                },
              ].map((card) => (
                <div key={card.title} className="rounded-lg border border-gray-200 p-4">
                  <h4 className="text-sm font-semibold text-gray-900">{card.title}</h4>
                  <p className="mt-2 text-sm text-gray-600">{card.body}</p>
                </div>
              ))}
            </div>

            <h4 className="mb-2 text-sm font-semibold text-gray-900">Channel jobs (content system)</h4>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="py-2 pr-4 font-medium">Bucket</th>
                    <th className="py-2 pr-4 font-medium">Platforms</th>
                    <th className="py-2 font-medium">Job</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  {[
                    [
                      'B2B / operator',
                      'LinkedIn',
                      'Teach a market or product lesson; open partnership conversation',
                    ],
                    [
                      'Consumer short-form',
                      'Instagram, TikTok / Reels',
                      'Recognition, feeling, or saveable tip in one scroll',
                    ],
                    [
                      'Consumer long-form',
                      'Substack',
                      'Argue a thesis with sources about a room, night, or metro',
                    ],
                  ].map(([bucket, platforms, job]) => (
                    <tr key={bucket} className="border-b border-gray-100">
                      <td className="py-3 pr-4 font-medium text-gray-900">{bucket}</td>
                      <td className="py-3 pr-4">{platforms}</td>
                      <td className="py-3">{job}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h4 className="mb-2 text-sm font-semibold text-gray-900">Full brief</h4>
            <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-gray-50 p-4 font-mono text-xs leading-relaxed text-gray-800">
              {nicheAndDistribution}
            </pre>
          </div>
        </div>
      )}

      {section === 'brand' && (
        <div className="space-y-6">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Palette className="h-5 w-5 text-pink-600" />
              <h3 className="text-lg font-semibold text-gray-900">Logo</h3>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex min-h-[140px] items-center justify-center rounded-lg bg-neutral-900 p-6">
                <img
                  src="/Logos/Main%20logo%20black%20background.png"
                  alt="Synth logo on black"
                  className="max-h-24 object-contain"
                />
              </div>
              <div className="flex min-h-[140px] items-center justify-center rounded-lg border border-gray-200 bg-white p-6">
                <img
                  src="/Logos/Main%20Lolo%20White%20background.png"
                  alt="Synth logo on white"
                  className="max-h-24 object-contain"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {COLORS.map((c) => (
              <div key={c.name} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="h-20" style={{ background: c.hex }} />
                <div className="p-3 text-sm">
                  <div className="font-semibold text-gray-900">{c.name}</div>
                  <div className="font-mono text-xs text-gray-500">{c.hex}</div>
                  <div className="text-xs text-gray-500">
                    {c.token} · {c.role}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-white p-6 shadow-sm text-sm text-gray-600">
            <p className="mb-2 font-semibold text-gray-900">Type &amp; layout</p>
            <p>Inter. H1 35/700, H2 24/700, Body 20/500, Meta 16/500. Screen margin 20px. Radius 10px.</p>
            <p className="mt-2">Page backgrounds use --neutral-50. Prefer CSS tokens over hardcoded hex.</p>
          </div>
        </div>
      )}

      {section === 'voice' && (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h3 className="mb-2 text-lg font-semibold text-gray-900">Writing style guide</h3>
          <p className="mb-4 text-sm text-gray-600">
            Authoritative. Apply exactly to every Synth draft, prompt, product string, and marketing
            line.
          </p>
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-gray-50 p-4 font-mono text-xs leading-relaxed text-gray-800">
            {WRITING_STYLE_GUIDE}
          </pre>
        </div>
      )}

      {section === 'product' && (
        <div className="rounded-xl bg-white p-6 shadow-sm overflow-x-auto">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Product surfaces</h3>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2 pr-4 font-medium">Surface</th>
                <th className="py-2 font-medium">Job</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {[
                ['Discover', 'Artists, venues, events; location and vibe filters'],
                ['Home / Feed', 'Personalized feed (v5), friends activity'],
                ['Passport', 'Stamps, timeline, achievements, bucket list, travel map'],
                ['Reviews', 'Concert reviews, media, setlists, friend tags'],
                ['Chat', 'DMs, groups, genre / verified entity chats'],
                ['Mobile', 'Primary store app is Expo under mobile/; Capacitor is legacy'],
              ].map(([surface, job]) => (
                <tr key={surface} className="border-b border-gray-100">
                  <td className="py-3 pr-4 font-medium text-gray-900">{surface}</td>
                  <td className="py-3">{job}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminStyleGuidePanel;
