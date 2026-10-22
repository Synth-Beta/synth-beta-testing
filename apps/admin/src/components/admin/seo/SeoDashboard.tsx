import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  fetchCrawlerTraffic,
  fetchSeoDashboard,
  fetchSiteTraffic,
  type CrawlerTraffic,
  type SeoDashboard as SeoDashboardData,
  type SiteTraffic,
} from '@/services/seoAdmin';
import { SeoAdminPanel } from './SeoAdminPanel';
import { SeoAiTab } from './SeoAiTab';
import { SeoContentQueue } from './SeoContentQueue';
import { SeoOverviewTab } from './SeoOverviewTab';
import { SeoSearchTab } from './SeoSearchTab';
import { SeoTargetsTab } from './SeoTargetsTab';

const RANGES = [7, 28, 90, 180];

export function SeoDashboard() {
  const [tab, setTab] = useState('overview');
  const [days, setDays] = useState(28);
  const [dashboard, setDashboard] = useState<SeoDashboardData | null>(null);
  const [sites, setSites] = useState<SiteTraffic | null>(null);
  const [crawlers, setCrawlers] = useState<CrawlerTraffic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [dashboardResult, sitesResult, crawlerResult] = await Promise.allSettled([
      fetchSeoDashboard(days),
      fetchSiteTraffic(days),
      fetchCrawlerTraffic(days),
    ]);
    if (dashboardResult.status === 'fulfilled') setDashboard(dashboardResult.value);
    if (sitesResult.status === 'fulfilled') setSites(sitesResult.value);
    if (crawlerResult.status === 'fulfilled') setCrawlers(crawlerResult.value);
    const failed = [dashboardResult, sitesResult, crawlerResult].find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') {
      setError(failed.reason instanceof Error ? failed.reason.message : String(failed.reason));
    }
    setLoading(false);
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const showRange = tab === 'overview' || tab === 'search' || tab === 'ai';

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Traffic</TabsTrigger>
          <TabsTrigger value="search">Search rankings</TabsTrigger>
          <TabsTrigger value="ai">AI visibility</TabsTrigger>
          <TabsTrigger value="queue">Content queue</TabsTrigger>
          <TabsTrigger value="targets">Targets</TabsTrigger>
          <TabsTrigger value="pages">Pages and settings</TabsTrigger>
        </TabsList>
        {showRange && (
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((range) => (
                  <SelectItem key={range} value={String(range)}>
                    Last {range} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="icon" variant="outline" onClick={() => void load()} disabled={loading} aria-label="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        )}
      </div>

      {error && showRange && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <TabsContent value="overview">
        {dashboard && sites ? <SeoOverviewTab dashboard={dashboard} sites={sites} crawlers={crawlers} /> : loading && <Loading />}
      </TabsContent>
      <TabsContent value="search">
        {dashboard ? <SeoSearchTab data={dashboard} onChanged={() => void load()} /> : loading && <Loading />}
      </TabsContent>
      <TabsContent value="ai">
        {dashboard ? <SeoAiTab data={dashboard} onChanged={() => void load()} /> : loading && <Loading />}
      </TabsContent>
      <TabsContent value="queue">
        <SeoContentQueue />
      </TabsContent>
      <TabsContent value="targets">
        <SeoTargetsTab onOpenQueue={() => setTab('queue')} />
      </TabsContent>
      <TabsContent value="pages" className="space-y-6">
        <SeoAdminPanel />
      </TabsContent>
    </Tabs>
  );
}

function Loading() {
  return <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>;
}
