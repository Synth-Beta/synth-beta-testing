import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  createSeoAiPrompt,
  createSeoTarget,
  deleteSeoAiPrompt,
  deleteSeoTarget,
  fetchSeoAiPrompts,
  fetchSeoContent,
  fetchSeoTargets,
  runSeoJob,
  updateSeoAiPrompt,
  updateSeoTarget,
  type ContentType,
  type SeoAiPrompt,
  type SeoContent,
  type SeoTarget,
} from '@/services/seoAdmin';
import { Empty, Section } from './seoUi';

const TYPE_LABELS: Record<ContentType, string> = { guide: 'Guide', brand: 'About Synth', comparison: 'Comparison' };
const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  published: 'default',
  review: 'secondary',
  rejected: 'destructive',
  archived: 'outline',
};

export function SeoTargetsTab({ onOpenQueue }: { onOpenQueue: () => void }) {
  const [targets, setTargets] = useState<SeoTarget[]>([]);
  const [content, setContent] = useState<SeoContent[]>([]);
  const [prompts, setPrompts] = useState<SeoAiPrompt[]>([]);
  const [draft, setDraft] = useState({ query: '', page_type: 'guide' as ContentType, cluster: '', priority: '60' });
  const [newPrompt, setNewPrompt] = useState('');
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, c, p] = await Promise.all([fetchSeoTargets(), fetchSeoContent(), fetchSeoAiPrompts()]);
      setTargets(t);
      setContent(c);
      setPrompts(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pageFor = useMemo(() => {
    const map = new Map<string, SeoContent>();
    for (const c of content) {
      if (!c.target_query_id) continue;
      const current = map.get(c.target_query_id);
      if (!current || c.updated_at > current.updated_at) map.set(c.target_query_id, c);
    }
    return map;
  }, [content]);

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (success) setNotice(success);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const addTarget = () => {
    const query = draft.query.trim();
    if (!query) return;
    void run(async () => {
      await createSeoTarget({
        query,
        page_type: draft.page_type,
        cluster: draft.cluster.trim() || 'general',
        priority: Math.min(100, Math.max(1, Number(draft.priority) || 50)),
      });
      setDraft((d) => ({ ...d, query: '' }));
    });
  };

  const generate = async (target: SeoTarget) => {
    setGenerating(target.id);
    await run(() => runSeoJob('seo-content', { target: target.id }), `Draft ready for "${target.query}". Review it in the content queue.`);
    setGenerating(null);
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <p className="text-sm text-emerald-700">
          {notice}{' '}
          <button type="button" className="underline" onClick={onOpenQueue}>
            Open queue
          </button>
        </p>
      )}

      <Section
        title="Target searches"
        description="The searches Synth should be the answer to. Each day the two highest-priority targets without a page get an AI draft for review; nothing is published until approved."
      >
        <div className="mb-4 grid gap-2 md:grid-cols-[1fr_150px_150px_90px_auto]">
          <Input placeholder='A search people type, e.g. "concert buddy app"' value={draft.query} onChange={(e) => setDraft({ ...draft, query: e.target.value })} />
          <Select value={draft.page_type} onValueChange={(v) => setDraft({ ...draft, page_type: v as ContentType })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TYPE_LABELS) as ContentType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Cluster" value={draft.cluster} onChange={(e) => setDraft({ ...draft, cluster: e.target.value })} />
          <Input type="number" min={1} max={100} title="Priority (1–100)" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} />
          <Button onClick={addTarget}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </div>
        {targets.length === 0 ? (
          <Empty>No targets yet.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Search</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Priority</TableHead>
                <TableHead>Page</TableHead>
                <TableHead>Active</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {targets.map((t) => {
                const page = pageFor.get(t.id);
                return (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="font-medium">{t.query}</div>
                      <div className="text-xs text-muted-foreground">{t.cluster}</div>
                    </TableCell>
                    <TableCell>{TYPE_LABELS[t.page_type]}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        className="ml-auto h-8 w-20 text-right"
                        defaultValue={t.priority}
                        onBlur={(e) => {
                          const priority = Math.min(100, Math.max(1, Number(e.target.value) || t.priority));
                          if (priority !== t.priority) void run(() => updateSeoTarget(t.id, { priority }));
                        }}
                      />
                    </TableCell>
                    <TableCell>{page ? <Badge variant={STATUS_BADGE[page.status]}>{page.status}</Badge> : <span className="text-xs text-muted-foreground">none</span>}</TableCell>
                    <TableCell>
                      <Switch checked={t.active} onCheckedChange={(active) => void run(() => updateSeoTarget(t.id, { active }))} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button size="sm" variant="outline" disabled={generating !== null || page?.status === 'published'} onClick={() => void generate(t)}>
                        <Sparkles className="mr-1 h-3 w-3" />
                        {generating === t.id ? 'Writing…' : page ? 'Regenerate' : 'Generate draft'}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => window.confirm(`Delete "${t.query}"?`) && void run(() => deleteSeoTarget(t.id))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="Questions asked to AI assistants" description="Tracked weekly on the AI visibility tab. Phrase them the way a person would ask ChatGPT.">
        <div className="mb-4 flex gap-2">
          <Input placeholder="e.g. What's a good app to meet people at concerts?" value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} />
          <Button
            onClick={() => {
              const prompt = newPrompt.trim();
              if (prompt) void run(async () => {
                await createSeoAiPrompt(prompt, 'general');
                setNewPrompt('');
              });
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </div>
        {prompts.length === 0 ? (
          <Empty>No questions yet.</Empty>
        ) : (
          <Table>
            <TableBody>
              {prompts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {p.prompt}
                    <div className="text-xs text-muted-foreground">{p.cluster}</div>
                  </TableCell>
                  <TableCell className="w-16">
                    <Switch checked={p.active} onCheckedChange={(active) => void run(() => updateSeoAiPrompt(p.id, { active }))} />
                  </TableCell>
                  <TableCell className="w-12">
                    <Button size="icon" variant="ghost" onClick={() => window.confirm('Delete this question and its history?') && void run(() => deleteSeoAiPrompt(p.id))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}
