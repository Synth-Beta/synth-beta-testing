import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle, Loader2, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { generateDraftsFromSource } from "@/lib/newsletterEdition/gather";
import { nextEditionDate } from "@/lib/newsletterEdition/time";
import {
  approveDrafts,
  listNewsletterDrafts,
  loadNewsletterSource,
  NewsletterDraftRow,
  saveNewsletterDrafts,
  setDraftApproval,
} from "@/services/newsletterSendService";

type ReviewFilter = "pending" | "approved" | "sent" | "all";

const statusLabel = (status: NewsletterDraftRow["status"]) => {
  if (status === "approved") return "Approved";
  if (status === "sent") return "Sent";
  return "Needs review";
};

export default function NewsletterProofreader() {
  const { toast } = useToast();
  const editionDate = useMemo(() => nextEditionDate(new Date()), []);
  const [drafts, setDrafts] = useState<NewsletterDraftRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      setDrafts(await listNewsletterDrafts(editionDate));
    } catch (error: unknown) {
      setDrafts([]);
      setListError(error instanceof Error ? error.message : "Unable to load drafts.");
    } finally {
      setListLoading(false);
    }
  }, [editionDate]);

  useEffect(() => {
    void load();
  }, [load]);

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
    setRegenerating(true);
    try {
      const source = await loadNewsletterSource();
      const generated = await generateDraftsFromSource(source);
      for (let index = 0; index < generated.drafts.length; index += 15) {
        await saveNewsletterDrafts(generated.editionDate, generated.drafts.slice(index, index + 15));
      }
      toast({
        title: "Drafts regenerated",
        description: `${generated.drafts.length} newsletters are waiting for approval. ${generated.held} accounts had no sourced edition. Approved and sent copies were left as they were.`,
      });
      setCheckedIds([]);
      await load();
    } catch (error: unknown) {
      toast({
        title: "Could not regenerate",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setRegenerating(false);
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Proofread</h2>
          <p className="text-sm text-muted-foreground">
            Edition {editionDate}. Review the exact email, then approve it. Regeneration does not send, and it leaves approved or sent copies unchanged.
          </p>
        </div>
        <Button type="button" variant="outline" disabled={regenerating} onClick={() => void regenerate()}>
          {regenerating ? "Regenerating..." : "Regenerate unsent"}
        </Button>
      </div>

      <Alert>
        <AlertTitle>
          {approvedCount} of {drafts.length} approved
        </AlertTitle>
        <AlertDescription>
          The 10:00 a.m. Central send uses only approved drafts whose reviewed content still matches. Unapproved drafts stay unsent.
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
                  checked={allPendingChecked}
                  onCheckedChange={(checked) => setCheckedIds(checked ? pendingIds : [])}
                  aria-label="Select all newsletters that need review"
                />
                Select all
              </label>
              <Button type="button" size="sm" disabled={saving || checkedIds.length === 0} onClick={() => void approveIds(checkedIds)}>
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
                    disabled={draft.status !== "needs_approval"}
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
                  <Button type="button" variant="outline" disabled={saving} onClick={() => void setOne(selected, "needs_approval")}>
                    Remove approval
                  </Button>
                ) : (
                  <Button type="button" disabled={saving} onClick={() => void setOne(selected, "approved")}>
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
