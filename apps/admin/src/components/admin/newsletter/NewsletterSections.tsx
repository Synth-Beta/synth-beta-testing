import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, Loader2, RefreshCw, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { generateDraftsFromSource } from "@/lib/newsletterEdition/gather";
import {
  aggregateNewsletterSections,
  draftContainsSection,
  regenerableDraft,
  type NewsletterSectionCatalogItem,
  type NewsletterSectionReviewStatus,
} from "@/lib/newsletterEdition/sections";
import { centralCalendarDate } from "@/lib/newsletterEdition/time";
import {
  listContentVetoes,
  listNewsletterDrafts,
  listSectionStatuses,
  loadNewsletterSource,
  NewsletterDraftRow,
  saveNewsletterDrafts,
  setSectionStatus,
} from "@/services/newsletterSendService";

type StatusFilter = NewsletterSectionReviewStatus | "all";

const EDITION_WINDOW_DAYS = 21;

const shiftIso = (iso: string, days: number) => {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

const newestEdition = (lists: Array<{ date: string; rows: NewsletterDraftRow[] }>) =>
  lists.reduce<{ date: string; rows: NewsletterDraftRow[] } | null>((best, item) => {
    if (!item.rows.length) return best;
    const stamp = item.rows.reduce((max, row) => (row.retrieved_at > max ? row.retrieved_at : max), "");
    if (!best) return item;
    const bestStamp = best.rows.reduce((max, row) => (row.retrieved_at > max ? row.retrieved_at : max), "");
    if (stamp > bestStamp || (stamp === bestStamp && item.date > best.date)) return item;
    return best;
  }, null);

const statusLabel = (status: NewsletterSectionReviewStatus) => {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Pending";
};

export default function NewsletterSections() {
  const { toast } = useToast();
  const [editionDate, setEditionDate] = useState(() => centralCalendarDate(new Date()));
  const [drafts, setDrafts] = useState<NewsletterDraftRow[]>([]);
  const [statusByKey, setStatusByKey] = useState<Map<string, NewsletterSectionReviewStatus>>(new Map());
  const [vetoedKeys, setVetoedKeys] = useState<Set<string>>(new Set());
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const editionRef = useRef(editionDate);
  editionRef.current = editionDate;
  const viewToken = useRef(0);

  const loadMeta = useCallback(async () => {
    const [statuses, vetoes] = await Promise.all([listSectionStatuses(), listContentVetoes()]);
    const nextStatus = new Map<string, NewsletterSectionReviewStatus>();
    for (const row of statuses) {
      if (row.status === "pending" || row.status === "approved" || row.status === "rejected") {
        nextStatus.set(row.content_key, row.status);
      }
    }
    const nextVetoes = new Set(
      vetoes.filter((row) => row.scope === "global").map((row) => row.content_key),
    );
    setStatusByKey(nextStatus);
    setVetoedKeys(nextVetoes);
    return { nextStatus, nextVetoes };
  }, []);

  const showDrafts = useCallback((date: string, rows: NewsletterDraftRow[]) => {
    editionRef.current = date;
    setEditionDate(date);
    setDrafts([...rows].sort((left, right) => left.email.localeCompare(right.email)));
  }, []);

  const load = useCallback(async (date = editionRef.current) => {
    setListLoading(true);
    setListError(null);
    try {
      const [rows] = await Promise.all([listNewsletterDrafts(date), loadMeta()]);
      showDrafts(date, rows);
      return rows;
    } catch (error: unknown) {
      setDrafts([]);
      setListError(error instanceof Error ? error.message : "Unable to load sections.");
      return [];
    } finally {
      setListLoading(false);
    }
  }, [loadMeta, showDrafts]);

  useEffect(() => {
    const token = ++viewToken.current;
    const today = centralCalendarDate(new Date());
    setListLoading(true);
    void (async () => {
      try {
        await loadMeta();
        const dates = Array.from({ length: EDITION_WINDOW_DAYS }, (_, index) => shiftIso(today, index));
        const lists = await Promise.all(dates.map(async (date) => ({
          date,
          rows: await listNewsletterDrafts(date).catch(() => [] as NewsletterDraftRow[]),
        })));
        if (token !== viewToken.current) return;
        const newest = newestEdition(lists);
        showDrafts(newest?.date ?? today, newest?.rows ?? []);
      } catch (error: unknown) {
        if (token !== viewToken.current) return;
        setListError(error instanceof Error ? error.message : "Unable to load sections.");
      } finally {
        if (token === viewToken.current) setListLoading(false);
      }
    })();
  }, [loadMeta, showDrafts]);

  const sections = useMemo(
    () => aggregateNewsletterSections(drafts, statusByKey, vetoedKeys),
    [drafts, statusByKey, vetoedKeys],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sections.filter((section) => {
      if (statusFilter !== "all" && section.status !== statusFilter) return false;
      if (!needle) return true;
      return [section.label, section.kind, section.url, ...section.emails]
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [query, sections, statusFilter]);

  useEffect(() => {
    if (!selectedKey || !filtered.some((section) => section.contentKey === selectedKey)) {
      setSelectedKey(filtered[0]?.contentKey ?? null);
    }
  }, [filtered, selectedKey]);

  const selected = sections.find((section) => section.contentKey === selectedKey) ?? null;
  const counts = useMemo(() => ({
    pending: sections.filter((section) => section.status === "pending").length,
    approved: sections.filter((section) => section.status === "approved").length,
    rejected: sections.filter((section) => section.status === "rejected").length,
  }), [sections]);

  const moveSection = async (
    section: NewsletterSectionCatalogItem,
    status: NewsletterSectionReviewStatus,
    options: { applyVeto?: boolean; toastTitle?: string; toastDescription?: string } = {},
  ) => {
    const view = ++viewToken.current;
    setBusyKey(`${section.contentKey}:${status}`);
    setActionError(null);
    try {
      await setSectionStatus({
        contentKeys: section.contentKeys,
        kind: section.kind,
        label: section.label,
        status,
        applyVeto: options.applyVeto === true,
      });
      if (view !== viewToken.current) return;
      await loadMeta();
      toast({
        title: options.toastTitle ?? "Section updated",
        description: options.toastDescription ?? `Moved to ${statusLabel(status)}.`,
      });
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Could not update section.");
      toast({
        title: "Could not update section",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
      setProgress("");
    }
  };

  const refreshSection = async (section: NewsletterSectionCatalogItem) => {
    const view = ++viewToken.current;
    setBusyKey(`${section.contentKey}:refresh`);
    setActionError(null);
    setProgress("Banning this section and finding every newsletter that featured it…");
    try {
      await setSectionStatus({
        contentKeys: section.contentKeys,
        kind: section.kind,
        label: section.label,
        status: "rejected",
        applyVeto: true,
      });

      const targets = drafts
        .filter((draft) => regenerableDraft(draft) && draftContainsSection(draft, section.contentKeys))
        .map((draft) => draft.user_id);
      const uniqueTargets = [...new Set(targets)];
      if (!uniqueTargets.length) {
        await loadMeta();
        toast({
          title: "Section rejected",
          description: "Banned everywhere. No unsent drafts still featured it.",
        });
        return;
      }

      setProgress(`Loading recipient data to replace this section for ${uniqueTargets.length} newsletter${uniqueTargets.length === 1 ? "" : "s"}…`);
      const sourcePayload = await loadNewsletterSource();
      setProgress(`Rebuilding only the affected section for ${uniqueTargets.length} reader${uniqueTargets.length === 1 ? "" : "s"}…`);
      const generated = await generateDraftsFromSource(sourcePayload, new Date(), editionDate, {
        userIds: uniqueTargets,
      });
      if (!generated.drafts.length) throw new Error("No replacement drafts were built.");

      let replaced = 0;
      for (let index = 0; index < generated.drafts.length; index += 5) {
        setProgress(`Saving ${index + 1}–${Math.min(index + 5, generated.drafts.length)} of ${generated.drafts.length}…`);
        const result = await saveNewsletterDrafts(editionDate, generated.drafts.slice(index, index + 5));
        replaced += Number(result.replaced ?? 0);
      }

      if (view !== viewToken.current) return;
      await load(editionDate);
      toast({
        title: "Section refreshed",
        description: `Removed from every newsletter and rebuilt ${replaced} draft${replaced === 1 ? "" : "s"} with personalized replacements.`,
      });
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Could not refresh section.");
      toast({
        title: "Could not refresh section",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusyKey(null);
      setProgress("");
    }
  };

  const busy = Boolean(busyKey) || listLoading;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Sections</h2>
          <p className="text-sm text-muted-foreground">
            Every unique card featured in edition {editionDate}, including ones that only reached a single reader. Sorted by how often they appear. Approve good sections, or refresh a bad one so only that story is regenerated—personalized per newsletter, not one blanket replacement.
          </p>
        </div>
        <label className="space-y-1 text-sm">
          <span>Edition date</span>
          <Input
            type="date"
            value={editionDate}
            disabled={busy}
            onChange={(event) => {
              if (!event.target.value) return;
              setActionError(null);
              void load(event.target.value);
            }}
          />
        </label>
      </div>

      {progress ? <p role="status" className="text-sm">{progress}</p> : null}
      {actionError ? (
        <Alert variant="destructive">
          <AlertTitle>Section action incomplete</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}
      {listError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load sections</AlertTitle>
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      ) : null}

      <Alert>
        <AlertTitle>
          {sections.length} unique section{sections.length === 1 ? "" : "s"} · {counts.pending} pending · {counts.approved} approved · {counts.rejected} rejected
        </AlertTitle>
        <AlertDescription>
          Refresh bans the current story everywhere and rebuilds only the newsletters that featured it. Each reader gets a new pick from their own taste and location signals.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="min-h-[640px]">
          <CardHeader className="space-y-3">
            <CardTitle className="text-base">Featured sections</CardTitle>
            <CardDescription>Most used to least used.</CardDescription>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search label, kind, or email"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["pending", "Pending"],
                  ["approved", "Approved"],
                  ["rejected", "Rejected"],
                  ["all", "All"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={statusFilter === value ? "default" : "outline"}
                  onClick={() => setStatusFilter(value)}
                >
                  {label}
                  {value !== "all" ? ` (${counts[value]})` : ""}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="max-h-[720px] space-y-2 overflow-y-auto">
            {listLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading sections
              </p>
            ) : null}
            {!listLoading && filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No sections in this view. Create or open an edition in Proofread first.
              </p>
            ) : null}
            {filtered.map((section) => {
              const active = section.contentKey === selectedKey;
              return (
                <button
                  key={section.contentKey}
                  type="button"
                  onClick={() => setSelectedKey(section.contentKey)}
                  className={`w-full rounded-md border px-3 py-2 text-left ${active ? "border-pink-600 bg-pink-50" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{section.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Used in {section.usageCount} newsletter{section.usageCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant="secondary">{section.kind}</Badge>
                      <Badge variant={section.status === "pending" ? "secondary" : "default"}>
                        {statusLabel(section.status)}
                      </Badge>
                    </div>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="min-h-[640px]">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">{selected ? selected.label : "Pick a section"}</CardTitle>
              <CardDescription>
                {selected
                  ? `Appears in ${selected.usageCount} newsletter${selected.usageCount === 1 ? "" : "s"}.`
                  : "Choose a featured card to approve, move, or refresh."}
              </CardDescription>
            </div>
            {selected ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy || selected.status === "approved"}
                  onClick={() => void moveSection(selected, "approved", {
                    toastTitle: "Section approved",
                    toastDescription: "Marked good for this edition’s review.",
                  })}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {busyKey === `${selected.contentKey}:approved` ? "Approving…" : "Approve"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void refreshSection(selected)}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {busyKey === `${selected.contentKey}:refresh` ? "Refreshing…" : "Refresh"}
                </Button>
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {selected ? (
              <>
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{selected.kind}</Badge>
                    <Badge>{statusLabel(selected.status)}</Badge>
                    <Badge variant="outline">
                      {selected.usageCount} use{selected.usageCount === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">{selected.label}</p>
                  {selected.url ? (
                    <a
                      className="break-all text-xs text-muted-foreground underline"
                      href={selected.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {selected.url}
                    </a>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Move to</p>
                  <div className="flex flex-wrap gap-2">
                    {(["pending", "approved", "rejected"] as const).map((status) => (
                      <Button
                        key={status}
                        type="button"
                        size="sm"
                        variant={selected.status === status ? "default" : "outline"}
                        disabled={busy || selected.status === status}
                        onClick={() => void moveSection(selected, status, {
                          applyVeto: status === "rejected",
                          toastTitle: `Moved to ${statusLabel(status)}`,
                          toastDescription: status === "rejected"
                            ? "Banned from future generations. Use Refresh to rebuild drafts that already include it."
                            : status === "approved"
                              ? "Cleared any global ban so this card can appear again."
                              : "Returned to the review queue and cleared any global ban.",
                        })}
                      >
                        {statusLabel(status)}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">Featured for</p>
                  <p className="text-xs text-muted-foreground">
                    {selected.emails.length} recipient{selected.emails.length === 1 ? "" : "s"}
                  </p>
                  <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                    {selected.emails.map((email) => (
                      <li key={email} className="truncate text-muted-foreground">{email}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a section from the list.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
