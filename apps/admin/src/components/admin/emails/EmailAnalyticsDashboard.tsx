import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Mail, RefreshCw } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  fetchEmailAnalytics,
  type EmailAnalyticsCampaign,
  type EmailAnalyticsDashboard as EmailAnalyticsData,
  type EmailAnalyticsRecentEvent,
} from '@/services/emailAnalytics';

const RANGES = [7, 28, 90];

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function pct(n: number): string {
  return `${Number(n || 0).toFixed(1)}%`;
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function eventBadgeVariant(type: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (type.includes('bounce') || type === 'spam' || type === 'blocked' || type === 'invalid' || type === 'error') {
    return 'destructive';
  }
  if (type === 'click' || type === 'opened' || type === 'unique_opened') return 'default';
  if (type === 'delivered' || type === 'sent' || type === 'request') return 'secondary';
  return 'outline';
}

export function EmailAnalyticsDashboard() {
  const [days, setDays] = useState(28);
  const [data, setData] = useState<EmailAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchEmailAnalytics(days);
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = data?.kpis;
  const series = data?.series ?? [];
  const campaigns: EmailAnalyticsCampaign[] = data?.campaigns ?? [];
  const recent: EmailAnalyticsRecentEvent[] = data?.recent ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Mail className="h-5 w-5" />
            Email Analytics
          </h2>
          <p className="text-sm text-muted-foreground">
            Brevo transactional events — sent, opens, clicks, bounces — overall and per campaign.
          </p>
        </div>
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
          <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading} aria-label="Refresh">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading email analytics…
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <KpiCard label="Sent" value={fmt(kpis?.sent ?? 0)} hint="Accepted by Brevo" />
            <KpiCard label="Delivered" value={fmt(kpis?.delivered ?? 0)} hint={pct(kpis?.delivery_rate ?? 0)} />
            <KpiCard label="Open rate" value={pct(kpis?.open_rate ?? 0)} hint={`${fmt(kpis?.unique_opens ?? 0)} unique`} />
            <KpiCard label="Click rate" value={pct(kpis?.click_rate ?? 0)} hint={`${fmt(kpis?.clicks ?? 0)} clicks`} />
            <KpiCard label="Bounce rate" value={pct(kpis?.bounce_rate ?? 0)} hint={`${fmt(kpis?.bounces ?? 0)} total`} />
            <KpiCard label="Spam" value={fmt(kpis?.spam ?? 0)} />
            <KpiCard label="Unsubscribes" value={fmt(kpis?.unsubscribed ?? 0)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily volume</CardTitle>
              <CardDescription>Sent, delivered, opens, and clicks over the selected range.</CardDescription>
            </CardHeader>
            <CardContent>
              {series.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No Brevo events yet. Point the Brevo outbound webhook at /api/brevo-webhook and send a test.
                </p>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <RechartsTooltip />
                      <Legend />
                      <Line type="monotone" dataKey="sent" stroke="#64748b" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="delivered" stroke="#0f766e" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="opens" stroke="#db2777" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="clicks" stroke="#2563eb" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campaigns</CardTitle>
              <CardDescription>
                Grouped by newsletter edition date when linked via Brevo message id; otherwise by tag / subject.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {campaigns.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No campaign rows for this range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Tag</TableHead>
                        <TableHead className="text-right">Sent</TableHead>
                        <TableHead className="text-right">Delivered</TableHead>
                        <TableHead className="text-right">Open %</TableHead>
                        <TableHead className="text-right">Click %</TableHead>
                        <TableHead className="text-right">Bounce %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaigns.map((row) => (
                        <TableRow key={`${row.campaign}-${row.tag}`}>
                          <TableCell>
                            <div className="font-medium">{row.campaign}</div>
                            {row.sample_subject ? (
                              <div className="max-w-xs truncate text-xs text-muted-foreground">{row.sample_subject}</div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{row.tag}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(row.sent)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(row.delivered)}</TableCell>
                          <TableCell className="text-right tabular-nums">{pct(row.open_rate)}</TableCell>
                          <TableCell className="text-right tabular-nums">{pct(row.click_rate)}</TableCell>
                          <TableCell className="text-right tabular-nums">{pct(row.bounce_rate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent events</CardTitle>
              <CardDescription>Latest 100 Brevo events in range.</CardDescription>
            </CardHeader>
            <CardContent>
              {recent.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No recent events.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Detail</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recent.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap text-xs tabular-nums">
                            {format(new Date(row.event_at), 'MMM d, HH:mm')}
                          </TableCell>
                          <TableCell>
                            <Badge variant={eventBadgeVariant(row.event_type)}>{row.event_type}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[12rem] truncate text-sm">{row.email ?? '—'}</TableCell>
                          <TableCell className="max-w-[16rem] truncate text-sm">{row.subject ?? '—'}</TableCell>
                          <TableCell className="max-w-[16rem] truncate text-xs text-muted-foreground">
                            {row.link || row.reason || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default EmailAnalyticsDashboard;
