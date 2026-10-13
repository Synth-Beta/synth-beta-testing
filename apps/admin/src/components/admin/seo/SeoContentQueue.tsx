import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Check, Eye, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  contentPageUrl,
  fetchSeoContent,
  runSeoJob,
  saveSeoContent,
  setSeoContentStatus,
  type ContentEdit,
  type ContentStatus,
  type SeoContent,
} from '@/services/seoAdmin';
import { Empty, ExtLink, Section } from './seoUi';

const STATUSES: Array<{ id: ContentStatus; label: string }> = [
  { id: 'review', label: 'Needs review' },
  { id: 'published', label: 'Published' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'archived', label: 'Archived' },
];
const TYPE_LABELS = { guide: 'Guide', brand: 'About Synth', comparison: 'Comparison' } as const;

const toEdit = (c: SeoContent): ContentEdit => ({
  slug: c.slug,
  title: c.title,
  meta_description: c.meta_description,
  summary: c.summary,
  body_md: c.body_md,
  faq: Array.isArray(c.faq) ? c.faq : [],
  keywords: c.keywords ?? [],
});

/** Embeds render live listings on the real page; the preview shows a placeholder. */
const previewMarkdown = (md: string) =>
  md.replace(/^\s*\{\{\s*(events|venues)([^}]*)\}\}\s*$/gm, (_, kind: string, params: string) => `> **Live ${kind} listing**${params.trim() ? ` (${params.trim()})` : ''}`);

function Counter({ value, max }: { value: string; max: number }) {
  return <span className={`text-xs ${value.length > max ? 'text-rose-600' : 'text-muted-foreground'}`}>{value.length}/{max}</span>;
}

export function SeoContentQueue() {
  const [items, setItems] = useState<SeoContent[]>([]);
  const [status, setStatus] = useState<ContentStatus>('review');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [edit, setEdit] = useState<ContentEdit | null>(null);
  const [preview, setPreview] = useState(true);
  const [rejectNote, setRejectNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await fetchSeoContent());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s.id, items.filter((i) => i.status === s.id).length])), [items]);
  const visible = items.filter((i) => i.status === status);
  const selected = items.find((i) => i.id === selectedId) ?? null;

  useEffect(() => {
    setEdit(selected ? toEdit(selected) : null);
    setRejectNote('');
    setPreview(true);
  }, [selected]);

  const dirty = !!selected && !!edit && JSON.stringify(toEdit(selected)) !== JSON.stringify(edit);

  const act = async (fn: () => Promise<void>, success: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(success);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const save = () => selected && edit && act(() => saveSeoContent(selected.id, edit), 'Saved.');
  const publish = () =>
    selected &&
    edit &&
    act(async () => {
      if (dirty) await saveSeoContent(selected.id, edit);
      await setSeoContentStatus(selected, 'published', null);
    }, 'Published. The page is live and will be in tomorrow’s sitemap ping.');
  const reject = () =>
    selected &&
    act(async () => {
      await setSeoContentStatus(selected, 'rejected', rejectNote.trim() || null);
      setSelectedId(null);
    }, 'Rejected. The next generation for this search will use your note.');
  const archive = () => selected && act(() => setSeoContentStatus(selected, 'archived'), 'Unpublished.');
  const restore = () => selected && act(() => setSeoContentStatus(selected, 'review'), 'Moved back to review.');
  const regenerate = () =>
    selected?.target_query_id &&
    act(async () => {
      await runSeoJob('seo-content', { target: selected.target_query_id! });
    }, 'New draft generated.');

  const setField = <K extends keyof ContentEdit>(key: K, value: ContentEdit[K]) => setEdit((e) => (e ? { ...e, [key]: value } : e));
  const setFaq = (i: number, key: 'q' | 'a', value: string) =>
    setEdit((e) => (e ? { ...e, faq: e.faq.map((f, j) => (j === i ? { ...f, [key]: value } : f)) } : e));

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <Button key={s.id} size="sm" variant={status === s.id ? 'default' : 'outline'} onClick={() => setStatus(s.id)}>
            {s.label}
            <Badge variant="secondary" className="ml-2">
              {counts[s.id] ?? 0}
            </Badge>
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(260px,1fr)_2fr]">
        <Section title={STATUSES.find((s) => s.id === status)!.label}>
          {visible.length === 0 ? (
            <Empty>{status === 'review' ? 'Nothing waiting. New drafts arrive daily from the targets list, or generate one there.' : 'Nothing here.'}</Empty>
          ) : (
            <ul className="divide-y">
              {visible.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`w-full px-2 py-3 text-left hover:bg-muted ${item.id === selectedId ? 'bg-muted' : ''}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{TYPE_LABELS[item.page_type]}</Badge>
                      {new Date(item.updated_at).toLocaleDateString()}
                      {item.review_notes && status === 'review' && <span className="text-amber-600">has notes</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {selected && edit ? (
          <Section
            title={edit.title || 'Untitled'}
            description={`${TYPE_LABELS[selected.page_type]} · ${contentPageUrl({ page_type: selected.page_type, slug: edit.slug })}`}
            action={
              selected.status === 'published' ? (
                <ExtLink href={contentPageUrl(selected)}>View live</ExtLink>
              ) : undefined
            }
          >
            <div className="space-y-4">
              {selected.review_notes && (
                <Alert>
                  <AlertDescription className="whitespace-pre-wrap text-sm">{selected.review_notes}</AlertDescription>
                </Alert>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <Label>Title</Label>
                    <Counter value={edit.title} max={60} />
                  </div>
                  <Input value={edit.title} onChange={(e) => setField('title', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Slug</Label>
                  <Input
                    value={edit.slug}
                    disabled={selected.status === 'published'}
                    onChange={(e) => setField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <Label>Meta description</Label>
                  <Counter value={edit.meta_description} max={155} />
                </div>
                <Textarea rows={2} value={edit.meta_description} onChange={(e) => setField('meta_description', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Summary (the direct answer shown first and quoted by AI assistants)</Label>
                <Textarea rows={3} value={edit.summary} onChange={(e) => setField('summary', e.target.value)} />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Body</Label>
                  <Button size="sm" variant="ghost" onClick={() => setPreview((p) => !p)}>
                    {preview ? <Pencil className="mr-1 h-3 w-3" /> : <Eye className="mr-1 h-3 w-3" />}
                    {preview ? 'Edit' : 'Preview'}
                  </Button>
                </div>
                {preview ? (
                  <div className="max-h-[480px] overflow-auto rounded border p-4 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
                    <ReactMarkdown>{previewMarkdown(edit.body_md)}</ReactMarkdown>
                  </div>
                ) : (
                  <Textarea rows={22} className="font-mono text-xs" value={edit.body_md} onChange={(e) => setField('body_md', e.target.value)} />
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>FAQ</Label>
                  <Button size="sm" variant="ghost" onClick={() => setField('faq', [...edit.faq, { q: '', a: '' }])}>
                    <Plus className="mr-1 h-3 w-3" />
                    Add
                  </Button>
                </div>
                {edit.faq.map((f, i) => (
                  <div key={i} className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Input placeholder="Question" value={f.q} onChange={(e) => setFaq(i, 'q', e.target.value)} />
                      <Textarea rows={2} placeholder="Answer" value={f.a} onChange={(e) => setFaq(i, 'a', e.target.value)} />
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setField('faq', edit.faq.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <Label>Related searches (comma-separated)</Label>
                <Input
                  value={edit.keywords.join(', ')}
                  onChange={(e) => setField('keywords', e.target.value.split(',').map((k) => k.trim()).filter(Boolean))}
                />
              </div>

              {selected.grounding != null && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Facts the draft was written from ({selected.model ?? 'model unknown'})</summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2">{JSON.stringify(selected.grounding, null, 2)}</pre>
                </details>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                {selected.status !== 'published' && (
                  <Button onClick={publish} disabled={busy}>
                    <Check className="mr-2 h-4 w-4" />
                    Approve and publish
                  </Button>
                )}
                <Button variant="outline" onClick={save} disabled={busy || !dirty}>
                  Save changes
                </Button>
                {selected.status === 'published' && (
                  <Button variant="outline" onClick={archive} disabled={busy}>
                    Unpublish
                  </Button>
                )}
                {(selected.status === 'rejected' || selected.status === 'archived') && (
                  <Button variant="outline" onClick={restore} disabled={busy}>
                    Back to review
                  </Button>
                )}
                {selected.target_query_id && selected.status !== 'published' && (
                  <Button variant="ghost" onClick={regenerate} disabled={busy}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Regenerate
                  </Button>
                )}
              </div>
              {selected.status === 'review' && (
                <div className="flex gap-2">
                  <Input placeholder="Why reject? The next draft for this search will be told." value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
                  <Button variant="destructive" onClick={reject} disabled={busy}>
                    <X className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          </Section>
        ) : (
          <Section title="Select a page">
            <Empty>Pick a draft on the left to review it.</Empty>
          </Section>
        )}
      </div>
    </div>
  );
}
