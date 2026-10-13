import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { CrawlerTraffic } from '@/services/seoAdmin';
import { fillDays, fmt, pct, shortDay } from './seoFormat';
import { BarList, Delta, Empty, ExtLink, Section } from './seoUi';

function Metric({ label, value, previous }: { label: string; value: number; previous?: number }) {
  return (
    <div className="min-w-[120px] px-4 py-3 first:pl-0 last:pr-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">{fmt(value)}</span>
        {previous !== undefined && <Delta current={value} previous={previous} />}
      </div>
    </div>
  );
}

export function SeoOverviewTab({ data }: { data: CrawlerTraffic }) {
  const daily = useMemo(() => fillDays(data.daily, data.days, { hits: 0, search: 0, ai: 0 }), [data.daily, data.days]);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end divide-x divide-border/80">
            <Metric label="Crawler hits" value={data.hits} previous={data.hitsPrev} />
            <Metric label="Search crawlers" value={data.search} previous={data.searchPrev} />
            <Metric label="AI crawlers" value={data.ai} previous={data.aiPrev} />
            <Metric label="Pages crawled" value={data.pages} previous={data.pagesPrev} />
            <div className="min-w-[120px] px-4 py-3">
              <div className="text-xs text-muted-foreground">AI share</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight">{pct(data.ai, data.hits)}</div>
            </div>
          </div>
          <div className="h-72 pt-2">
            {data.hits === 0 ? (
              <Empty>No crawler hits in this range.</Empty>
            ) : (
              <ResponsiveContainer>
                <LineChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="day" tickFormatter={shortDay} fontSize={12} minTickGap={24} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} fontSize={12} width={40} tickLine={false} axisLine={false} />
                  <Tooltip
                    labelFormatter={(d) => shortDay(String(d))}
                    formatter={(value: number, name: string) => [fmt(value), name === 'search' ? 'Search' : name === 'ai' ? 'AI' : 'Hits']}
                  />
                  <Line type="monotone" dataKey="hits" stroke="#111827" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ai" stroke="#db2777" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          {data.truncated && (
            <p className="pt-2 text-xs text-muted-foreground">Showing the most recent 20,000 hits in this window.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Top crawlers">
          {data.topBots.length === 0 ? (
            <Empty>None yet.</Empty>
          ) : (
            <BarList
              color="#111827"
              rows={data.topBots.map((b) => ({
                label: (
                  <span className="inline-flex items-center gap-2">
                    {b.bot_name}
                    <Badge variant={b.bot_category === 'ai' ? 'default' : 'secondary'}>{b.bot_category}</Badge>
                  </span>
                ),
                value: b.hits,
              }))}
            />
          )}
        </Section>
        <Section title="Top pages">
          {data.topPages.length === 0 ? (
            <Empty>None yet.</Empty>
          ) : (
            <BarList
              color="#2563eb"
              rows={data.topPages.map((p) => ({
                label: (
                  <ExtLink href={`https://${p.host}${p.path}`}>
                    <span className="text-muted-foreground">{p.host.replace(/\.?getsynth\.app$/, '')}</span>
                    {p.path}
                  </ExtLink>
                ),
                value: p.hits,
                extra: p.ai ? <span className="ml-2 text-pink-600">{fmt(p.ai)} AI</span> : undefined,
              }))}
            />
          )}
        </Section>
      </div>
    </div>
  );
}
