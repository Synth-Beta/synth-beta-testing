import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createSeoTarget, runSeoJob, type SeoDashboard } from '@/services/seoAdmin';
import { fillDays, fmt, shortDay } from './seoFormat';
import { BarList, Empty, ExtLink, Kpi, Section } from './seoUi';

const sum = (rows: Array<Record<string, unknown>>, key: string) => rows.reduce((n, r) => n + (Number(r[key]) || 0), 0);
const shortPage = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/^getsynth\.app/, '');

export function SeoSearchTab({ data, onChanged }: { data: SeoDashboard; onChanged: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const daily = useMemo(
    () => fillDays(data.search_daily, data.days, { google_clicks: 0, google_impressions: 0, bing_clicks: 0, bing_impressions: 0 }),
    [data.search_daily, data.days],
  );
  const recordedDaily = useMemo(
    () => fillDays(data.daily, data.days, { visits: 0, organic_search: 0, ai_assistant: 0, social: 0, referral: 0, direct: 0, other: 0 }),
    [data.daily, data.days],
  );
  const hasConsole = data.search_daily.length > 0 || data.top_queries.length > 0;
  const searchSources = data.sources.filter((row) => row.source_category === 'organic_search');
  const searchPages = data.landing_pages.filter((page) => page.organic > 0);

  const sync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const result = await runSeoJob('seo-search-data');
      const r = (result.results ?? {}) as Record<string, unknown>;
      setMessage(`Google: ${r.google}. Bing: ${r.bing}.`);
      onChanged();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  const addTarget = async (query: string) => {
    try {
      await createSeoTarget({ query, cluster: 'search-opportunity', page_type: 'guide', priority: 70, notes: 'Added from Search Console opportunities' });
      setAdded((prev) => new Set(prev).add(query));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const syncButton = (
    <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>
      <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
      Sync now
    </Button>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Search visits" value={data.kpis.organic_visits} previous={data.kpis.organic_visits_prev} hint="Recorded on our sites" />
        <Kpi label="Google clicks" value={sum(data.search_daily, 'google_clicks')} hint="Search Console" />
        <Kpi label="Google impressions" value={sum(data.search_daily, 'google_impressions')} hint="Search Console" />
        <Kpi label="Bing clicks" value={sum(data.search_daily, 'bing_clicks')} hint="Webmaster Tools" />
        <Kpi label="Bing impressions" value={sum(data.search_daily, 'bing_impressions')} hint="Webmaster Tools" />
      </div>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <Section
        title="Visits from search"
        description="Sessions that arrived from a search engine, on getsynth.app and join.getsynth.app."
      >
        {data.kpis.organic_visits === 0 ? (
          <Empty>No search visits in this range.</Empty>
        ) : (
          <div className="space-y-6">
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={recordedDaily}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={shortDay} fontSize={12} minTickGap={24} />
                  <YAxis allowDecimals={false} fontSize={12} width={40} />
                  <Tooltip labelFormatter={(day) => shortDay(String(day))} />
                  <Line type="monotone" dataKey="organic_search" name="Search visits" stroke="#2563eb" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <BarList rows={searchSources.map((row) => ({ label: row.source_name || 'Search', value: row.visits }))} />
              <BarList
                color="#111827"
                rows={searchPages.slice(0, 8).map((page) => ({
                  label: (
                    <ExtLink href={`https://${page.host}${page.path}`}>
                      {page.host.replace(/\.?getsynth\.app$/, '') || 'getsynth.app'}
                      {page.path}
                    </ExtLink>
                  ),
                  value: page.organic,
                }))}
              />
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Search Console and Bing"
        description="Clicks and impressions reported by Google and Bing. Google lags about two days, and it hides properties with almost no impressions."
        action={syncButton}
      >
        {!hasConsole ? (
          <Empty>
            No Search Console rows yet. The account is connected to sc-domain:getsynth.app, which includes join.getsynth.app. Google is still processing that property, so clicks and impressions show up here after the next sync once the Performance report leaves the “check again in a day” state. Bing has no stats for https://getsynth.app/ yet.
          </Empty>
        ) : (
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tickFormatter={shortDay} fontSize={12} minTickGap={24} />
                <YAxis yAxisId="clicks" allowDecimals={false} fontSize={12} width={40} />
                <YAxis yAxisId="impressions" orientation="right" allowDecimals={false} fontSize={12} width={50} />
                <Tooltip labelFormatter={(d) => shortDay(String(d))} />
                <Legend />
                <Line yAxisId="clicks" type="monotone" dataKey="google_clicks" name="Google clicks" stroke="#2563eb" dot={false} strokeWidth={2} />
                <Line yAxisId="impressions" type="monotone" dataKey="google_impressions" name="Google impressions" stroke="#93c5fd" dot={false} />
                <Line yAxisId="clicks" type="monotone" dataKey="bing_clicks" name="Bing clicks" stroke="#0d9488" dot={false} strokeWidth={2} />
                <Line yAxisId="impressions" type="monotone" dataKey="bing_impressions" name="Bing impressions" stroke="#99f6e4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      <Section
        title="Opportunities"
        description="Searches where Synth already shows up on pages 1–3 (average position 4–30) with real impressions. A dedicated page could move these up."
      >
        {data.opportunities.length === 0 ? (
          <Empty>None yet. These appear once queries have 30+ impressions.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Search</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Avg. position</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.opportunities.map((q) => (
                <TableRow key={q.query}>
                  <TableCell>{q.query}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(q.impressions)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(q.clicks)}</TableCell>
                  <TableCell className="text-right tabular-nums">{q.position ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" disabled={added.has(q.query)} onClick={() => addTarget(q.query)}>
                      <Plus className="mr-1 h-3 w-3" />
                      {added.has(q.query) ? 'Added' : 'Target'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Top searches" description="Rankings by search, both engines combined.">
          {data.top_queries.length === 0 ? (
            <Empty>No queries yet.</Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Search</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Impr.</TableHead>
                  <TableHead className="text-right">Pos.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.top_queries.map((q) => (
                  <TableRow key={q.query}>
                    <TableCell>
                      {q.query}
                      <div className="text-xs text-muted-foreground">{q.engines}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(q.clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(q.impressions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{q.position ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
        <Section title="Top pages in search">
          {data.top_search_pages.length === 0 ? (
            <Empty>No pages yet.</Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Impr.</TableHead>
                  <TableHead className="text-right">Pos.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.top_search_pages.map((p) => (
                  <TableRow key={p.page}>
                    <TableCell className="max-w-xs truncate">
                      <ExtLink href={p.page}>{shortPage(p.page) || '/'}</ExtLink>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(p.clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(p.impressions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.position ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      </div>
    </div>
  );
}
