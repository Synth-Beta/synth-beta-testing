import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  cancelScheduledPost,
  clearScheduledPosts,
  countScheduledPosts,
  downloadMessageLogCsv,
  fetchCronSettings,
  fetchScheduledPosts,
  rebuildTodaySchedule,
  saveCronSettings,
  seedSampleMessages,
  SAMPLE_SEED_COUNT,
  previewSampleMessages,
  type CronSettings,
  type ScheduledPost,
} from '@/services/aiSceneGuidesCron';
import {
  DEFAULT_WRITING_STRATEGY,
  mergeWritingStrategy,
  templatesToText,
  textToTemplates,
} from '@synth/ai-scene-guides/quality';
import {
  Clock,
  RefreshCw,
  ShieldOff,
  CalendarClock,
  Ban,
  PlayCircle,
  Download,
  Database,
  Trash2,
  PenLine,
} from 'lucide-react';

const DEFAULT_SETTINGS: CronSettings = {
  enabled: false,
  cron_enabled: false,
  dry_run: true,
  mode: 'fixture',
  max_ai_messages_per_room_day: 30,
  cron_posts_per_genre_min: 5,
  cron_posts_per_genre_max: 30,
  cron_genres: ['indie', 'hip-hop', 'edm', 'metal', 'pop'],
  last_cron_schedule_at: null,
  last_cron_publish_at: null,
  pause_on_human_activity: true,
  writing_strategy: DEFAULT_WRITING_STRATEGY,
};

function statusBadge(status: string) {
  const map: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    scheduled: 'outline',
    posting: 'secondary',
    posted: 'default',
    skipped: 'secondary',
    failed: 'destructive',
    cancelled: 'secondary',
  };
  return <Badge variant={map[status] ?? 'outline'}>{status}</Badge>;
}

export function AiSceneGuidesAdminPanel() {
  const [settings, setSettings] = useState<CronSettings>(DEFAULT_SETTINGS);
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<'upcoming' | 'all' | 'posted' | 'skipped'>('upcoming');
  const [previewPosts, setPreviewPosts] = useState<
    Array<{ action: string; content: string | null; genre_id: string; persona_name: string | null }>
  >([]);
  const [previewStats, setPreviewStats] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [s, p, total] = await Promise.all([
        fetchCronSettings(),
        fetchScheduledPosts(5000),
        countScheduledPosts(),
      ]);
      setSettings({
        ...s,
        writing_strategy: mergeWritingStrategy(s.writing_strategy),
      });
      setPosts(p);
      setTotalCount(total);
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : 'Failed to load — apply migrations 20260806120000 + 20260806140000',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (patch: Partial<CronSettings>) => {
    setBusy(true);
    setMessage(null);
    try {
      const next = { ...settings, ...patch };
      await saveCronSettings(patch);
      setSettings(next);
      setMessage('Saved');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const rebuild = async () => {
    setBusy(true);
    setMessage(null);
    try {
      // Ensure cron flag is on when rebuilding so ops intent is clear
      if (!settings.cron_enabled) {
        await saveCronSettings({ cron_enabled: true });
        setSettings((s) => ({ ...s, cron_enabled: true }));
      }
      const result = await rebuildTodaySchedule({
        ...settings,
        cron_enabled: true,
      });
      setMessage(`Scheduled ${result.scheduled} posts. ${result.detail.join(' · ')}`);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Rebuild failed');
    } finally {
      setBusy(false);
    }
  };

  const previewVoice = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await previewSampleMessages(settings, { count: 40 });
      setPreviewPosts(result.posts);
      setPreviewStats(
        `${result.stats.posts} POST / ${result.stats.replies} REPLY / ${result.stats.silences} SILENCE (${Math.round(result.stats.silenceRate * 100)}%) · unique ${result.stats.uniqueTexts} · families ${result.stats.templateFamilies} · 21–45w ${result.stats.lengthBuckets.mid21_45}`,
      );
      setMessage('Preview only — queue was not written. Save voice/strategy, then run Contextual test to insert.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  };

  const saveVoice = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const writing_strategy = mergeWritingStrategy(settings.writing_strategy);
      await saveCronSettings({ writing_strategy });
      setSettings((s) => ({ ...s, writing_strategy }));
      setMessage('Voice and strategy saved to the database. Later edits do not need a code deploy.');
    } catch (e) {
      setMessage(
        e instanceof Error
          ? `${e.message} — apply migration 20260817160000_ai_scene_guides_writing_strategy.sql`
          : 'Save failed',
      );
    } finally {
      setBusy(false);
    }
  };

  const seedSample = async (count = SAMPLE_SEED_COUNT) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await seedSampleMessages(settings, { count });
      setMessage(
        `Contextual seed: ${result.scheduled} scheduled, ${result.silences} SILENCE. ${result.detail.join(' · ')}`,
      );
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Sample seed failed');
    } finally {
      setBusy(false);
    }
  };

  const clearQueue = async () => {
    if (
      !window.confirm(
        `Clear all ${posts.length} scheduled/log rows? This cannot be undone. Use this to test a fresh quality seed.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const n = await clearScheduledPosts();
      setPosts([]);
      setTotalCount(0);
      setMessage(`Cleared ${n} rows. Queue is empty — ready for a fresh quality seed.`);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Clear failed');
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const now = Date.now();
    return posts.filter((p) => {
      if (filter === 'upcoming') {
        return p.status === 'scheduled' && Date.parse(p.scheduled_at) >= now - 60_000;
      }
      if (filter === 'posted') return p.status === 'posted';
      if (filter === 'skipped') {
        return p.status === 'skipped' || p.status === 'failed' || p.status === 'cancelled';
      }
      return true;
    });
  }, [posts, filter]);

  const counts = useMemo(() => {
    return {
      scheduled: posts.filter((p) => p.status === 'scheduled').length,
      posted: posts.filter((p) => p.status === 'posted').length,
      skipped: posts.filter((p) => p.status === 'skipped' || p.status === 'failed').length,
      total: totalCount || posts.length,
      loaded: posts.length,
    };
  }, [posts, totalCount]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">Loading AI Scene Guides cron…</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            AI Scene Guides — Cron
            <Badge variant={settings.cron_enabled ? 'default' : 'secondary'}>
              {settings.cron_enabled ? 'cron ON' : 'cron OFF'}
            </Badge>
            <Badge variant={settings.enabled ? 'default' : 'secondary'}>
              {settings.enabled ? 'kill switch open' : 'kill switch OFF'}
            </Badge>
            <Badge variant="outline">{settings.dry_run ? 'dry-run' : settings.mode}</Badge>
          </CardTitle>
          <CardDescription>
            <strong>Contextual test (200)</strong> generates one contribution at a time from room
            state — records POST, REPLY, and SILENCE. Personas bind 1:1 to sender accounts. Do not
            run 1,000-message batches until that test passes human review. Daily cron remains a
            separate cadence path (<code>author_type=ai_scene_guide</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg border p-3">
              <div className="text-muted-foreground text-xs">Total in queue</div>
              <div className="text-2xl font-bold">{counts.total}</div>
              {counts.loaded < counts.total && (
                <div className="text-[10px] text-muted-foreground">
                  showing {counts.loaded} loaded
                </div>
              )}
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-muted-foreground text-xs">Queued (scheduled)</div>
              <div className="text-2xl font-bold">{counts.scheduled}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-muted-foreground text-xs">Posted</div>
              <div className="text-2xl font-bold">{counts.posted}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-muted-foreground text-xs">Skipped / failed</div>
              <div className="text-2xl font-bold">{counts.skipped}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-muted-foreground text-xs">Per genre / day</div>
              <div className="text-2xl font-bold">
                {settings.cron_posts_per_genre_min}–{settings.cron_posts_per_genre_max}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              Last schedule: {settings.last_cron_schedule_at
                ? new Date(settings.last_cron_schedule_at).toLocaleString()
                : '—'}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Last publish tick: {settings.last_cron_publish_at
                ? new Date(settings.last_cron_publish_at).toLocaleString()
                : '—'}
            </span>
            <span>Genres: {settings.cron_genres.join(', ')}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void seedSample(200)} disabled={busy}>
              <Database className="h-4 w-4 mr-1" />
              Contextual test (200 decisions)
            </Button>
            <Button variant="outline" onClick={() => void seedSample(100)} disabled={busy}>
              Contextual test 100
            </Button>
            <Button
              variant="destructive"
              onClick={() => void clearQueue()}
              disabled={busy || posts.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear queue
            </Button>
            <Button variant="outline" onClick={() => void rebuild()} disabled={busy}>
              <PlayCircle className="h-4 w-4 mr-1" />
              Rebuild today’s cadence (5–30 / genre)
            </Button>
            <Button
              variant="outline"
              disabled={posts.length === 0}
              onClick={() => downloadMessageLogCsv(posts)}
            >
              <Download className="h-4 w-4 mr-1" />
              Download message log (CSV)
            </Button>
            <Button variant="secondary" onClick={() => void load()} disabled={busy}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </div>

          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </CardContent>
      </Card>

      <Tabs defaultValue="queue" className="w-full">
        <TabsList>
          <TabsTrigger value="queue">Schedule queue</TabsTrigger>
          <TabsTrigger value="voice">Voice & strategy</TabsTrigger>
          <TabsTrigger value="controls">Cron controls</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-3 mt-4">
          <div className="flex flex-wrap gap-2">
            {(['upcoming', 'all', 'posted', 'skipped'] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? 'default' : 'outline'}
                onClick={() => setFilter(f)}
              >
                {f}
              </Button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No scheduled posts yet. Use <strong>Seed sample (300)</strong> for a large review
                set, or turn <strong>Cron enabled</strong> on and rebuild today’s cadence.
              </CardContent>
            </Card>
          ) : (
            filtered.map((p) => (
              <Card key={p.id} className="shadow-sm">
                <CardContent className="py-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {statusBadge(p.status)}
                      <Badge variant="outline">AI Scene Guide</Badge>
                      <span className="text-sm font-medium">{p.genre_id}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.chat_name || p.room_id.slice(0, 8)}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {new Date(p.scheduled_at).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-sm leading-relaxed m-0">{p.content}</p>

                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>
                      From user:{' '}
                      <strong className="text-foreground">
                        {p.sender_name || p.sender_user_id.slice(0, 8)}
                      </strong>
                    </span>
                    {p.persona_name && (
                      <span>
                        Persona: <strong className="text-foreground">{p.persona_name}</strong>
                      </span>
                    )}
                    {p.intent && <span>Intent: {p.intent}</span>}
                    {p.skip_reason && <span className="text-amber-700">Skip: {p.skip_reason}</span>}
                    {p.error && <span className="text-red-700">Error: {p.error}</span>}
                  </div>

                  {p.status === 'scheduled' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await cancelScheduledPost(p.id);
                          await load();
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Ban className="h-3.5 w-3.5 mr-1" />
                      Cancel
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="voice" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PenLine className="h-4 w-4" />
                Voice & strategy
              </CardTitle>
              <CardDescription>
                Stored on <code>ai_scene_guides_settings.writing_strategy</code>. Edit here, preview,
                then contextual-test. Do not ship a new commit for copy tweaks. Placeholders:{' '}
                <code>{'{artist}'}</code> <code>{'{venue}'}</code> <code>{'{date}'}</code>{' '}
                <code>{'{city}'}</code> <code>{'{doors}'}</code> <code>{'{start}'}</code>{' '}
                <code>{'{genre}'}</code>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ai-voice">Voice</Label>
                <Textarea
                  id="ai-voice"
                  rows={4}
                  value={settings.writing_strategy.voice}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      writing_strategy: { ...s.writing_strategy, voice: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-strategy">Strategy</Label>
                <Textarea
                  id="ai-strategy"
                  rows={5}
                  value={settings.writing_strategy.strategy}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      writing_strategy: { ...s.writing_strategy, strategy: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-templates">Opener templates (one per line)</Label>
                <Textarea
                  id="ai-templates"
                  rows={12}
                  className="font-mono text-xs"
                  value={templatesToText(settings.writing_strategy.openerTemplates)}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      writing_strategy: {
                        ...s.writing_strategy,
                        openerTemplates: textToTemplates(e.target.value),
                      },
                    }))
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void saveVoice()} disabled={busy}>
                  Save voice & strategy
                </Button>
                <Button variant="outline" onClick={() => void previewVoice()} disabled={busy}>
                  Preview 40 decisions
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      writing_strategy: DEFAULT_WRITING_STRATEGY,
                    }))
                  }
                >
                  Reset to code defaults
                </Button>
              </div>
              {previewStats && (
                <p className="text-sm text-muted-foreground">{previewStats}</p>
              )}
              {previewPosts.length > 0 && (
                <div className="space-y-2 max-h-[420px] overflow-auto rounded-md border p-3">
                  {previewPosts.map((p, i) => (
                    <div key={`${p.genre_id}-${i}`} className="text-sm border-b last:border-0 pb-2">
                      <div className="text-xs text-muted-foreground">
                        {p.action} · {p.genre_id}
                        {p.persona_name ? ` · ${p.persona_name}` : ''}
                      </div>
                      <p className="m-0">{p.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="controls" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enable / kill switch</CardTitle>
              <CardDescription>
                Cron schedule job: <code>0 6 * * *</code> →{' '}
                <code>/api/cron/ai-scene-guides-schedule</code>
                <br />
                Publish ticks (Hobby-safe, once per day each): 12:00 / 15:00 / 18:00 / 21:00 / 00:00
                UTC → <code>/api/cron/ai-scene-guides-publish</code>
                <br />
                Vercel Hobby cannot run <code>*/15</code>. Pro would allow a true 15-minute tick.
                <br />
                Live posting requires cron ON + kill switch open + dry-run OFF + mode production (or
                staff_approve).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Cron enabled</Label>
                  <p className="text-sm text-muted-foreground">
                    When on, the daily schedule job plus several once-a-day publish ticks run.
                  </p>
                </div>
                <Switch
                  checked={settings.cron_enabled}
                  disabled={busy}
                  onCheckedChange={(cron_enabled) => void save({ cron_enabled })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Global enable (kill switch inverse)</Label>
                  <p className="text-sm text-muted-foreground">Must be on for any live publish.</p>
                </div>
                <Switch
                  checked={settings.enabled}
                  disabled={busy}
                  onCheckedChange={(enabled) =>
                    void save({
                      enabled,
                      dry_run: enabled ? settings.dry_run : true,
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Dry-run</Label>
                  <p className="text-sm text-muted-foreground">
                    Due posts are marked skipped instead of writing to messages.
                  </p>
                </div>
                <Switch
                  checked={settings.dry_run}
                  disabled={busy}
                  onCheckedChange={(dry_run) => void save({ dry_run })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Pause when humans recently active</Label>
                </div>
                <Switch
                  checked={settings.pause_on_human_activity}
                  disabled={busy}
                  onCheckedChange={(pause_on_human_activity) =>
                    void save({ pause_on_human_activity })
                  }
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void save({
                      mode: 'production',
                      dry_run: false,
                      enabled: true,
                      cron_enabled: true,
                      cron_posts_per_genre_min: 5,
                      cron_posts_per_genre_max: 30,
                      max_ai_messages_per_room_day: 30,
                    })
                  }
                >
                  Go live (cron + production)
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() =>
                    void save({
                      enabled: false,
                      cron_enabled: false,
                      dry_run: true,
                    })
                  }
                >
                  <ShieldOff className="h-4 w-4 mr-1" />
                  Kill switch
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
