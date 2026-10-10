import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  fetchCrawlerSummary,
  fetchGenreCounts,
  fetchSeoCandidates,
  fetchSeoSettings,
  saveSeoSettings,
  type CrawlerSummary,
  type GenreCount,
  type SeoCandidate,
  type SeoSettings,
} from '@/services/seoAdmin';

const GETSYNTH = 'https://getsynth.app';
const JOIN = 'https://join.getsynth.app';
const ARTIST_ROWS = 50;
// Keep in sync with MIN_GENRE_EVENTS in api/_lib/seo/handler.ts.
const MIN_GENRE_EVENTS = 5;
const CITY_URL = `${GETSYNTH}/concerts/washington-dc`;

const pageUrl = (c: SeoCandidate) => `${JOIN}/${c.entity_type === 'venue' ? 'venues' : 'artists'}/${c.slug}`;

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

export function SeoAdminPanel() {
  const [settings, setSettings] = useState<SeoSettings | null>(null);
  const [minDraft, setMinDraft] = useState('3');
  const [candidates, setCandidates] = useState<SeoCandidate[]>([]);
  const [crawlers, setCrawlers] = useState<CrawlerSummary[]>([]);
  const [genres, setGenres] = useState<GenreCount[]>([]);
  const [artistFilter, setArtistFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, c, h, g] = await Promise.all([
        fetchSeoSettings(),
        fetchSeoCandidates(),
        fetchCrawlerSummary(),
        fetchGenreCounts(),
      ]);
      setSettings(s);
      setMinDraft(String(s.min_venue_events));
      setCandidates(c);
      setCrawlers(h);
      setGenres(g);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (next: SeoSettings) => {
    setSaving(true);
    setError(null);
    try {
      await saveSeoSettings(next);
      setSettings(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const minVenueEvents = settings?.min_venue_events ?? 3;
  const live = settings?.mode === 'live';

  const { venues, artists } = useMemo(() => {
    const byUpcoming = (a: SeoCandidate, b: SeoCandidate) => b.upcoming_events - a.upcoming_events;
    return {
      venues: candidates.filter((c) => c.entity_type === 'venue').sort(byUpcoming),
      artists: candidates.filter((c) => c.entity_type === 'artist').sort(byUpcoming),
    };
  }, [candidates]);

  const isEligible = (c: SeoCandidate) =>
    !!c.slug && c.upcoming_events >= (c.entity_type === 'venue' ? minVenueEvents : 1);
  const eligibleVenues = venues.filter(isEligible).length;
  const eligibleArtists = artists.filter(isEligible).length;
  const filteredArtists = artists
    .filter((a) => a.name.toLowerCase().includes(artistFilter.trim().toLowerCase()))
    .slice(0, ARTIST_ROWS);

  const statusBadge = (c: SeoCandidate) =>
    !isEligible(c) ? (
      <Badge variant="outline">Hidden</Badge>
    ) : live ? (
      <Badge>Indexable</Badge>
    ) : (
      <Badge variant="secondary">Ready (shadow)</Badge>
    );

  const candidateTable = (rows: SeoCandidate[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">Upcoming</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Page</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => (
          <TableRow key={c.entity_id}>
            <TableCell className="font-medium">{c.name}</TableCell>
            <TableCell className="text-right">{c.upcoming_events}</TableCell>
            <TableCell>{statusBadge(c)}</TableCell>
            <TableCell>{c.slug ? <ExtLink href={pageUrl(c)}>Preview</ExtLink> : '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">SEO</h2>
          <p className="text-sm text-muted-foreground">Public concert pages for search engines and AI assistants. DC pilot.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">
            {error}
            {/seo_|function|relation/i.test(error) ? ' (Has the SEO migration been applied?)' : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            Shadow mode keeps every page out of Google (noindex) and the SEO sitemaps empty. Live lets qualifying pages be
            indexed. Pages are cached for up to an hour, so changes take time to show.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id="seo-live"
              checked={live}
              disabled={!settings || saving}
              onCheckedChange={(checked) => settings && void save({ ...settings, mode: checked ? 'live' : 'shadow' })}
            />
            <Label htmlFor="seo-live">{live ? 'Live: qualifying pages can be indexed' : 'Shadow: hidden from search engines'}</Label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="seo-min">Minimum upcoming shows for a venue page to be indexed</Label>
              <Input
                id="seo-min"
                type="number"
                min={1}
                max={100}
                className="w-28"
                value={minDraft}
                onChange={(e) => setMinDraft(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              disabled={!settings || saving || Number(minDraft) === minVenueEvents || !(Number(minDraft) >= 1 && Number(minDraft) <= 100)}
              onClick={() => settings && void save({ ...settings, min_venue_events: Math.round(Number(minDraft)) })}
            >
              Save
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Artist pages qualify with at least one upcoming DC show.</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Genre pages qualifying</CardDescription>
            <CardTitle className="text-lg">
              {genres.filter((g) => g.upcoming_events >= MIN_GENRE_EVENTS).length} of {genres.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Venue pages qualifying</CardDescription>
            <CardTitle className="text-lg">
              {eligibleVenues} of {venues.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Artist pages qualifying</CardDescription>
            <CardTitle className="text-lg">{eligibleArtists}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>DC city pages</CardTitle>
          <CardDescription>
            The main city page and "this weekend" are always on. A genre page is indexed once it has at least{' '}
            {MIN_GENRE_EVENTS} upcoming shows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <ExtLink href={CITY_URL}>Concerts in Washington, DC</ExtLink>
            <ExtLink href={`${CITY_URL}/this-weekend`}>This weekend</ExtLink>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Genre</TableHead>
                  <TableHead className="text-right">Upcoming</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Page</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {genres.slice(0, 25).map((g) => {
                  const qualifies = g.upcoming_events >= MIN_GENRE_EVENTS;
                  return (
                    <TableRow key={g.genre_slug}>
                      <TableCell className="font-medium">{g.genre_slug}</TableCell>
                      <TableCell className="text-right">{g.upcoming_events}</TableCell>
                      <TableCell>
                        {!qualifies ? (
                          <Badge variant="outline">Hidden</Badge>
                        ) : live ? (
                          <Badge>Indexable</Badge>
                        ) : (
                          <Badge variant="secondary">Ready (shadow)</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <ExtLink href={`${CITY_URL}/${g.genre_slug}`}>Preview</ExtLink>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>DC venues</CardTitle>
        </CardHeader>
        <CardContent>{loading ? <p className="text-sm text-muted-foreground">Loading…</p> : candidateTable(venues)}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Artists with upcoming DC shows</CardTitle>
          <CardDescription>
            Showing up to {ARTIST_ROWS} of {artists.length}, busiest first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Filter artists"
            value={artistFilter}
            onChange={(e) => setArtistFilter(e.target.value)}
            className="max-w-xs"
          />
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : candidateTable(filteredArtists)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Crawler visits</CardTitle>
          <CardDescription>Search engine and AI bots visiting either site (based on user agent).</CardDescription>
        </CardHeader>
        <CardContent>
          {crawlers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No crawler visits logged yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bot</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Last 7 days</TableHead>
                  <TableHead className="text-right">Last 30 days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crawlers.map((c) => (
                  <TableRow key={c.bot_name}>
                    <TableCell className="font-medium">{c.bot_name}</TableCell>
                    <TableCell>{c.bot_category === 'ai' ? 'AI' : 'Search'}</TableCell>
                    <TableCell className="text-right">{c.last7}</TableCell>
                    <TableCell className="text-right">{c.last30}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Setup checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal pl-5 space-y-2 text-sm">
            <li>
              Check the SEO sitemaps load: <ExtLink href={`${GETSYNTH}/sitemap-seo.xml`}>getsynth.app</ExtLink> and{' '}
              <ExtLink href={`${JOIN}/sitemap-seo.xml`}>join.getsynth.app</ExtLink> (empty while in shadow mode).
            </li>
            <li>
              Verify both domains in <ExtLink href="https://search.google.com/search-console">Google Search Console</ExtLink>{' '}
              and submit each sitemap-seo.xml.
            </li>
            <li>Preview a few venue and artist pages above, then switch to Live.</li>
            <li>
              Optional: set an <code>INDEXNOW_KEY</code> env var in Vercel (any 32-character letters/numbers string) so a
              daily job tells Bing about new pages.
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
