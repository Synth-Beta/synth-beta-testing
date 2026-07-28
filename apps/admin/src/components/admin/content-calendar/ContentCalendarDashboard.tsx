import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  Copy,
  Loader2,
  MapPin,
  Music2,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  addDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  setHours,
  setMinutes,
  startOfWeek,
} from 'date-fns';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  approvePost,
  createManualCalendarPost,
  deleteCalendarPost,
  dispatchDuePosts,
  findLatestSavedResearch,
  generateDraftsForSubject,
  listCalendarPosts,
  listDcUpcomingEvents,
  listDcVenues,
  listSnippetsForSubject,
  markPublishedManually,
  moveCalendarPost,
  publishPostNow,
  rejectPost,
  researchSubject,
  updateCalendarPost,
  type DcStreamEvent,
  type DcStreamVenue,
  type ResearchBrief,
  type SubjectResearchResult,
} from '@/services/contentCalendar/contentCalendarService';
import type {
  CalendarPlatform,
  ContentCalendarPost,
  EditorialSnippet,
} from '@/services/contentCalendar/types';

type StreamKind = 'events' | 'venues';
const DRAFT_PLATFORMS = ['instagram', 'linkedin', 'substack', 'reddit'] as const;

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'published') return 'default';
  if (status === 'failed' || status === 'rejected') return 'destructive';
  if (status === 'pending_review') return 'secondary';
  return 'outline';
}

export default function ContentCalendarDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [streamKind, setStreamKind] = useState<StreamKind>('events');
  const [events, setEvents] = useState<DcStreamEvent[]>([]);
  const [venues, setVenues] = useState<DcStreamVenue[]>([]);
  const [streamLoading, setStreamLoading] = useState(true);
  const [query, setQuery] = useState('');

  const [pickedEvent, setPickedEvent] = useState<DcStreamEvent | null>(null);
  const [pickedVenue, setPickedVenue] = useState<DcStreamVenue | null>(null);
  const [research, setResearch] = useState<SubjectResearchResult | null>(null);
  const [snippets, setSnippets] = useState<EditorialSnippet[]>([]);
  const [subjectPosts, setSubjectPosts] = useState<ContentCalendarPost[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [brief, setBrief] = useState<ResearchBrief | null>(null);
  const [editorGuidance, setEditorGuidance] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [generateProgress, setGenerateProgress] = useState<string | null>(null);

  const [posts, setPosts] = useState<ContentCalendarPost[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selected, setSelected] = useState<ContentCalendarPost | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editHashtags, setEditHashtags] = useState('');
  const [editSchedule, setEditSchedule] = useState('');
  const [editForum, setEditForum] = useState('');
  const [addDay, setAddDay] = useState<Date | null>(null);
  const [addPlatform, setAddPlatform] = useState<CalendarPlatform>('instagram');
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) }),
    [weekStart],
  );

  const loadStream = useCallback(async () => {
    setStreamLoading(true);
    try {
      const [ev, vn] = await Promise.all([listDcUpcomingEvents(250), listDcVenues(300)]);
      setEvents(ev);
      setVenues(vn);
    } catch (err) {
      toast({
        title: 'Failed to load DC stream',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setStreamLoading(false);
    }
  }, [toast]);

  const loadPosts = useCallback(async () => {
    try {
      setPosts(await listCalendarPosts({ status: 'all' }));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadStream();
    void loadPosts();
  }, [loadStream, loadPosts]);

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) =>
      [e.title, e.artists?.name, e.venues?.name, e.venue_city]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [events, query]);

  const filteredVenues = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return venues;
    return venues.filter((v) =>
      [v.name, v.city, v.state].filter(Boolean).some((x) => String(x).toLowerCase().includes(q)),
    );
  }, [venues, query]);

  const postsForDay = (day: Date) =>
    posts.filter((p) => p.scheduled_at && isSameDay(parseISO(p.scheduled_at), day));

  const hydrateSavedResearch = useCallback(
    async (input: { event_id?: string; venue_id?: string }) => {
      setResearch(null);
      setSnippets([]);
      setSubjectPosts([]);
      setBrief(null);
      setSelectedTopics([]);
      setEditorGuidance('');
      try {
        const saved = await findLatestSavedResearch(input);
        if (!saved) return false;
        const sj = (saved.subject.sentiment_json || {}) as Record<string, unknown>;
        const facets = (sj.facets || {}) as {
          artist?: string | null;
          venue?: string | null;
          event?: string | null;
        };
        const researchBrief = (sj.research_brief as ResearchBrief | undefined) || undefined;
        setResearch({
          run_id: saved.subject.run_id,
          subject_id: saved.subject.id,
          name: saved.subject.name,
          facets: {
            artist: facets.artist ?? null,
            venue: facets.venue ?? null,
            event: facets.event ?? null,
          },
          snippet_count: saved.snippets.length,
          sentiment_summary: saved.subject.sentiment_summary || '',
          research_brief: researchBrief,
          source_status: sj.source_status as SubjectResearchResult['source_status'],
        });
        setSnippets(saved.snippets);
        setSubjectPosts(saved.posts);
        if (researchBrief) setBrief(researchBrief);
        const guidance = typeof sj.editor_guidance === 'string' ? sj.editor_guidance : '';
        const topics = Array.isArray(sj.selected_topics)
          ? (sj.selected_topics as string[])
          : [];
        setEditorGuidance(guidance);
        setSelectedTopics(topics);
        return true;
      } catch (err) {
        toast({
          title: 'Could not load saved research',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
        return false;
      }
    },
    [toast],
  );

  const selectEvent = (e: DcStreamEvent) => {
    setPickedEvent(e);
    setPickedVenue(null);
    void hydrateSavedResearch({ event_id: e.id }).then((found) => {
      if (found) {
        toast({
          title: 'Saved research loaded',
          description: 'Previous run and drafts restored — re-research only if you need fresh sources.',
        });
      }
    });
  };

  const selectVenue = (v: DcStreamVenue) => {
    setPickedVenue(v);
    setPickedEvent(null);
    void hydrateSavedResearch({ venue_id: v.id }).then((found) => {
      if (found) {
        toast({
          title: 'Saved research loaded',
          description: 'Previous run and drafts restored — re-research only if you need fresh sources.',
        });
      }
    });
  };

  const onResearch = async () => {
    if (!pickedEvent && !pickedVenue) return;
    setBusy('research');
    try {
      const result = await researchSubject(
        pickedEvent ? { event_id: pickedEvent.id } : { venue_id: pickedVenue!.id },
      );
      setResearch(result);
      setSnippets(await listSnippetsForSubject(result.subject_id));
      setBrief(result.research_brief || null);
      setSelectedTopics([]);
      setEditorGuidance('');
      setBriefOpen(true);
      toast({
        title: 'Research ready',
        description: 'Review the brief and add direction before drafting.',
      });
    } catch (err) {
      toast({
        title: 'Research failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic],
    );
  };

  const onGenerate = async () => {
    if (!research?.subject_id) return;
    setBusy('generate');
    setBriefOpen(false);
    let created = 0;
    const warnings: string[] = [];
    try {
      for (const platform of DRAFT_PLATFORMS) {
        setGenerateProgress(`Drafting ${platform} (5 revision rounds)…`);
        try {
          const result = await generateDraftsForSubject(research.subject_id, {
            platforms: [platform],
            editorGuidance: editorGuidance.trim() || undefined,
            selectedTopics,
          });
          created += result.posts_created || 0;
          if (result.warnings?.length) warnings.push(...result.warnings);
        } catch (err) {
          warnings.push(
            `${platform}: ${err instanceof Error ? err.message : 'failed'}`,
          );
        }
      }
      toast({
        title: created ? 'Drafts created' : 'No drafts saved',
        description: created
          ? `${created} posts in pending_review.${warnings.length ? ` Notes: ${warnings.slice(0, 2).join('; ')}` : ''}`
          : warnings.slice(0, 3).join('; ') || 'All platforms failed lint or timed out.',
        variant: created ? 'default' : 'destructive',
      });
      const rows = await listCalendarPosts({ subjectId: research.subject_id });
      setSubjectPosts(rows);
      await loadPosts();
    } finally {
      setGenerateProgress(null);
      setBusy(null);
    }
  };

  const openPost = async (post: ContentCalendarPost) => {
    setSelected(post);
    setEditTitle(post.title ?? '');
    setEditBody(post.body ?? '');
    setEditHashtags((post.hashtags ?? []).join(', '));
    setEditSchedule(
      post.scheduled_at ? format(parseISO(post.scheduled_at), "yyyy-MM-dd'T'HH:mm") : '',
    );
    setEditForum(post.target_forum ?? '');
  };

  const saveEdits = async () => {
    if (!selected) return;
    setBusy('save');
    try {
      const hashtags = editHashtags
        .split(',')
        .map((h) => h.trim().replace(/^#/, ''))
        .filter(Boolean);
      const updated = await updateCalendarPost(selected.id, {
        title: editTitle || null,
        body: editBody,
        hashtags,
        target_forum: editForum || null,
        scheduled_at: editSchedule ? new Date(editSchedule).toISOString() : null,
      });
      setSelected(updated);
      toast({ title: 'Post saved' });
      await loadPosts();
      if (research?.subject_id) {
        setSubjectPosts(await listCalendarPosts({ subjectId: research.subject_id }));
      }
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const onApprove = async () => {
    if (!selected || !user?.id) return;
    setBusy('approve');
    try {
      const updated = await approvePost(selected.id, user.id);
      setSelected(updated);
      toast({ title: 'Approved and scheduled' });
      await loadPosts();
    } catch (err) {
      toast({
        title: 'Approve failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const onReject = async () => {
    if (!selected) return;
    setBusy('reject');
    try {
      setSelected(await rejectPost(selected.id));
      toast({ title: 'Post rejected' });
      await loadPosts();
    } catch (err) {
      toast({
        title: 'Reject failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const onDeletePost = async (postId?: string) => {
    const id = postId || selected?.id;
    if (!id) return;
    if (!window.confirm('Delete this calendar post permanently?')) return;
    setBusy('delete');
    try {
      await deleteCalendarPost(id);
      if (selected?.id === id) setSelected(null);
      toast({ title: 'Post deleted' });
      await loadPosts();
      if (research?.subject_id) {
        setSubjectPosts(await listCalendarPosts({ subjectId: research.subject_id }));
      }
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const onMovePost = async (postId: string, day: Date, preserveTimeIso?: string | null) => {
    const base = preserveTimeIso ? parseISO(preserveTimeIso) : setMinutes(setHours(day, 10), 0);
    const next = new Date(day);
    next.setHours(base.getHours(), base.getMinutes(), 0, 0);
    setBusy('move');
    try {
      const updated = await moveCalendarPost(postId, next.toISOString());
      if (selected?.id === postId) {
        setSelected(updated);
        setEditSchedule(format(next, "yyyy-MM-dd'T'HH:mm"));
      }
      await loadPosts();
    } catch (err) {
      toast({
        title: 'Move failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
      setDraggingId(null);
    }
  };

  const onCreateManualDraft = async () => {
    if (!addDay) return;
    setBusy('add');
    try {
      const scheduled = setMinutes(setHours(addDay, 10), 0);
      const created = await createManualCalendarPost({
        platform: addPlatform,
        title: 'Untitled draft',
        body: '',
        scheduled_at: scheduled.toISOString(),
        subject_id: research?.subject_id ?? null,
        run_id: research?.run_id ?? null,
        created_by: user?.id ?? null,
        status: 'draft',
      });
      setAddDay(null);
      await loadPosts();
      if (research?.subject_id) {
        setSubjectPosts(await listCalendarPosts({ subjectId: research.subject_id }));
      }
      toast({ title: 'Draft added to calendar' });
      await openPost(created);
    } catch (err) {
      toast({
        title: 'Could not add draft',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const onPublishNow = async () => {
    if (!selected) return;
    setBusy('publish');
    try {
      if (selected.platform === 'instagram') {
        const result = await publishPostNow(selected.id, { force: true });
        toast({
          title: 'Instagram publish',
          description:
            result?.action === 'published' ? `Posted ${result.external_post_id}` : JSON.stringify(result),
        });
      } else {
        await markPublishedManually(selected.id);
        toast({ title: 'Marked published (manual platform)' });
      }
      setSelected(null);
      await loadPosts();
    } catch (err) {
      toast({
        title: 'Publish failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const copyBody = async () => {
    if (!selected) return;
    const tags = (selected.hashtags ?? []).map((h) => `#${h}`).join(' ');
    await navigator.clipboard.writeText(
      [selected.title, selected.body, tags, selected.target_forum].filter(Boolean).join('\n\n'),
    );
    toast({ title: 'Copied to clipboard' });
  };

  const facets = research?.facets;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Editorial</p>
          <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <CalendarDays className="h-6 w-6" />
            Content Calendar
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Browse DC venues and upcoming shows within 50 miles of downtown (lat/long). Pick one,
            research with venue/event/artist context, review the AI brief, then draft.
            then draft copy for review before anything publishes.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void dispatchDuePosts()}
          disabled={!!busy}
        >
          <Send className="h-4 w-4 mr-2" />
          Publish due IG
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Card className="xl:col-span-5 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={streamKind === 'events' ? 'default' : 'outline'}
                onClick={() => setStreamKind('events')}
              >
                <Music2 className="h-4 w-4 mr-1" />
                Events ({filteredEvents.length})
              </Button>
              <Button
                size="sm"
                variant={streamKind === 'venues' ? 'default' : 'outline'}
                onClick={() => setStreamKind('venues')}
              >
                <MapPin className="h-4 w-4 mr-1" />
                Venues ({filteredVenues.length})
              </Button>
            </div>
            <div className="relative mt-3">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Filter DMV venues / events (50 mi)…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="max-h-[560px] overflow-y-auto space-y-2 pr-2">
            {streamLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading DC stream…
              </div>
            ) : streamKind === 'events' ? (
              filteredEvents.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => selectEvent(e)}
                  className={`w-full text-left rounded-lg border p-3 hover:bg-muted/50 ${
                    pickedEvent?.id === e.id ? 'border-pink-500 bg-pink-50/70' : ''
                  }`}
                >
                  <div className="font-medium truncate">
                    {e.artists?.name || e.title}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {e.venues?.name || 'Venue TBD'} · {e.venue_city || e.venues?.city || 'DC'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {format(parseISO(e.event_date), 'MMM d, yyyy · h:mm a')}
                  </div>
                </button>
              ))
            ) : (
              filteredVenues.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => selectVenue(v)}
                  className={`w-full text-left rounded-lg border p-3 hover:bg-muted/50 ${
                    pickedVenue?.id === v.id ? 'border-pink-500 bg-pink-50/70' : ''
                  }`}
                >
                  <div className="font-medium truncate">{v.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[v.city, v.state].filter(Boolean).join(', ') || 'DC metro'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {v.num_upcoming_events ?? 0} upcoming
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-7 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              {pickedEvent
                ? `${pickedEvent.artists?.name || pickedEvent.title} at ${pickedEvent.venues?.name || 'venue'}`
                : pickedVenue
                  ? pickedVenue.name
                  : 'Select a subject'}
            </CardTitle>
            <CardDescription>
              Research uses venue, event, and artist joins within 50 miles of DC. Review the AI
              brief and add direction before drafting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!pickedEvent && !pickedVenue ? (
              <p className="text-sm text-muted-foreground py-10 text-center">
                Choose an upcoming DC event or venue from the stream.
              </p>
            ) : (
              <>
                {pickedEvent && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">Artist</div>
                      <div className="font-medium">{pickedEvent.artists?.name || 'Unknown'}</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">Event</div>
                      <div className="font-medium">{pickedEvent.title}</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">Venue</div>
                      <div className="font-medium">{pickedEvent.venues?.name || 'Unknown'}</div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void onResearch()} disabled={!!busy}>
                    {busy === 'research' ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4 mr-2" />
                    )}
                    {research?.subject_id ? 'Re-run research' : 'Run research'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (brief || research?.research_brief) {
                        setBrief(brief || research!.research_brief!);
                        setBriefOpen(true);
                      } else {
                        void onGenerate();
                      }
                    }}
                    disabled={!!busy || !research?.subject_id}
                  >
                    {busy === 'generate' ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    {generateProgress || 'Review brief & draft'}
                  </Button>
                </div>

                {research && (
                  <Alert>
                    <AlertTitle className="flex items-center gap-2 flex-wrap">
                      {research.name}
                      <Badge variant="outline">saved</Badge>
                    </AlertTitle>
                    <AlertDescription className="space-y-2">
                      <div>
                        {[
                          facets?.artist && `Artist: ${facets.artist}`,
                          facets?.event && `Event: ${facets.event}`,
                          facets?.venue && `Venue: ${facets.venue}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      <div>{research.sentiment_summary}</div>
                      <div className="text-xs">{research.snippet_count} source snippets</div>
                    </AlertDescription>
                  </Alert>
                )}

                {research?.source_status && research.source_status.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Source adapters</p>
                    <div className="max-h-48 overflow-y-auto rounded border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr className="text-left">
                            <th className="p-2 font-medium">Source</th>
                            <th className="p-2 font-medium">Status</th>
                            <th className="p-2 font-medium text-right">Results</th>
                          </tr>
                        </thead>
                        <tbody>
                          {research.source_status.map((row) => (
                            <tr key={row.source} className="border-t">
                              <td className="p-2">
                                <div className="font-medium">{row.name}</div>
                                <div className="text-muted-foreground">{row.kind}</div>
                              </td>
                              <td className="p-2">
                                <Badge
                                  variant={
                                    row.status === 'ok'
                                      ? 'default'
                                      : row.status === 'error'
                                        ? 'destructive'
                                        : 'outline'
                                  }
                                >
                                  {row.status}
                                </Badge>
                                {row.env_missing?.length ? (
                                  <div className="text-muted-foreground mt-1">
                                    missing {row.env_missing.join(', ')}
                                  </div>
                                ) : null}
                                {row.error ? (
                                  <div className="text-destructive mt-1 line-clamp-2">{row.error}</div>
                                ) : null}
                              </td>
                              <td className="p-2 text-right tabular-nums">{row.result_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {snippets.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Sources</p>
                    <div className="max-h-36 overflow-y-auto space-y-1 text-xs text-muted-foreground">
                      {snippets.slice(0, 10).map((s) => (
                        <div key={s.id} className="border rounded p-2">
                          <span className="font-medium">{s.platform}</span>
                          {s.url ? (
                            <>
                              {' · '}
                              <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                                link
                              </a>
                            </>
                          ) : null}
                          <div>{s.excerpt}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {subjectPosts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Drafts for this subject</p>
                    {subjectPosts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => void openPost(p)}
                        className="w-full flex items-center gap-2 rounded-lg border p-3 text-left hover:bg-muted/40"
                      >
                        <Badge variant="outline">{p.platform}</Badge>
                        <div className="flex-1 min-w-0 truncate text-sm">
                          {p.title || p.body.slice(0, 60)}
                        </div>
                        <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 justify-between flex-wrap">
        <p className="text-xs text-muted-foreground">
          Drag posts between days to reschedule. Use + to add a blank draft.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart((d) => addDays(d, -7))}>
            Prev week
          </Button>
          <span className="text-sm text-muted-foreground">
            {format(weekStart, 'MMM d')} to {format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'MMM d')}
          </span>
          <Button variant="outline" size="sm" onClick={() => setWeekStart((d) => addDays(d, 7))}>
            Next week
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
        {weekDays.map((day) => (
          <Card
            key={day.toISOString()}
            className="min-h-[280px] shadow-sm transition-colors data-[drop=true]:ring-2 data-[drop=true]:ring-primary/40"
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.dataset.drop = 'true';
            }}
            onDragLeave={(e) => {
              e.currentTarget.dataset.drop = 'false';
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.dataset.drop = 'false';
              const postId = e.dataTransfer.getData('text/post-id') || draggingId;
              const prior = e.dataTransfer.getData('text/scheduled-at') || null;
              if (postId) void onMovePost(postId, day, prior);
            }}
          >
            <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {format(day, 'EEE M/d')}
              </CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="Add draft"
                onClick={() => {
                  setAddPlatform('instagram');
                  setAddDay(day);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="p-2 pt-0 space-y-1.5 min-h-[220px]">
              {postsForDay(day).map((p) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggingId(p.id);
                    e.dataTransfer.setData('text/post-id', p.id);
                    e.dataTransfer.setData('text/scheduled-at', p.scheduled_at || '');
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  className="group relative rounded-md border bg-background hover:bg-muted/60"
                >
                  <button
                    type="button"
                    onClick={() => void openPost(p)}
                    className="w-full text-left px-2 py-2 text-xs"
                  >
                    <div className="font-medium truncate pr-5">{p.platform}</div>
                    <div className="truncate text-muted-foreground mt-0.5">
                      {p.title || p.body?.slice(0, 40) || 'Empty draft'}
                    </div>
                    <Badge variant={statusVariant(p.status)} className="mt-1 text-[10px]">
                      {p.status}
                    </Badge>
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onDeletePost(p.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {postsForDay(day).length === 0 && (
                <p className="text-[11px] text-muted-foreground px-1 pt-2">Drop posts here</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selected.platform} · {selected.format}
                  <Badge variant={statusVariant(selected.status)}>{selected.status}</Badge>
                </DialogTitle>
                <DialogDescription>
                  {selected.editorial_subjects?.name ?? 'Editorial post'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Title</label>
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Final body (public)</label>
                  <Textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={10}
                    className="font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Notes, scores, and Sources live below. They must never appear in this field.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Hashtags</label>
                    <Input value={editHashtags} onChange={(e) => setEditHashtags(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Schedule</label>
                    <Input
                      type="datetime-local"
                      value={editSchedule}
                      onChange={(e) => setEditSchedule(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Target forum</label>
                  <Input value={editForum} onChange={(e) => setEditForum(e.target.value)} />
                </div>

                {selected.editorial_meta && (
                  <div className="rounded-lg border p-3 space-y-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">Editorial review (metadata only)</span>
                      {typeof selected.editorial_meta.score === 'number' && (
                        <Badge variant="outline">
                          Score {selected.editorial_meta.score}
                          {selected.editorial_meta.score_verdict
                            ? ` · ${selected.editorial_meta.score_verdict}`
                            : ''}
                        </Badge>
                      )}
                      {selected.editorial_meta.revision_rounds_completed ? (
                        <Badge variant="secondary">
                          {selected.editorial_meta.revision_rounds_completed} revision rounds
                        </Badge>
                      ) : null}
                    </div>

                    {selected.editorial_meta.revision_history &&
                      selected.editorial_meta.revision_history.length > 0 && (
                        <div className="space-y-2">
                          <p className="font-medium">Revision history</p>
                          <div className="max-h-64 overflow-y-auto space-y-2">
                            {selected.editorial_meta.initial_body ? (
                              <details className="rounded border p-2 text-xs">
                                <summary className="cursor-pointer font-medium">Initial draft</summary>
                                <pre className="mt-2 whitespace-pre-wrap text-muted-foreground">
                                  {selected.editorial_meta.initial_body}
                                </pre>
                              </details>
                            ) : null}
                            {selected.editorial_meta.revision_history.map((round) => (
                              <details key={round.round} className="rounded border p-2 text-xs">
                                <summary className="cursor-pointer font-medium flex items-center gap-2">
                                  {round.label}
                                  <Badge variant={round.changed ? 'default' : 'outline'} className="text-[10px]">
                                    {round.changed ? 'rewrote' : 'approved'}
                                  </Badge>
                                </summary>
                                <pre className="mt-2 whitespace-pre-wrap">{round.body}</pre>
                                {round.editor_notes?.length ? (
                                  <ul className="mt-2 list-disc pl-4 text-muted-foreground">
                                    {round.editor_notes.map((n) => (
                                      <li key={n}>{n}</li>
                                    ))}
                                  </ul>
                                ) : null}
                                {round.scorecard && Object.keys(round.scorecard).length > 0 ? (
                                  <div className="mt-2 text-muted-foreground">
                                    Scorecard:{' '}
                                    {Object.entries(round.scorecard)
                                      .map(([k, v]) => `${k}=${v}`)
                                      .join(', ')}
                                  </div>
                                ) : null}
                              </details>
                            ))}
                          </div>
                        </div>
                      )}

                    {selected.editorial_meta.alt_text ? (
                      <div className="text-muted-foreground">
                        Alt text: {selected.editorial_meta.alt_text}
                      </div>
                    ) : null}
                    {selected.editorial_meta.cta ? (
                      <div className="text-muted-foreground">CTA: {selected.editorial_meta.cta}</div>
                    ) : null}
                    {selected.editorial_meta.source_urls &&
                      selected.editorial_meta.source_urls.length > 0 && (
                        <div>
                          <p className="font-medium mb-1">Sources (metadata)</p>
                          <ul className="space-y-1 text-xs">
                            {selected.editorial_meta.source_urls.map((url) => (
                              <li key={url}>
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline break-all"
                                >
                                  {url}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    {selected.editorial_meta.claims_used &&
                      selected.editorial_meta.claims_used.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Claims used: {selected.editorial_meta.claims_used.join(', ')}
                        </div>
                      )}
                    {selected.editorial_meta.editor_notes &&
                      selected.editorial_meta.editor_notes.length > 0 && (
                        <div className="text-xs">
                          <p className="font-medium">Editor notes</p>
                          <ul className="list-disc pl-4">
                            {selected.editorial_meta.editor_notes.map((n) => (
                              <li key={n}>{n}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    {selected.editorial_meta.risk_flags &&
                      selected.editorial_meta.risk_flags.length > 0 && (
                        <div className="text-xs text-amber-700 dark:text-amber-400">
                          Flags: {selected.editorial_meta.risk_flags.join(' · ')}
                        </div>
                      )}
                  </div>
                )}
              </div>

              <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => void copyBody()}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void saveEdits()} disabled={!!busy}>
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void onDeletePost()}
                    disabled={!!busy}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="destructive" onClick={() => void onReject()} disabled={!!busy}>
                    <X className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button type="button" onClick={() => void onApprove()} disabled={!!busy}>
                    <Check className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => void onPublishNow()} disabled={!!busy}>
                    <Send className="h-4 w-4 mr-2" />
                    {selected.platform === 'instagram' ? 'Publish now' : 'Mark published'}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!addDay} onOpenChange={(open) => !open && setAddDay(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add draft</DialogTitle>
            <DialogDescription>
              {addDay ? `Blank ${format(addDay, 'EEE MMM d')} post — edit anytime.` : 'Choose a platform'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Platform</label>
            <Select value={addPlatform} onValueChange={(v) => setAddPlatform(v as CalendarPlatform)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DRAFT_PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddDay(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void onCreateManualDraft()} disabled={!!busy}>
              {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Add draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={briefOpen} onOpenChange={setBriefOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Research brief · {research?.name}</DialogTitle>
            <DialogDescription>
              Review highlights and topics, then tell Synth what to emphasize before drafting.
              Posts stay in pending_review until you approve.
            </DialogDescription>
          </DialogHeader>

          {brief && (
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-medium mb-1">Summary</p>
                <p className="text-muted-foreground whitespace-pre-wrap">{brief.summary}</p>
              </div>

              {brief.highlights?.length > 0 && (
                <div>
                  <p className="font-medium mb-1">Highlights</p>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    {brief.highlights.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </div>
              )}

              {brief.article_topics?.length > 0 && (
                <div>
                  <p className="font-medium mb-2">Possible article topics (select any)</p>
                  <div className="flex flex-wrap gap-2">
                    {brief.article_topics.map((topic) => {
                      const on = selectedTopics.includes(topic);
                      return (
                        <Button
                          key={topic}
                          type="button"
                          size="sm"
                          variant={on ? 'default' : 'outline'}
                          onClick={() => toggleTopic(topic)}
                        >
                          {topic}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {brief.interesting_snippets?.length > 0 && (
                <div>
                  <p className="font-medium mb-2">Interesting snippets</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {brief.interesting_snippets.map((s, i) => (
                      <div key={`${s.url}-${i}`} className="rounded border p-2 text-xs">
                        <div className="font-medium">
                          {s.source}
                          {s.title ? ` · ${s.title}` : ''}
                        </div>
                        <p className="text-muted-foreground mt-1">{s.excerpt}</p>
                        {s.url ? (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline break-all"
                          >
                            {s.url}
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {brief.related_events?.length > 0 && (
                <div>
                  <p className="font-medium mb-1">Related upcoming events</p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {brief.related_events.map((e) => (
                      <li key={e.id}>
                        {e.title}
                        {e.event_date ? ` · ${e.event_date.slice(0, 10)}` : ''}
                        {e.artist_name ? ` · ${e.artist_name}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {brief.caveats?.length > 0 && (
                <div className="text-xs text-amber-700 dark:text-amber-400">
                  {brief.caveats.join(' · ')}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-sm font-medium">
                  {brief.editor_prompt || 'Editor direction before drafting'}
                </label>
                <Textarea
                  value={editorGuidance}
                  onChange={(e) => setEditorGuidance(e.target.value)}
                  rows={4}
                  placeholder="e.g. Focus on Hall of Records and Passion Pit this week. No sentiment counts. Ask about first shows."
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setBriefOpen(false)}>
              Close
            </Button>
            <Button type="button" onClick={() => void onGenerate()} disabled={!!busy || !research}>
              {busy === 'generate' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Draft all platforms
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
