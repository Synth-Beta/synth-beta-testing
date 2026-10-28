import { useEffect, useState, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;

// Shape returned by get_admin_growth_metrics (supabase/migrations/20261028120000_admin_growth_metrics.sql).
type GrowthMetrics = {
  shares: {
    in_app_7d: number;
    in_app_total: number;
    in_app_sharers_7d: number;
    outside_7d: number;
    outside_total: number;
    outside_sharers_7d: number;
  };
  onboarding: {
    signed_up_30d: number;
    profile_30d: number;
    followed_30d: number;
    completed_30d: number;
    not_completed_all_time: number;
    top_blocks_30d: Array<{ reason: string; users: number }>;
  };
  push: {
    app_users: number;
    with_token: number;
    delivery: { sent_7d: number; failed_7d: number } | null;
  };
  music: { spotify: number; apple_music: number; lastfm: number; spotify_export: number; any: number };
};

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="text-lg font-bold">{typeof value === 'number' ? value.toLocaleString() : value}</div>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">{title}</p>
      {children}
    </div>
  );
}

/** Shares, onboarding funnel, push reach and music connections — all aggregated in the DB. */
export function GrowthMetricsCards() {
  const [m, setM] = useState<GrowthMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    db.rpc('get_admin_growth_metrics').then(({ data, error: rpcError }: { data: GrowthMetrics | null; error: Error | null }) => {
      if (rpcError) {
        console.warn('⚠️ get_admin_growth_metrics failed:', rpcError);
        setError('Growth metrics unavailable. Run migration 20261028120000_admin_growth_metrics.sql.');
      } else setM(data);
    });
  }, []);

  if (error) return <p className="text-xs text-destructive">{error}</p>;
  if (!m) return null;

  const f = m.onboarding;
  const funnel = [
    { label: 'Signed up', value: f.signed_up_30d },
    { label: 'Finished profile', value: f.profile_30d },
    { label: 'Followed an artist', value: f.followed_30d },
    { label: 'Completed', value: f.completed_30d },
  ];

  return (
    <div className="space-y-4">
      <Section title="Shares">
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Shared in app (7d)"
            value={m.shares.in_app_7d}
            note={`${m.shares.in_app_sharers_7d} people · events/reviews sent in chat · ${m.shares.in_app_total.toLocaleString()} all time`}
          />
          <Stat
            label="Shared outside app (7d)"
            value={m.shares.outside_7d}
            note={`${m.shares.outside_sharers_7d} people · links & share sheet · ${m.shares.outside_total.toLocaleString()} all time`}
          />
        </div>
      </Section>

      <Section title="Onboarding funnel · signups in the last 30 days (bots excluded)">
        <Card className="shadow-sm">
          <CardContent className="p-3 space-y-2">
            {funnel.map((step) => (
              <div key={step.label} className="flex items-center gap-3 text-sm">
                <span className="w-36 shrink-0 text-muted-foreground">{step.label}</span>
                <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: f.signed_up_30d > 0 ? `${(step.value / f.signed_up_30d) * 100}%` : '0%' }}
                  />
                </div>
                <span className="w-20 text-right tabular-nums">
                  {step.value} <span className="text-muted-foreground">{pct(step.value, f.signed_up_30d)}</span>
                </span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-1">
              {f.not_completed_all_time.toLocaleString()} real users have never finished onboarding (all time).
              {f.top_blocks_30d.length > 0
                ? ` Top blocks (30d): ${f.top_blocks_30d.map((b) => `${b.reason.replace(/_/g, ' ')} (${b.users})`).join(', ')}.`
                : ' No onboarding blocks logged in 30 days.'}
            </p>
          </CardContent>
        </Card>
      </Section>

      <Section title="Push reach · users who finished onboarding">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Stat
            label="Can get push"
            value={pct(m.push.with_token, m.push.app_users)}
            note={`${m.push.with_token} of ${m.push.app_users} have an active device`}
          />
          {m.push.delivery ? (
            <>
              <Stat label="Pushes sent (7d)" value={m.push.delivery.sent_7d} />
              <Stat label="Push failures (7d)" value={m.push.delivery.failed_7d} />
            </>
          ) : null}
        </div>
      </Section>

      <Section title="Music connections · users">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat label="Any service" value={m.music.any} />
          <Stat label="Spotify" value={m.music.spotify} note="Admins / allowlist" />
          <Stat label="Apple Music" value={m.music.apple_music} />
          <Stat label="Last.fm" value={m.music.lastfm} />
          <Stat label="Spotify upload" value={m.music.spotify_export} />
        </div>
      </Section>
    </div>
  );
}
