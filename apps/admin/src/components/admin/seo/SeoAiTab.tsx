import { Fragment, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, ChevronRight, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { runSeoJob, type SeoDashboard } from '@/services/seoAdmin';
import { PLATFORM_COLORS, PLATFORM_LABELS, pct, shortDay } from './seoFormat';
import { BarList, Empty, ExtLink, Section } from './seoUi';

type Latest = SeoDashboard['ai_latest'][number];

function ResultCell({ row }: { row: Latest | undefined }) {
  if (!row) return <span className="text-xs text-muted-foreground">not run</span>;
  if (row.error) return <Badge variant="outline">error</Badge>;
  if (!row.mentioned) return <Badge variant="secondary">not mentioned</Badge>;
  return (
    <div className="flex flex-wrap gap-1">
      <Badge>{row.synth_rank ? `#${row.synth_rank} brand named` : 'mentioned'}</Badge>
      {row.synth_cited && <Badge className="bg-emerald-600 hover:bg-emerald-600">cited</Badge>}
    </div>
  );
}

export function SeoAiTab({ data, onChanged }: { data: SeoDashboard; onChanged: () => void }) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const platforms = useMemo(
    () => [...new Set([...data.ai_visibility.map((v) => v.platform), ...data.ai_latest.map((l) => l.platform)])].sort(),
    [data.ai_visibility, data.ai_latest],
  );

  const weekly = useMemo(() => {
    const byWeek = new Map<string, Record<string, number | string | null>>();
    for (const row of data.ai_weekly) {
      const entry = byWeek.get(row.week) ?? { week: row.week };
      entry[row.platform] = row.mention_rate;
      byWeek.set(row.week, entry);
    }
    return [...byWeek.values()].sort((a, b) => String(a.week).localeCompare(String(b.week)));
  }, [data.ai_weekly]);

  const prompts = useMemo(() => {
    const byPrompt = new Map<string, Map<string, Latest>>();
    for (const row of data.ai_latest) {
      const entry = byPrompt.get(row.prompt) ?? new Map<string, Latest>();
      entry.set(row.platform, row);
      byPrompt.set(row.prompt, entry);
    }
    return [...byPrompt.entries()];
  }, [data.ai_latest]);

  const run = async () => {
    setRunning(true);
    setMessage('Asking each assistant every tracked question. This takes a few minutes…');
    try {
      const result = await runSeoJob('seo-ai-visibility', { force: '1' });
      if (result.skipped) setMessage(String(result.skipped));
      else setMessage(`Asked ${result.asked} questions; Synth came up in ${result.mentioned}.${Number(result.remaining) ? ` ${result.remaining} left for the next run.` : ''}`);
      onChanged();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Each week the tracked questions are put to ChatGPT search, Perplexity, and Gemini with live web search, and each answer is checked for Synth.
          "Mentioned" means the answer names Synth; "cited" means it links to a getsynth.app page.
        </p>
        <Button size="sm" onClick={run} disabled={running}>
          <Play className="mr-2 h-4 w-4" />
          {running ? 'Running…' : 'Run now'}
        </Button>
      </div>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {platforms.length === 0 && (
          <Card className="md:col-span-3">
            <CardContent className="p-4">
              <Empty>No answers tracked yet. OPENAI_API_KEY enables ChatGPT search; add PERPLEXITY_API_KEY and GEMINI_API_KEY for the others.</Empty>
            </CardContent>
          </Card>
        )}
        {data.ai_visibility.map((v) => (
          <Card key={v.platform}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{PLATFORM_LABELS[v.platform] ?? v.platform}</div>
              <div className="mt-1 text-2xl font-semibold">{pct(v.mentioned, v.runs)}</div>
              <div className="text-xs text-muted-foreground">
                of {v.runs} answers mention Synth · {pct(v.cited, v.runs)} cite getsynth.app
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section title="Mention rate by week" description="Share of answers that mention Synth, per assistant.">
            {weekly.length === 0 ? (
              <Empty>No runs yet.</Empty>
            ) : (
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={weekly}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="week" tickFormatter={shortDay} fontSize={12} />
                    <YAxis domain={[0, 100]} unit="%" fontSize={12} width={45} />
                    <Tooltip labelFormatter={(w) => `Week of ${shortDay(String(w))}`} formatter={(v) => `${v}%`} />
                    <Legend formatter={(v) => PLATFORM_LABELS[v] ?? v} />
                    {platforms.map((p) => (
                      <Line key={p} type="monotone" dataKey={p} stroke={PLATFORM_COLORS[p] ?? '#64748b'} strokeWidth={2} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Section>
        </div>
        <Section title="Who the assistants recommend" description="Brands named in answers, this range.">
          {data.competitors.length === 0 ? <Empty>None yet.</Empty> : <BarList color="#64748b" rows={data.competitors.map((c) => ({ label: c.brand, value: c.mentions }))} />}
        </Section>
      </div>

      <Section title="Latest answers" description="Most recent answer per question and assistant. Click a question to read the answers.">
        {prompts.length === 0 ? (
          <Empty>No answers yet.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Question</TableHead>
                {platforms.map((p) => (
                  <TableHead key={p}>{PLATFORM_LABELS[p] ?? p}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {prompts.map(([prompt, byPlatform]) => (
                <Fragment key={prompt}>
                  <TableRow className="cursor-pointer" onClick={() => setOpen(open === prompt ? null : prompt)}>
                    <TableCell className="max-w-md">
                      <span className="inline-flex items-start gap-1">
                        {open === prompt ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
                        {prompt}
                      </span>
                    </TableCell>
                    {platforms.map((p) => (
                      <TableCell key={p}>
                        <ResultCell row={byPlatform.get(p)} />
                      </TableCell>
                    ))}
                  </TableRow>
                  {open === prompt && (
                    <TableRow>
                      <TableCell colSpan={platforms.length + 1} className="bg-muted/40">
                        <div className="grid gap-4 md:grid-cols-3">
                          {platforms.map((p) => {
                            const row = byPlatform.get(p);
                            if (!row) return null;
                            return (
                              <div key={p} className="space-y-2 text-sm">
                                <div className="font-medium">
                                  {PLATFORM_LABELS[p] ?? p}{' '}
                                  <span className="text-xs font-normal text-muted-foreground">{new Date(row.run_at).toLocaleDateString()}</span>
                                </div>
                                {row.error ? (
                                  <p className="text-rose-600">{row.error}</p>
                                ) : (
                                  <>
                                    {row.brands_mentioned.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {row.brands_mentioned.map((b) => (
                                          <Badge key={b} variant="outline">
                                            {b}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                    <p className="max-h-60 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{row.answer_excerpt}</p>
                                    {row.cited_urls.length > 0 && (
                                      <ul className="space-y-0.5 text-xs">
                                        {row.cited_urls.slice(0, 8).map((u) => (
                                          <li key={u} className="truncate">
                                            <ExtLink href={u}>{u.replace(/^https?:\/\//, '').slice(0, 60)}</ExtLink>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}
