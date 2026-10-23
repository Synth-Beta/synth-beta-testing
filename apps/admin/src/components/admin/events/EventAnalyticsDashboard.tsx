import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  fetchEventIngestSnapshot,
  peekEventIngestSnapshot,
  rebuildEventIngestSnapshot,
  type HygieneSample,
  type IngestEntityStats,
  type IngestHealth,
  type TrendingBundle,
  type TrendingRow,
} from '@/services/eventIngestHealth';

const ISSUE_LABELS: Record<string, string> = {
  artist: 'Artist',
  venue: 'Venue',
  title: 'Name',
  event_date: 'Start time',
  tickets: 'Tickets',
  genres: 'Genres',
  genres_unresolved: 'Unresolved genres',
  genres_should_inherit: 'Genres not inherited',
  name: 'Name',
  identifier: 'JamBase identifier',
};

const EVENT_FIELDS = [
  'title',
  'venue',
  'artist',
  'event_date',
  'tickets',
  'genres',
  'genres_unresolved',
  'genres_should_inherit',
];

const ARTIST_FIELDS = ['name', 'identifier', 'genres', 'genres_unresolved'];
const VENUE_FIELDS = ['name', 'city', 'state', 'geo'];

function formatWhen(value: string | null | undefined): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return format(date, 'MMM d, yyyy h:mm a');
}

function formatDay(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'MMM d, yyyy');
}

function pct(part: number, whole: number): string {
  if (!whole) return '0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function GapTable({
  title,
  description,
  fields,
  missing,
  whole,
}: {
  title: string;
  description: string;
  fields: string[];
  missing: Record<string, number>;
  whole: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Check</TableHead>
              <TableHead className="text-right">Missing</TableHead>
              <TableHead className="text-right">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field) => {
              const count = missing[field] || 0;
              return (
                <TableRow key={field}>
                  <TableCell>{ISSUE_LABELS[field] || field}</TableCell>
                  <TableCell className="text-right">{count.toLocaleString()}</TableCell>
                  <TableCell className={`text-right ${count > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {pct(count, whole)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EntityFreshness({ label, stats }: { label: string; stats: IngestEntityStats }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{stats.created_26h.toLocaleString()}</div>
        <p className="text-xs text-muted-foreground">new in 26 hours</p>
        <p className="text-sm mt-2">{stats.updated_26h.toLocaleString()} updated</p>
        <p className="text-xs text-muted-foreground mt-1">Last write {formatWhen(stats.latest_updated_at)}</p>
      </CardContent>
    </Card>
  );
}

function IssueBadges({ issues }: { issues: string[] | null | undefined }) {
  if (!issues || issues.length === 0) return <span className="text-xs text-muted-foreground">Clean</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {issues.map((issue) => (
        <Badge key={issue} variant="destructive">
          {ISSUE_LABELS[issue] || issue}
        </Badge>
      ))}
    </div>
  );
}

function CountCell({ value }: { value: number }) {
  return <TableCell className="text-right tabular-nums">{value.toLocaleString()}</TableCell>;
}

function TrendingTable({
  days,
  kind,
  rows,
}: {
  days: number;
  kind: 'events' | 'artists' | 'venues';
  rows: TrendingRow[];
}) {
  const title = kind === 'events' ? 'Events' : kind === 'artists' ? 'Artists' : 'Venues';
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title} · {days} days
        </CardTitle>
        <CardDescription>
          Ranked by feeds, reviews, review views, emails, searches, and shares.
          {kind === 'events' ? ' Interests and going are included. A show also counts for its artist and venue.' : ' Shows they appear on are included.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing in this window.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{title.slice(0, -1)}</TableHead>
                {kind === 'events' ? <TableHead>When</TableHead> : null}
                <TableHead className="text-right">Feeds</TableHead>
                <TableHead className="text-right">Reviews</TableHead>
                <TableHead className="text-right">Review views</TableHead>
                <TableHead className="text-right">Emails</TableHead>
                <TableHead className="text-right">Searches</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                {kind === 'events' ? (
                  <>
                    <TableHead className="text-right">Interested</TableHead>
                    <TableHead className="text-right">Going</TableHead>
                    <TableHead>Hygiene</TableHead>
                  </>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.name || row.title || 'Untitled'}</div>
                    {kind === 'events' ? (
                      <div className="text-xs text-muted-foreground">
                        {[row.artist_name, row.venue_name, row.city].filter(Boolean).join(' · ') || 'Missing artist or venue'}
                      </div>
                    ) : row.city ? (
                      <div className="text-xs text-muted-foreground">{row.city}</div>
                    ) : null}
                  </TableCell>
                  {kind === 'events' ? <TableCell>{formatDay(row.event_date)}</TableCell> : null}
                  <CountCell value={row.feeds} />
                  <CountCell value={row.reviews} />
                  <CountCell value={row.review_views} />
                  <CountCell value={row.emails} />
                  <CountCell value={row.searches} />
                  <CountCell value={row.shares} />
                  {kind === 'events' ? (
                    <>
                      <CountCell value={row.interested} />
                      <CountCell value={row.going} />
                      <TableCell>
                        {row.issues === null ? (
                          <span className="text-xs text-muted-foreground">Not JamBase</span>
                        ) : (
                          <IssueBadges issues={row.issues} />
                        )}
                      </TableCell>
                    </>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function TrendingWindow({ days, bundle }: { days: number; bundle: TrendingBundle }) {
  return (
    <Tabs defaultValue="events" className="space-y-4">
      <TabsList>
        <TabsTrigger value="events">Events</TabsTrigger>
        <TabsTrigger value="artists">Artists</TabsTrigger>
        <TabsTrigger value="venues">Venues</TabsTrigger>
      </TabsList>
      <TabsContent value="events">
        <TrendingTable days={days} kind="events" rows={bundle.events} />
      </TabsContent>
      <TabsContent value="artists">
        <TrendingTable days={days} kind="artists" rows={bundle.artists} />
      </TabsContent>
      <TabsContent value="venues">
        <TrendingTable days={days} kind="venues" rows={bundle.venues} />
      </TabsContent>
    </Tabs>
  );
}

export function EventAnalyticsDashboard() {
  const cached = peekEventIngestSnapshot();
  const [health, setHealth] = useState<IngestHealth | null>(cached?.health ?? null);
  const [samples, setSamples] = useState<HygieneSample[]>(cached?.samples ?? []);
  const [trending7, setTrending7] = useState<TrendingBundle>(
    cached?.trending7 ?? { events: [], artists: [], venues: [] },
  );
  const [trending30, setTrending30] = useState<TrendingBundle>(
    cached?.trending30 ?? { events: [], artists: [], venues: [] },
  );
  const [refreshedAt, setRefreshedAt] = useState<string | null>(cached?.refreshed_at ?? null);
  const [snapshotMissing, setSnapshotMissing] = useState(false);
  const [loading, setLoading] = useState(!cached);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applySnapshot = useCallback((snapshot: Awaited<ReturnType<typeof fetchEventIngestSnapshot>>) => {
    setSnapshotMissing(snapshot.snapshot_missing);
    setRefreshedAt(snapshot.refreshed_at);
    setHealth(snapshot.health);
    setSamples(snapshot.samples);
    setTrending7(snapshot.trending7);
    setTrending30(snapshot.trending30);
  }, []);

  const load = useCallback(async (force = false) => {
    if (force || !peekEventIngestSnapshot()) setLoading(true);
    setError(null);
    try {
      applySnapshot(await fetchEventIngestSnapshot(force));
    } catch (err) {
      setHealth(null);
      setError(err instanceof Error ? err.message : 'Could not load ingest health');
    } finally {
      setLoading(false);
    }
  }, [applySnapshot]);

  const rebuild = useCallback(async () => {
    setRebuilding(true);
    setError(null);
    try {
      applySnapshot(await rebuildEventIngestSnapshot());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rebuild the snapshot');
    } finally {
      setRebuilding(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Event ingest health</h2>
          <p className="text-sm text-muted-foreground">
            {refreshedAt
              ? `Stored snapshot from ${formatWhen(refreshedAt)}. The daily sync rebuilds it after the 9:30 UTC ingest.`
              : 'JamBase catalog on events, artists, and venues. The daily sync is scheduled for 9:30 UTC.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={loading || rebuilding}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Reload
          </Button>
          <Button variant="outline" size="sm" onClick={() => void rebuild()} disabled={loading || rebuilding}>
            {rebuilding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Rebuild snapshot
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && !health ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mb-4" />
          <p className="text-sm text-muted-foreground">Loading the stored snapshot…</p>
        </div>
      ) : snapshotMissing && !health ? (
        <Alert>
          <AlertDescription>
            No stored report yet. Rebuild the snapshot once to scan the catalog. After that, opening this tab only reads that stored row.
          </AlertDescription>
        </Alert>
      ) : health ? (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="artists">Artists</TabsTrigger>
            <TabsTrigger value="venues">Venues</TabsTrigger>
            <TabsTrigger value="trending">Trending</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Alert variant={health.stale ? 'destructive' : 'default'}>
              <AlertDescription>
                {health.stale
                  ? 'No JamBase event has been written in the last 26 hours. The daily ingest looks stale.'
                  : health.fresh
                    ? `Catalog updated after the ${formatWhen(health.cron_start)} ingest window.`
                    : `Waiting on a write after the ${formatWhen(health.cron_start)} ingest window.`}
                {health.failed_pages > 0
                  ? ` ${health.failed_pages.toLocaleString()} sync page${health.failed_pages === 1 ? '' : 's'} still failing.`
                  : ' No unresolved failed pages.'}
                {health.events.latest_modified_at
                  ? ` JamBase watermark ${formatWhen(health.events.latest_modified_at)}.`
                  : ''}
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Upcoming events clean</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{health.events.clean_pct ?? 0}%</div>
                  <p className="text-xs text-muted-foreground">
                    {health.events.clean.toLocaleString()} of {health.events.hygiene_upcoming.toLocaleString()} upcoming
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {health.events.festivals_excluded.toLocaleString()} festivals left out of this count
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {health.events.total.toLocaleString()} JamBase events in the catalog
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Artists clean</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{health.artists.clean_pct ?? 0}%</div>
                  <p className="text-xs text-muted-foreground">
                    {health.artists.clean.toLocaleString()} of {health.artists.total.toLocaleString()} JamBase artists
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Venues clean</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{health.venues.clean_pct ?? 0}%</div>
                  <p className="text-xs text-muted-foreground">
                    {health.venues.clean.toLocaleString()} of {health.venues.total.toLocaleString()} linked venues
                  </p>
                </CardContent>
              </Card>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-3">Ingest freshness</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <EntityFreshness label="Events" stats={health.events} />
                <EntityFreshness label="Artists" stats={health.artists} />
                <EntityFreshness label="Venues" stats={health.venues} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="events" className="space-y-4">
            <GapTable
              title="Events"
              description="Upcoming JamBase concerts. Festival bills are left out. A clean row has a name, venue, artist, start time, tickets, and real genres."
              fields={EVENT_FIELDS}
              missing={health.events.missing}
              whole={health.events.hygiene_upcoming}
            />
            <Card>
              <CardHeader>
                <CardTitle>Dirtiest upcoming events</CardTitle>
                <CardDescription>Up to 25 upcoming concerts missing a name, venue, artist, start time, tickets, or genres. Festival bills are excluded.</CardDescription>
              </CardHeader>
              <CardContent>
                {samples.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hygiene errors in the upcoming catalog.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>When</TableHead>
                        <TableHead>Issues</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {samples.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="font-medium">{row.title || 'Untitled'}</div>
                            <div className="text-xs text-muted-foreground">
                              {[row.artist_name, row.venue_name, row.city].filter(Boolean).join(' · ') || 'Missing artist or venue'}
                            </div>
                          </TableCell>
                          <TableCell>{formatDay(row.event_date)}</TableCell>
                          <TableCell>
                            <IssueBadges issues={row.issues} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="artists">
            <GapTable
              title="Artists"
              description="JamBase artists, including ones events point at. Genres must be real and match the feed list."
              fields={ARTIST_FIELDS}
              missing={health.artists.missing}
              whole={health.artists.total}
            />
          </TabsContent>

          <TabsContent value="venues">
            <GapTable
              title="Venues"
              description="Venues linked from JamBase events. Each event venue id must land on a row with a name, city, state, and coordinates."
              fields={VENUE_FIELDS}
              missing={health.venues.missing}
              whole={health.venues.total}
            />
          </TabsContent>

          <TabsContent value="trending">
            <Tabs defaultValue="7" className="space-y-4">
              <TabsList>
                <TabsTrigger value="7">7 days</TabsTrigger>
                <TabsTrigger value="30">30 days</TabsTrigger>
              </TabsList>
              <TabsContent value="7">
                <TrendingWindow days={7} bundle={trending7} />
              </TabsContent>
              <TabsContent value="30">
                <TrendingWindow days={30} bundle={trending30} />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}
