import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, Loader2, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { generateDraftsFromSource } from "@/lib/newsletterEdition/gather";
import { NEWSLETTER_WRITER_MARK } from "@/lib/newsletterEdition/render";
import { centralCalendarDate } from "@/lib/newsletterEdition/time";
import {
  approveDrafts,
  listNewsletterDrafts,
  loadNewsletterSource,
  NewsletterDraftRow,
  saveNewsletterDrafts,
  setDraftApproval,
  sendApprovedEditionNow,
} from "@/services/newsletterSendService";

type ReviewFilter = "pending" | "approved" | "sent" | "all";

const statusLabel = (status: NewsletterDraftRow["status"]) => {
  if (status === "approved") return "Approved";
  if (status === "sent") return "Sent";
  return "Needs review";
};

const EDITION_WINDOW_DAYS = 21;

const newestEdition = (lists: Array<{ date: string; rows: NewsletterDraftRow[] }>) =>
  lists.reduce<{ date: string; rows: NewsletterDraftRow[] } | null>((best, item) => {
    if (!item.rows.length) return best;
    const stamp = item.rows.reduce((max, row) => (row.retrieved_at > max ? row.retrieved_at : max), "");
    if (!best) return item;
    const bestStamp = best.rows.reduce((max, row) => (row.retrieved_at > max ? row.retrieved_at : max), "");
    if (stamp > bestStamp || (stamp === bestStamp && item.date > best.date)) return item;
    return best;
  }, null);

const shiftIso = (iso: string, days: number) => {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

export default function NewsletterProofreader() {
  const { toast } = useToast();
  const [editionDate, setEditionDate] = useState(() => centralCalendarDate(new Date()));
  const [drafts, setDrafts] = useState<NewsletterDraftRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState("");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);
  const editionRef = useRef(editionDate);
  editionRef.current = editionDate;
  const viewToken = useRef(0);

  const showDrafts = useCallback((date: string, rows: NewsletterDraftRow[]) => {
    const ordered = [...rows].sort((left, right) => left.email.localeCompare(right.email));
    editionRef.current = date;
    setEditionDate(date);
    setDrafts(ordered);
    setReviewFilter("all");
    setQuery("");
    setSelectedId(ordered[0]?.id ?? null);
    setCheckedIds([]);
  }, []);

  const load = useCallback(async (date = editionRef.current) => {
    setListLoading(true);
    setListError(null);
    try {
      const rows = await listNewsletterDrafts(date);
      showDrafts(date, rows);
      return rows;
    } catch (error: unknown) {
      setDrafts([]);
      setListError(error instanceof Error ? error.message : "Unable to load drafts.");
      return [];
    } finally {
      setListLoading(false);
    }
  }, [showDrafts]);

  useEffect(() => {
    const token = ++viewToken.current;
    const today = centralCalendarDate(new Date());
    setListLoading(true);
    void (async () => {
      const dates = Array.from({ length: EDITION_WINDOW_DAYS }, (_, index) => shiftIso(today, index));
      const lists = await Promise.all(dates.map(async (date) => ({
        date,
        rows: await listNewsletterDrafts(date).catch(() => [] as NewsletterDraftRow[]),
      })));
      if (token !== viewToken.current) return;
      const newest = newestEdition(lists);
      showDrafts(newest?.date ?? today, newest?.rows ?? []);
      setListLoading(false);
    })();
  }, [showDrafts]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return drafts.filter((draft) => {
      if (reviewFilter === "pending" && draft.status !== "needs_approval") return false;
      if (reviewFilter === "approved" && draft.status !== "approved") return false;
      if (reviewFilter === "sent" && draft.status !== "sent") return false;
      if (!needle) return true;
      return [draft.email, draft.subject].some((value) => value.toLowerCase().includes(needle));
    });
  }, [drafts, query, reviewFilter]);

  const selected = drafts.find((draft) => draft.id === selectedId) ?? null;
  const pendingIds = filtered.filter((draft) => draft.status === "needs_approval").map((draft) => draft.id);
  const allPendingChecked = pendingIds.length > 0 && pendingIds.every((id) => checkedIds.includes(id));
  const approvedCount = drafts.filter((draft) => draft.status === "approved").length;

  const regenerate = async () => {
    const token = ++viewToken.current;
    setRegenerating(true);
    setGenerationError(null);
    setProgress("Loading recipient and music data…");
    try {
      const source = await loadNewsletterSource();
      const accountCount = Array.isArray(source.users) ? source.users.length : 0;
      const today = centralCalendarDate(new Date());
      let target = shiftIso(today, EDITION_WINDOW_DAYS);
      for (let index = 0; index < EDITION_WINDOW_DAYS; index += 1) {
        const date = shiftIso(today, index);
        const rows = await listNewsletterDrafts(date);
        if (rows.length === 0) {
          target = date;
          break;
        }
      }
      setProgress(`Building a new edition for ${target}…`);
      const generated = await generateDraftsFromSource(source, new Date(), target);
      setEligibleCount(generated.drafts.length + generated.held);
      if (!generated.drafts.length) {
        throw new Error(`No drafts were built. The account list returned ${accountCount} people.`);
      }
      const nowIso = new Date().toISOString();
      showDrafts(target, generated.drafts.map((draft) => ({
        id: `new:${draft.userId}`,
        edition_date: target,
        user_id: draft.userId,
        email: draft.email,
        subject: draft.subject,
        preheader: draft.preheader,
        html: draft.html,
        content_hash: draft.contentHash,
        sources: draft.sources,
        retrieved_at: nowIso,
        status: "needs_approval" as const,
        approved_content_hash: null,
        sent_at: null,
      })));
      let replaced = 0;
      let kept = 0;
      for (let index = 0; index < generated.drafts.length; index += 5) {
        setProgress(`Saving ${index + 1}–${Math.min(index + 5, generated.drafts.length)} of ${generated.drafts.length} new drafts for ${target}…`);
        const result = await saveNewsletterDrafts(target, generated.drafts.slice(index, index + 5));
        replaced += Number(result.replaced ?? 0);
        kept += Number(result.kept ?? 0);
      }
      const listed = await listNewsletterDrafts(target);
      if (token !== viewToken.current) return;
      if (listed.length) showDrafts(target, listed);
      if (listed.length < generated.drafts.length || replaced === 0) {
        throw new Error(`Built ${generated.drafts.length} drafts from ${accountCount} accounts for ${target}, but only ${listed.length} were stored (${replaced} writes).`);
      }
      toast({
        title: "New edition ready",
        description: `${listed.length} drafts are ready to review for ${target}.`,
      });
    } catch (error: unknown) {
      setGenerationError(error instanceof Error ? error.message : "Could not regenerate.");
      toast({
        title: "Could not regenerate",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setRegenerating(false);
      setProgress("");
    }
  };

  const setOne = async (draft: NewsletterDraftRow, status: "approved" | "needs_approval") => {
    setSaving(true);
    try {
      await setDraftApproval(draft.id, status);
      await load();
      toast({
        title: status === "approved" ? "Approved" : "Approval removed",
        description: status === "approved" ? "This exact version can send at 10:00 a.m. Central." : "This newsletter will stay unsent.",
      });
    } catch (error: unknown) {
      toast({
        title: "Could not update approval",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const approveIds = async (ids: string[]) => {
    if (!ids.length) return;
    setSaving(true);
    try {
      const result = await approveDrafts(editionDate, ids);
      await load();
      setCheckedIds([]);
      toast({ title: "Approved", description: `${result.approved ?? ids.length} newsletters can send.` });
    } catch (error: unknown) {
      toast({
        title: "Could not approve",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const sendNow = async () => {
    setSending(true);
    setGenerationError(null);
    setProgress("Sending approved drafts. Keep this page open while results load…");
    try {
      const result = await sendApprovedEditionNow(editionDate);
      const summary = `${result.successCount ?? 0} sent; ${result.failureCount ?? 0} failed or skipped.`;
      if (result.failureCount) setGenerationError(`${summary} ${result.failures?.[0]?.error ?? "Review failed recipients before retrying."}`);
      toast({ title: "Send results", description: summary });
    } catch (error: unknown) {
      setGenerationError(error instanceof Error ? error.message : "Send failed. Refresh drafts before retrying.");
    } finally {
      await load();
      setProgress("");
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Proofread</h2>
          <p className="text-sm text-muted-foreground">
            Showing edition {editionDate}. Create new edition opens the new date here. A refresh keeps the newest edition, not an older one.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm">
            <span>Edition date</span>
            <Input type="date" value={editionDate} disabled={regenerating || saving || sending} onChange={(event) => {
              if (!event.target.value) return;
              setEligibleCount(null);
              setGenerationError(null);
              void load(event.target.value);
            }} />
          </label>
        <Button type="button" variant="outline" disabled={regenerating || saving || sending || listLoading} onClick={() => void regenerate()}>
          {regenerating ? "Creating..." : "Create new edition"}
        </Button>
        <Button type="button" disabled={regenerating || saving || sending || listLoading || approvedCount === 0} onClick={() => void sendNow()}>
          {sending ? "Sending..." : `Send ${approvedCount} approved now`}
        </Button>
        </div>
      </div>

      {progress ? <p role="status" className="text-sm">{progress}</p> : null}
      {generationError ? <Alert variant="destructive"><AlertTitle>Newsletter action incomplete</AlertTitle><AlertDescription>{generationError} Check the edition date above before trying again.</AlertDescription></Alert> : null}
      {selected && !selected.html.includes(NEWSLETTER_WRITER_MARK) ? (
        <Alert>
          <AlertTitle>This is an older edition</AlertTitle>
          <AlertDescription>
            These drafts were written by an earlier version. Create new edition, wait until it says the new date is ready, and read that date.
          </AlertDescription>
        </Alert>
      ) : null}
      <Alert>
        <AlertTitle>
          {approvedCount} of {drafts.length} stored drafts approved{eligibleCount !== null ? ` · ${eligibleCount} eligible recipients` : ""}
        </AlertTitle>
        <AlertDescription>
          The 10:00 a.m. Central send uses only approved drafts whose reviewed content still matches. Unapproved drafts stay unsent. Use “Send approved now” to send this edition immediately after review.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="min-h-[640px]">
          <CardHeader className="space-y-3">
            <CardTitle className="text-base">Recipients</CardTitle>
            <CardDescription>Stored drafts for this edition.</CardDescription>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search email or subject" className="pl-9" />
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["pending", "Needs review"],
                  ["approved", "Approved"],
                  ["sent", "Sent"],
                  ["all", "All"],
                ] as const
              ).map(([value, label]) => (
                <Button key={value} type="button" size="sm" variant={reviewFilter === value ? "default" : "outline"} onClick={() => setReviewFilter(value)}>
                  {label}
                </Button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  disabled={regenerating || saving || sending}
                  checked={allPendingChecked}
                  onCheckedChange={(checked) => setCheckedIds(checked ? pendingIds : [])}
                  aria-label="Select all newsletters that need review"
                />
                Select all
              </label>
              <Button type="button" size="sm" disabled={saving || regenerating || sending || checkedIds.length === 0} onClick={() => void approveIds(checkedIds)}>
                Approve selected
              </Button>
            </div>
          </CardHeader>
          <CardContent className="max-h-[720px] space-y-2 overflow-y-auto">
            {listLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading drafts
              </p>
            ) : null}
            {listError ? <p className="text-sm text-destructive">{listError}</p> : null}
            {!listLoading && !listError && filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">No drafts in this view. Regenerate the unsent edition to create them.</p>
            ) : null}
            {filtered.map((draft) => {
              const active = draft.id === selectedId;
              return (
                <div key={draft.id} className={`flex items-start gap-2 rounded-md border px-3 py-2 ${active ? "border-pink-600 bg-pink-50" : ""}`}>
                  <Checkbox
                    checked={checkedIds.includes(draft.id)}
                    disabled={regenerating || saving || sending || draft.status !== "needs_approval"}
                    onCheckedChange={(checked) =>
                      setCheckedIds((current) => (checked ? [...current, draft.id] : current.filter((id) => id !== draft.id)))
                    }
                    aria-label={`Select ${draft.email}`}
                  />
                  <button type="button" onClick={() => setSelectedId(draft.id)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{draft.email}</p>
                        <p className="truncate text-xs text-muted-foreground">{draft.subject}</p>
                      </div>
                      <Badge variant={draft.status === "needs_approval" ? "secondary" : "default"}>{statusLabel(draft.status)}</Badge>
                    </div>
                  </button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="min-h-[640px]">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">{selected ? selected.email : "Pick a recipient"}</CardTitle>
              <CardDescription>
                {selected ? "This is the stored email. Approving it locks this exact version." : "Choose a draft to proofread it."}
              </CardDescription>
            </div>
            {selected && selected.status !== "sent" ? (
              <div className="flex flex-wrap gap-2">
                {selected.status === "approved" ? (
                  <Button type="button" variant="outline" disabled={saving || regenerating || sending} onClick={() => void setOne(selected, "needs_approval")}>
                    Remove approval
                  </Button>
                ) : (
                  <Button type="button" disabled={saving || regenerating || sending} onClick={() => void setOne(selected, "approved")}>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                )}
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {selected ? (
              <>
                <div className="overflow-hidden rounded-md border bg-[#F5F5F5]">
                  <iframe title="Recipient newsletter" srcDoc={selected.html} className="h-[760px] w-full bg-white" />
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>Retrieved {new Date(selected.retrieved_at).toLocaleString()}</p>
                  {(selected.sources ?? []).map((source) => (
                    <p key={source.url}>
                      {source.label}:{" "}
                      <a className="underline" href={source.url} target="_blank" rel="noreferrer">
                        {source.url}
                      </a>
                    </p>
                  ))}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
