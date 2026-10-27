import { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { TRACKED_HOSTS, type CrawlerTraffic, type SeoDashboard, type SiteTraffic } from '@/services/seoAdmin';
import { fillDays, fmt, pct, shortDay, SOURCE_LABELS } from './seoFormat';
import { BarList, Delta, Empty, ExtLink, Kpi, Section } from './seoUi';

const HOST_COLORS: Record<string, string> = {
  'getsynth.app': '#111827',
  'join.getsynth.app': '#db2777',
};

function hostColor(host: string, index: number): string {
  return HOST_COLORS[host] ?? ['#2563eb', '#f59e0b', '#10b981'][index % 3];
}

export function SeoOverviewTab({
  dashboard,
  sites,
  crawlers,
}: {
  dashboard: SeoDashboard;
  sites: SiteTraffic;
  crawlers: CrawlerTraffic | null;
}) {
  const hosts = sites.sites.map((site) => site.host);
  const hostKey = hosts.join('|');
  const daily = useMemo(() => {
    const names = hostKey ? hostKey.split('|') : [];
    const rows = sites.daily.map((row) => {
      const flat: { day: string } & Record<string, number> = { day: row.day };
      for (const host of names) flat[host] = row.visits[host] ?? 0;
      return flat;
    });
    const empty = Object.fromEntries(names.map((host) => [host, 0]));
    return fillDays(rows, dashboard.days, empty);
  }, [sites.daily, hostKey, dashboard.days]);

  const crawlerDaily = useMemo(
    () => (crawlers ? fillDays(crawlers.daily, crawlers.days, { hits: 0, search: 0, ai: 0 }) : []),
    [crawlers],
  );

  const kpis = dashboard.kpis;
  const anyVisits = sites.sites.some((site) => site.visits > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Visits" value={kpis.visits} previous={kpis.visits_prev} hint="Both sites" />
        <Kpi label="Visitors" value={kpis.visitors} />
        <Kpi label="Pageviews" value={kpis.pageviews} previous={kpis.pageviews_prev} />
        <Kpi label="From search" value={kpis.organic_visits} previous={kpis.organic_visits_prev} />
        <Kpi label="From AI" value={kpis.ai_visits} previous={kpis.ai_visits_prev} />
        <Kpi label="Signups" value={kpis.signups} previous={kpis.signups_prev} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {sites.sites.map((site) => (
          <Card key={site.host}>
            <CardContent className="p-4">
              <div className="text-sm font-medium">{site.host}</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight">{fmt(site.visits)}</span>
                <Delta current={site.visits} previous={site.visitsPrev} />
                <span className="text-xs text-muted-foreground">visits</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>Pageviews {fmt(site.pageviews)}</span>
                <span>Visitors {fmt(site.visitors)}</span>
                <span>Search {fmt(site.organic)}</span>
                <span>AI referrals {fmt(site.ai)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Section
        title="Visits by day"
        description="People opening getsynth.app or join.getsynth.app. Admin pages are not counted."
      >
        {!anyVisits ? (
          <Empty>No visits in this range.</Empty>
        ) : (
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="day" tickFormatter={shortDay} fontSize={12} minTickGap={24} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} fontSize={12} width={40} tickLine={false} axisLine={false} />
                <Tooltip labelFormatter={(day) => shortDay(String(day))} formatter={(value: number, name: string) => [fmt(value), name]} />
                <Legend />
                {hosts.map((host, index) => (
                  <Line key={host} type="monotone" dataKey={host} stroke={hostColor(host, index)} strokeWidth={host === TRACKED_HOSTS[0] ? 2 : 1.5} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {sites.truncated && <p className="pt-2 text-xs text-muted-foreground">Showing the most recent 20,000 pageviews in this window.</p>}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Sources" description="Where the visit started.">
          {dashboard.sources.length === 0 ? (
            <Empty>No visits in this range.</Empty>
          ) : (
            <BarList
              rows={dashboard.sources.slice(0, 10).map((row) => ({
                label: row.source_name && row.source_name !== '(none)' ? row.source_name : SOURCE_LABELS[row.source_category] || row.source_category,
                value: row.visits,
                extra: row.signups ? <span className="ml-2">{fmt(row.signups)} signups</span> : undefined,
              }))}
            />
          )}
        </Section>
        <Section title="Devices">
          {dashboard.devices.length === 0 ? (
            <Empty>No visits in this range.</Empty>
          ) : (
            <BarList color="#2563eb" rows={dashboard.devices.map((row) => ({ label: row.device || 'Unknown', value: row.visits }))} />
          )}
        </Section>
        <Section title="Landing pages">
          {dashboard.landing_pages.length === 0 ? (
            <Empty>No visits in this range.</Empty>
          ) : (
            <BarList
              color="#111827"
              rows={dashboard.landing_pages.slice(0, 12).map((page) => ({
                label: (
                  <ExtLink href={`https://${page.host}${page.path}`}>
                    <span className="text-muted-foreground">{page.host.replace(/\.?getsynth\.app$/, '') || 'getsynth.app'}</span>
                    {page.path}
                  </ExtLink>
                ),
                value: page.visits,
                extra: page.ai ? <span className="ml-2 text-pink-600">{fmt(page.ai)} AI</span> : undefined,
              }))}
            />
          )}
        </Section>
        <Section title="Countries">
          {dashboard.countries.length === 0 ? (
            <Empty>No visits in this range.</Empty>
          ) : (
            <BarList color="#10b981" rows={dashboard.countries.slice(0, 10).map((row) => ({ label: row.country || 'Unknown', value: row.visits }))} />
          )}
        </Section>
      </div>

      <Section title="Crawlers" description="Search and AI bots. Separate from the visits above.">
        {!crawlers || crawlers.hits === 0 ? (
          <Empty>No crawler hits in this range.</Empty>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <span>Hits {fmt(crawlers.hits)} <Delta current={crawlers.hits} previous={crawlers.hitsPrev} /></span>
              <span>Search {fmt(crawlers.search)}</span>
              <span>AI {fmt(crawlers.ai)}</span>
              <span>AI share {pct(crawlers.ai, crawlers.hits)}</span>
            </div>
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={crawlerDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="day" tickFormatter={shortDay} fontSize={12} minTickGap={24} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} fontSize={12} width={40} tickLine={false} axisLine={false} />
                  <Tooltip labelFormatter={(day) => shortDay(String(day))} formatter={(value: number, name: string) => [fmt(value), name === 'ai' ? 'AI' : 'Hits']} />
                  <Line type="monotone" dataKey="hits" stroke="#111827" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ai" stroke="#db2777" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                {crawlers.topBots.slice(0, 8).map((bot) => (
                  <div key={bot.bot_name} className="flex items-center justify-between gap-2 py-1 text-sm">
                    <span className="inline-flex items-center gap-2 truncate">
                      {bot.bot_name}
                      <Badge variant={bot.bot_category === 'ai' ? 'default' : 'secondary'}>{bot.bot_category}</Badge>
                    </span>
                    <span className="tabular-nums text-muted-foreground">{fmt(bot.hits)}</span>
                  </div>
                ))}
              </div>
              <div>
                {crawlers.topPages.slice(0, 8).map((page) => (
                  <div key={`${page.host}${page.path}`} className="flex items-center justify-between gap-2 py-1 text-sm">
                    <ExtLink href={`https://${page.host}${page.path}`}>
                      <span className="truncate">{page.path}</span>
                    </ExtLink>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{fmt(page.hits)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
