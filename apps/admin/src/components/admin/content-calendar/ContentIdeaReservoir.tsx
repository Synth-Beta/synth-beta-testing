import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  Layers,
  Lightbulb,
  Search,
  User,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

import {
  CHANNEL_BUCKETS,
  CONTENT_IDEAS,
  UMBRELLA_ANGLES,
  channelLabel,
  getAngle,
  getBucket,
  ideasForAngleAndBucket,
  type ChannelBucketId,
  type ContentIdea,
  type ReservoirChannel,
} from './ideaReservoirData';

type Level = 1 | 2 | 3;

export default function ContentIdeaReservoir() {
  const { toast } = useToast();
  const [level, setLevel] = useState<Level>(1);
  const [angleId, setAngleId] = useState<string | null>(null);
  const [bucketId, setBucketId] = useState<ChannelBucketId | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<ContentIdea | null>(null);
  const [query, setQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<ReservoirChannel | 'all'>('all');

  const angle = angleId ? getAngle(angleId) : undefined;
  const bucket = bucketId ? getBucket(bucketId) : undefined;

  const level2Counts = useMemo(() => {
    if (!angleId) return {};
    const counts: Record<string, number> = {};
    for (const b of CHANNEL_BUCKETS) {
      counts[b.id] = ideasForAngleAndBucket(angleId, b.id).length;
    }
    return counts;
  }, [angleId]);

  const level3Ideas = useMemo(() => {
    if (!angleId || !bucketId) return [];
    let rows = ideasForAngleAndBucket(angleId, bucketId);
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter((i) =>
        [i.title, i.hook, i.copy, i.person, i.tags.join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(q),
      );
    }
    if (channelFilter !== 'all') {
      rows = rows.filter((i) => i.channel === channelFilter);
    }
    return rows;
  }, [angleId, bucketId, query, channelFilter]);

  const goAngle = (id: string) => {
    setAngleId(id);
    setBucketId(null);
    setSelectedIdea(null);
    setLevel(2);
    setQuery('');
    setChannelFilter('all');
  };

  const goBucket = (id: ChannelBucketId) => {
    setBucketId(id);
    setSelectedIdea(null);
    setLevel(3);
    setQuery('');
    setChannelFilter('all');
  };

  const back = () => {
    if (level === 3) {
      setSelectedIdea(null);
      setBucketId(null);
      setLevel(2);
      return;
    }
    if (level === 2) {
      setAngleId(null);
      setLevel(1);
    }
  };

  const copyIdea = async (idea: ContentIdea) => {
    const text = [
      idea.title,
      '',
      `Angle: ${getAngle(idea.angleId)?.title ?? idea.angleId}`,
      `Channel: ${channelLabel(idea.channel)}`,
      `Person: ${idea.person}`,
      `Format: ${idea.format}`,
      '',
      idea.hook,
      '',
      idea.copy,
      '',
      idea.cta ? `CTA: ${idea.cta}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    await navigator.clipboard.writeText(text);
    toast({ title: 'Idea copied', description: idea.title });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
            Content planner
          </p>
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Idea reservoir
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Three levels: umbrella thought-leadership angles → distribution channel buckets
            (LinkedIn B2B, IG/TikTok short-form, Substack long-form) → specific ideas with angle,
            channel, person, and draft copy. {CONTENT_IDEAS.length} ideas across{' '}
            {UMBRELLA_ANGLES.length} angles.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant={level === 1 ? 'default' : 'outline'}>1 · Angles</Badge>
          <Badge variant={level === 2 ? 'default' : 'outline'}>2 · Channels</Badge>
          <Badge variant={level === 3 ? 'default' : 'outline'}>3 · Ideas</Badge>
        </div>
      </div>

      {level > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button type="button" variant="ghost" size="sm" onClick={back}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <span className="text-muted-foreground">/</span>
          <button
            type="button"
            className="font-medium text-pink-700 hover:underline"
            onClick={() => {
              setLevel(1);
              setAngleId(null);
              setBucketId(null);
              setSelectedIdea(null);
            }}
          >
            All angles
          </button>
          {angle && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <button
                type="button"
                className="font-medium hover:underline"
                onClick={() => {
                  setLevel(2);
                  setBucketId(null);
                  setSelectedIdea(null);
                }}
              >
                {angle.title}
              </button>
            </>
          )}
          {bucket && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">{bucket.shortLabel}</span>
            </>
          )}
        </div>
      )}

      {level === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {UMBRELLA_ANGLES.map((a) => {
            const count = CONTENT_IDEAS.filter((i) => i.angleId === a.id).length;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => goAngle(a.id)}
                className="text-left rounded-xl border bg-white p-4 shadow-sm hover:border-pink-400 hover:bg-pink-50/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-pink-600 shrink-0 mt-0.5" />
                    <h4 className="font-semibold text-gray-900">{a.title}</h4>
                  </div>
                  <Badge variant="secondary">{count}</Badge>
                </div>
                <p className="mt-2 text-sm text-gray-600 line-clamp-3">{a.thesis}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {a.audience}
                  </Badge>
                  {a.keywords.slice(0, 3).map((k) => (
                    <Badge key={k} variant="outline" className="text-[10px]">
                      {k}
                    </Badge>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {level === 2 && angle && (
        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{angle.title}</CardTitle>
              <CardDescription>{angle.whyItMatters}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                <span className="font-medium text-foreground">Thesis — </span>
                {angle.thesis}
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {CHANNEL_BUCKETS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => goBucket(b.id)}
                className="text-left rounded-xl border bg-white p-5 shadow-sm hover:border-pink-400 hover:bg-pink-50/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold text-gray-900">{b.label}</h4>
                  <Badge>{level2Counts[b.id] ?? 0}</Badge>
                </div>
                <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
                  {b.platforms.map(channelLabel).join(' · ')}
                </p>
                <p className="mt-3 text-sm text-gray-600">
                  <span className="font-medium text-gray-900">Audience — </span>
                  {b.audience}
                </p>
                <p className="mt-2 text-sm text-gray-600">
                  <span className="font-medium text-gray-900">Job — </span>
                  {b.job}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{b.formatNotes}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {level === 3 && angle && bucket && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-5 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Filter ideas…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {(['all', ...(bucket.platforms as ReservoirChannel[])] as const).map((c) => (
                  <Button
                    key={c}
                    type="button"
                    size="sm"
                    variant={channelFilter === c ? 'default' : 'outline'}
                    onClick={() => setChannelFilter(c)}
                  >
                    {c === 'all' ? 'All' : channelLabel(c)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="max-h-[640px] overflow-y-auto space-y-2 pr-1">
              {level3Ideas.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">
                  No ideas match this filter.
                </p>
              ) : (
                level3Ideas.map((idea) => (
                  <button
                    key={idea.id}
                    type="button"
                    onClick={() => setSelectedIdea(idea)}
                    className={`w-full text-left rounded-lg border p-3 hover:bg-muted/50 ${
                      selectedIdea?.id === idea.id ? 'border-pink-500 bg-pink-50/70' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-sm leading-snug">{idea.title}</div>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {channelLabel(idea.channel)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{idea.hook}</p>
                    <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      {idea.person}
                      <span className="mx-1">·</span>
                      {idea.format}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <Card className="xl:col-span-7 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">
                {selectedIdea ? selectedIdea.title : 'Select an idea'}
              </CardTitle>
              <CardDescription>
                {selectedIdea
                  ? `${channelLabel(selectedIdea.channel)} · ${selectedIdea.person} · ${selectedIdea.format}`
                  : 'Level 3 includes angle, channel, person, hook, draft copy, and CTA.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedIdea ? (
                <p className="text-sm text-muted-foreground py-16 text-center">
                  Pick an idea from the list to view full copy.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge>{getAngle(selectedIdea.angleId)?.title}</Badge>
                    <Badge variant="secondary">{channelLabel(selectedIdea.channel)}</Badge>
                    <Badge variant="outline">{selectedIdea.person}</Badge>
                    {selectedIdea.tags.map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Hook
                    </p>
                    <p className="text-sm mt-1 font-medium">{selectedIdea.hook}</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Draft copy
                    </p>
                    <pre className="mt-1 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed font-sans">
                      {selectedIdea.copy}
                    </pre>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      CTA
                    </p>
                    <p className="text-sm mt-1">{selectedIdea.cta}</p>
                  </div>

                  <Button type="button" onClick={() => void copyIdea(selectedIdea)}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy full idea
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
