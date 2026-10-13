import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchCrawlerTraffic, type CrawlerTraffic } from '@/services/seoAdmin';
import { SeoAdminPanel } from './SeoAdminPanel';
import { SeoAiTab } from './SeoAiTab';
import { SeoContentQueue } from './SeoContentQueue';
import { SeoOverviewTab } from './SeoOverviewTab';
import { SeoSearchTab } from './SeoSearchTab';
import { SeoTargetsTab } from './SeoTargetsTab';
import { EMPTY_SEO_DASHBOARD } from './emptyDashboard';

const RANGES = [7, 28, 90, 180];

export function SeoDashboard() {
  const [tab, setTab] = useState('overview');
  const [days, setDays] = useState(28);
  const [traffic, setTraffic] = useState<CrawlerTraffic | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTraffic(await fetchCrawlerTraffic(days));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

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
        {tab === 'overview' && (
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    Last {r} days
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

      {error && tab === 'overview' && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <TabsContent value="overview">{traffic ? <SeoOverviewTab data={traffic} /> : loading && <Loading />}</TabsContent>
      <TabsContent value="search">
        <SeoSearchTab data={{ ...EMPTY_SEO_DASHBOARD, days }} onChanged={() => undefined} />
      </TabsContent>
      <TabsContent value="ai">
        <SeoAiTab data={{ ...EMPTY_SEO_DASHBOARD, days }} onChanged={() => undefined} />
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
